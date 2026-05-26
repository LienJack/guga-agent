import { describe, expect, it, vi } from "vitest";
import { AgentEventType } from "../contracts/events";
import type { PermissionRequest } from "../contracts/permissions";
import type { ToolDefinition } from "../contracts/tools";
import { EventBus } from "../events/event-bus";
import { PermissionKernel } from "./permission-kernel";

const baseCall = { id: "call-1", name: "echo", input: { value: "hi" } };

describe("PermissionKernel", () => {
  it("allows read-only tools by default without asking the host", async () => {
    const resolver = vi.fn();
    const eventBus = new EventBus();
    const kernel = new PermissionKernel({ eventBus, resolver });

    const result = await kernel.resolve({
      request: requestFor(readTool()),
      tool: readTool()
    });

    expect(result).toMatchObject({ ok: true, decision: { action: "allow", source: "profile" } });
    expect(resolver).not.toHaveBeenCalled();
    expect(eventBus.events.map((event) => event.type)).toEqual([AgentEventType.PermissionResolved]);
  });

  it("asks the host for execute-effect tools and only allows after allow once", async () => {
    const resolver = vi.fn().mockResolvedValue({
      action: "allow",
      remember: "once",
      source: "host",
      reason: "approved"
    });
    const kernel = new PermissionKernel({ resolver });

    const result = await kernel.resolve({
      request: requestFor(executeTool()),
      tool: executeTool()
    });

    expect(resolver).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ ok: true, decision: { action: "allow", source: "host" } });
  });

  it("remembers session allow decisions for matching permission scope", async () => {
    const resolver = vi.fn().mockResolvedValue({
      action: "allow",
      remember: "session",
      source: "host",
      reason: "approved for session"
    });
    const kernel = new PermissionKernel({ resolver });
    const tool = executeTool();

    await kernel.resolve({ request: requestFor(tool), tool });
    const result = await kernel.resolve({ request: requestFor(tool), tool });

    expect(resolver).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ ok: true, decision: { action: "allow", source: "remembered" } });
  });

  it("returns a structured denied tool result and does not allow execution", async () => {
    const kernel = new PermissionKernel({
      resolver: () => ({
        action: "deny",
        remember: "once",
        source: "host",
        reason: "not now"
      })
    });

    const result = await kernel.resolve({
      request: requestFor(executeTool()),
      tool: executeTool()
    });

    expect(result).toMatchObject({
      ok: false,
      result: {
        ok: false,
        error: { code: "TOOL_PERMISSION_DENIED", message: "not now" }
      }
    });
  });

  it("remembers session deny decisions and skips repeated asks", async () => {
    const resolver = vi.fn().mockResolvedValue({
      action: "deny",
      remember: "session",
      source: "host",
      reason: "never"
    });
    const kernel = new PermissionKernel({ resolver });
    const tool = executeTool();

    await kernel.resolve({ request: requestFor(tool), tool });
    const result = await kernel.resolve({ request: requestFor(tool), tool });

    expect(resolver).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      ok: false,
      decision: { action: "deny", source: "remembered" },
      result: { error: { code: "TOOL_PERMISSION_DENIED" } }
    });
  });

  it("auto-denies ask-required tools in headless and background profiles", async () => {
    const resolver = vi.fn();
    const kernel = new PermissionKernel({ profile: "headless", resolver });

    const result = await kernel.resolve({
      request: requestFor(executeTool(), { profile: "headless" }),
      tool: executeTool()
    });

    expect(resolver).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      decision: { action: "deny", source: "profile" },
      result: { error: { code: "TOOL_PERMISSION_UNAVAILABLE" } }
    });
  });

  it("uses the configured runtime profile instead of a default request profile", async () => {
    const resolver = vi.fn();
    const kernel = new PermissionKernel({ profile: "headless", resolver });

    const result = await kernel.resolve({
      request: requestFor(executeTool(), { profile: "default" }),
      tool: executeTool()
    });

    expect(resolver).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      decision: { action: "deny", source: "profile" },
      result: { error: { code: "TOOL_PERMISSION_UNAVAILABLE" } }
    });
  });

  it("turns permission resolver timeout into a structured not-executed result", async () => {
    const eventBus = new EventBus();
    const kernel = new PermissionKernel({
      eventBus,
      timeoutMs: 1,
      resolver: () => new Promise(() => undefined)
    });

    const result = await kernel.resolve({
      request: requestFor(executeTool()),
      tool: executeTool()
    });

    expect(result).toMatchObject({
      ok: false,
      decision: { action: "deny", source: "host" },
      result: { error: { code: "TOOL_PERMISSION_TIMEOUT" } }
    });
    expect(eventBus.events.map((event) => event.type)).toEqual([
      AgentEventType.PermissionRequested,
      AgentEventType.PermissionResolved
    ]);
  });

  it("turns an already cancelled permission signal into a structured cancelled result", async () => {
    const controller = new AbortController();
    controller.abort();
    const resolver = vi.fn();
    const kernel = new PermissionKernel({ resolver });

    const result = await kernel.resolve({
      request: requestFor(executeTool()),
      tool: executeTool(),
      signal: controller.signal
    });

    expect(result).toMatchObject({
      ok: false,
      decision: { action: "deny", source: "host" },
      result: { error: { code: "TOOL_PERMISSION_CANCELLED" } }
    });
    expect(resolver).not.toHaveBeenCalled();
  });

  it("turns a mid-flight permission abort into a structured cancelled result", async () => {
    const controller = new AbortController();
    const kernel = new PermissionKernel({
      resolver: () => new Promise(() => undefined)
    });
    const pending = kernel.resolve({
      request: requestFor(executeTool()),
      tool: executeTool(),
      signal: controller.signal
    });

    controller.abort();

    await expect(pending).resolves.toMatchObject({
      ok: false,
      decision: { action: "deny", source: "host" },
      result: { error: { code: "TOOL_PERMISSION_CANCELLED" } }
    });
  });

  it("turns permission resolver rejection into a structured not-executed result", async () => {
    const kernel = new PermissionKernel({
      resolver: async () => {
        throw new Error("resolver cancelled");
      }
    });

    const result = await kernel.resolve({
      request: requestFor(executeTool()),
      tool: executeTool()
    });

    expect(result).toMatchObject({
      ok: false,
      decision: { action: "deny", source: "host", reason: "resolver cancelled" },
      result: { error: { code: "TOOL_PERMISSION_DENIED", message: "resolver cancelled" } }
    });
  });

  it("lets plugin metadata force a deny while PermissionKernel records the final decision", async () => {
    const kernel = new PermissionKernel();
    const tool = {
      ...readTool(),
      runtime: {
        permission: { defaultAction: "deny" as const, reason: "plugin policy" }
      }
    };

    const result = await kernel.resolve({ request: requestFor(tool), tool });

    expect(result).toMatchObject({
      ok: false,
      decision: { action: "deny", source: "plugin", reason: "plugin policy" }
    });
  });
});

function requestFor(
  tool: ToolDefinition,
  overrides: Partial<PermissionRequest> = {}
): PermissionRequest {
  return {
    runId: "run-permission",
    turn: 0,
    toolCallId: baseCall.id,
    attempt: 1,
    call: { ...baseCall, name: tool.name },
    profile: "default",
    subject: {
      toolName: tool.name,
      effect: tool.effect
    },
    ...overrides
  };
}

function readTool(): ToolDefinition {
  return {
    name: "read",
    description: "Read",
    inputSchema: { type: "object" },
    effect: "read",
    execute() {
      return { ok: true, content: "ok" };
    }
  };
}

function executeTool(): ToolDefinition {
  return {
    name: "execute",
    description: "Execute",
    inputSchema: { type: "object" },
    effect: "execute",
    execute() {
      return { ok: true, content: "ok" };
    }
  };
}
