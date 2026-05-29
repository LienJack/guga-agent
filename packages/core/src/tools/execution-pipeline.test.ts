import { describe, expect, it, vi } from "vitest";
import { AgentEventType } from "../contracts/events";
import { HookEffect, HookPhase } from "../contracts/hooks";
import type { DurableEventEnvelope, EventStore } from "../contracts/persistence";
import type { ToolDefinition } from "../contracts/tools";
import { EventBus } from "../events/event-bus";
import { HookKernel } from "../hooks/hook-kernel";
import { PermissionKernel } from "../permissions/permission-kernel";
import { CapabilityRegistry } from "../registry/capability-registry";
import { ExecutionPipeline } from "./execution-pipeline";
import { ResultPolicy } from "./result-policy";

describe("ExecutionPipeline", () => {
  it("executes a custom plugin tool through validation, permission, execution, and result policy", async () => {
    const registry = new CapabilityRegistry();
    const eventBus = new EventBus();
    registry.registerTool(readTool({ name: "echo", content: "hello" }));
    const pipeline = new ExecutionPipeline({ registry, eventBus });

    const result = await pipeline.execute({
      runId: "run-pipeline",
      turn: 0,
      call: { id: "call-1", name: "echo", input: { value: "hi" } }
    });

    expect(result.result).toEqual({ ok: true, content: "hello" });
    expect(eventBus.events.map((event) => event.type)).toEqual([
      AgentEventType.ToolQueued,
      AgentEventType.PermissionResolved,
      AgentEventType.ToolStarted,
      AgentEventType.ToolResult,
      AgentEventType.ToolCompleted
    ]);
  });

  it("applies tool.call.before patches before permission and execution", async () => {
    const registry = new CapabilityRegistry();
    const eventBus = new EventBus();
    const hookKernel = new HookKernel({ eventBus });
    const execute = vi.fn((input) => ({ ok: true as const, content: JSON.stringify(input) }));
    registry.registerTool(readTool({ name: "patchable", execute }));
    hookKernel.registerHook("patch-plugin", 0, {
      id: "patch-input",
      phase: HookPhase.ToolCallBefore,
      effect: HookEffect.Patch,
      handler() {
        return { type: "patch", input: { value: "patched" } };
      }
    });
    const pipeline = new ExecutionPipeline({ registry, eventBus, hookKernel });

    const result = await pipeline.execute({
      runId: "run-patch",
      turn: 0,
      call: { id: "call-patch", name: "patchable", input: { value: "original" } }
    });

    expect(execute).toHaveBeenCalledWith(
      { value: "patched" },
      expect.objectContaining({ call: expect.objectContaining({ input: { value: "patched" } }) })
    );
    expect(result.result).toMatchObject({ ok: true, content: "{\"value\":\"patched\"}" });
    expect(eventBus.events).toContainEqual(expect.objectContaining({
      type: AgentEventType.HookDecision,
      correlation: expect.objectContaining({ toolCallId: "call-patch" })
    }));
  });

  it("aborts the tool context signal when execution times out", async () => {
    const registry = new CapabilityRegistry();
    let aborted = false;
    registry.registerTool({
      ...readTool({ name: "abort-on-timeout" }),
      runtime: { timeoutMs: 1 },
      execute(_input, context) {
        return new Promise((resolve) => {
          context.signal?.addEventListener("abort", () => {
            aborted = true;
            resolve({ ok: false, error: { code: "ABORTED", message: "aborted" } });
          });
        });
      }
    });
    const pipeline = new ExecutionPipeline({ registry });

    const result = await pipeline.execute({
      runId: "run-timeout-abort",
      turn: 0,
      call: { id: "call-timeout-abort", name: "abort-on-timeout", input: {} }
    });

    expect(result.result).toMatchObject({
      ok: false,
      error: { code: "TOOL_TIMEOUT" }
    });
    expect(aborted).toBe(true);
  });

  it("returns schema validation failures without permission or execution", async () => {
    const registry = new CapabilityRegistry();
    const resolver = vi.fn();
    const execute = vi.fn();
    registry.registerTool(
      readTool({
        name: "needs-path",
        inputSchema: { type: "object", required: ["path"] },
        execute
      })
    );
    const pipeline = new ExecutionPipeline({
      registry,
      permissionKernel: new PermissionKernel({ resolver })
    });

    const result = await pipeline.execute({
      runId: "run-schema",
      turn: 0,
      call: { id: "call-schema", name: "needs-path", input: {} }
    });

    expect(result.result).toMatchObject({
      ok: false,
      error: { code: "TOOL_SCHEMA_INVALID" }
    });
    expect(resolver).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("validates nested JSON schema types, enums, and extra properties before execution", async () => {
    const registry = new CapabilityRegistry();
    const execute = vi.fn();
    registry.registerTool(
      readTool({
        name: "strict",
        inputSchema: {
          type: "object",
          required: ["mode", "options"],
          additionalProperties: false,
          properties: {
            mode: { type: "string", enum: ["read", "write"] },
            options: {
              type: "object",
              required: ["count"],
              properties: { count: { type: "integer" } },
              additionalProperties: false
            }
          }
        },
        execute
      })
    );
    const pipeline = new ExecutionPipeline({ registry });

    const result = await pipeline.execute({
      runId: "run-strict-schema",
      turn: 0,
      call: { id: "call-strict-schema", name: "strict", input: { mode: "delete", options: { count: "1" }, extra: true } }
    });

    expect(result.result).toMatchObject({
      ok: false,
      error: { code: "TOOL_SCHEMA_INVALID" }
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("blocks execution on tool.execute.before block decisions", async () => {
    const registry = new CapabilityRegistry();
    const hookKernel = new HookKernel();
    const execute = vi.fn();
    registry.registerTool(readTool({ name: "blocked", execute }));
    hookKernel.registerHook("gate-plugin", 0, {
      id: "block-execute",
      phase: HookPhase.ToolExecuteBefore,
      effect: HookEffect.Gate,
      handler() {
        return { type: "block", reason: "blocked before execution" };
      }
    });
    const pipeline = new ExecutionPipeline({ registry, hookKernel });

    const result = await pipeline.execute({
      runId: "run-block",
      turn: 0,
      call: { id: "call-block", name: "blocked", input: {} }
    });

    expect(execute).not.toHaveBeenCalled();
    expect(result.result).toMatchObject({
      ok: false,
      error: { code: "TOOL_CALL_BLOCKED", message: "blocked before execution" }
    });
  });

  it("normalizes tool exceptions and still emits result events", async () => {
    const registry = new CapabilityRegistry();
    const eventBus = new EventBus();
    registry.registerTool(
      readTool({
        name: "boom",
        execute() {
          throw new Error("Kaboom");
        }
      })
    );
    const pipeline = new ExecutionPipeline({ registry, eventBus });

    const result = await pipeline.execute({
      runId: "run-boom",
      turn: 0,
      call: { id: "call-boom", name: "boom", input: {} }
    });

    expect(result.result).toMatchObject({
      ok: false,
      error: { code: "TOOL_EXECUTION_FAILED", message: "Kaboom" }
    });
    expect(eventBus.events.map((event) => event.type)).toContain(AgentEventType.ToolFailed);
  });

  it("does not execute a tool when the durable start marker fails", async () => {
    const registry = new CapabilityRegistry();
    const execute = vi.fn(() => ({ ok: true as const, content: "should not run" }));
    registry.registerTool(readTool({ name: "side-effect", execute }));
    const eventBus = durableEventBus({ failTypes: new Set([AgentEventType.ToolStarted]) });
    const pipeline = new ExecutionPipeline({ registry, eventBus });

    const result = await pipeline.execute({
      runId: "run-durable-tool",
      turn: 0,
      call: { id: "call-durable", name: "side-effect", input: {} }
    });

    expect(execute).not.toHaveBeenCalled();
    expect(result.result).toMatchObject({
      ok: false,
      error: { code: "TOOL_PERSISTENCE_UNAVAILABLE" }
    });
    expect(eventBus.events.map((event) => event.type)).not.toContain(AgentEventType.ToolStarted);
  });

  it("returns an uncertain tool result when the durable terminal marker fails after execution", async () => {
    const registry = new CapabilityRegistry();
    const execute = vi.fn(() => ({ ok: true as const, content: "ran" }));
    registry.registerTool(readTool({ name: "terminal-fail", execute }));
    const eventBus = durableEventBus({ failTypes: new Set([AgentEventType.ToolCompleted]) });
    const pipeline = new ExecutionPipeline({ registry, eventBus });

    const result = await pipeline.execute({
      runId: "run-terminal-fail",
      turn: 0,
      call: { id: "call-terminal", name: "terminal-fail", input: {} }
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(result.result).toMatchObject({
      ok: true,
      metadata: { persistenceStatus: "interrupted" }
    });
    expect(eventBus.events.map((event) => event.type)).toContain(AgentEventType.ToolStarted);
    expect(eventBus.events.map((event) => event.type)).not.toContain(AgentEventType.ToolCompleted);
  });

  it("applies each tool's result budget metadata", async () => {
    const registry = new CapabilityRegistry();
    registry.registerTool({
      ...readTool({ name: "budgeted", content: "0123456789" }),
      runtime: { resultBudget: { maxContentChars: 4, strategy: "truncate" } }
    });
    const pipeline = new ExecutionPipeline({ registry });

    const result = await pipeline.execute({
      runId: "run-budget",
      turn: 0,
      call: { id: "call-budget", name: "budgeted", input: {} }
    });

    expect(result.result).toMatchObject({
      ok: true,
      content: expect.stringContaining("Tool output preview omitted"),
      budget: {
        applied: true,
        originalContentChars: 10,
        reference: expect.objectContaining({ type: "buffer" })
      }
    });
  });

  it("blocks tool.execute.before input patches after permission resolution", async () => {
    const registry = new CapabilityRegistry();
    const hookKernel = new HookKernel();
    const execute = vi.fn();
    registry.registerTool(readTool({ name: "late-patch", execute }));
    hookKernel.registerHook("patch-plugin", 0, {
      id: "late-patch",
      phase: HookPhase.ToolExecuteBefore,
      effect: HookEffect.Gate,
      handler() {
        return { type: "patch", input: { value: "changed after permission" } };
      }
    });
    const pipeline = new ExecutionPipeline({ registry, hookKernel });

    const result = await pipeline.execute({
      runId: "run-late-patch",
      turn: 0,
      call: { id: "call-late-patch", name: "late-patch", input: { value: "approved" } }
    });

    expect(execute).not.toHaveBeenCalled();
    expect(result.result).toMatchObject({
      ok: false,
      error: { code: "TOOL_CALL_BLOCKED", message: "tool.execute.before hooks cannot patch input after permission resolution" }
    });
  });

  it("includes command and resource scope summaries in permission requests", async () => {
    const registry = new CapabilityRegistry();
    const resolver = vi.fn().mockResolvedValue({
      action: "allow",
      remember: "session",
      source: "host"
    });
    registry.registerTool({
      ...readTool({ name: "shell_exec", content: "ok" }),
      effect: "execute",
      runtime: {
        permission: { defaultAction: "ask", scope: "command" },
        scheduler: {
          concurrency: "serial",
          resources: {
            mode: "extractor",
            extract: (input) => [{ kind: "shell", access: "execute", value: String((input as { command: string }).command) }]
          }
        }
      }
    });
    const pipeline = new ExecutionPipeline({
      registry,
      permissionKernel: new PermissionKernel({ resolver })
    });

    await pipeline.execute({
      runId: "run-scope",
      turn: 0,
      call: { id: "call-scope", name: "shell_exec", input: { command: "echo one" } },
      source: "verification",
      taskId: "task-1"
    });

    expect(resolver).toHaveBeenCalledWith(expect.objectContaining({
      metadata: {
        source: "verification",
        taskId: "task-1"
      },
      subject: expect.objectContaining({
        commandSummary: "echo one",
        resourceSummary: "shell:execute:echo one"
      })
    }));
  });

  it("does not execute tools that are hidden or unavailable", async () => {
    const registry = new CapabilityRegistry();
    const execute = vi.fn();
    registry.registerTool({
      ...readTool({ name: "hidden", execute }),
      runtime: { visibility: "hidden" }
    });
    const pipeline = new ExecutionPipeline({ registry });

    const result = await pipeline.execute({
      runId: "run-hidden",
      turn: 0,
      call: { id: "call-hidden", name: "hidden", input: {} }
    });

    expect(execute).not.toHaveBeenCalled();
    expect(result.result).toMatchObject({
      ok: false,
      error: { code: "TOOL_UNAVAILABLE" }
    });
  });

  it("does not execute dynamically unavailable tools", async () => {
    const registry = new CapabilityRegistry();
    const execute = vi.fn();
    registry.registerTool({
      ...readTool({ name: "dynamic-unavailable", execute }),
      runtime: {
        availability: (context) => context.workspaceRoot
          ? { status: "available" }
          : { status: "outside-workspace", reason: "workspace root missing" }
      }
    });
    const pipeline = new ExecutionPipeline({ registry });

    const result = await pipeline.execute({
      runId: "run-dynamic-unavailable",
      turn: 0,
      call: { id: "call-dynamic-unavailable", name: "dynamic-unavailable", input: {} }
    });

    expect(execute).not.toHaveBeenCalled();
    expect(result.result).toMatchObject({
      ok: false,
      error: { code: "TOOL_UNAVAILABLE", message: "workspace root missing" }
    });
  });

  it("returns a synthetic cancelled result when aborted before execution", async () => {
    const registry = new CapabilityRegistry();
    const controller = new AbortController();
    controller.abort();
    registry.registerTool(readTool({ name: "cancelled" }));
    const pipeline = new ExecutionPipeline({ registry });

    const result = await pipeline.execute({
      runId: "run-cancelled",
      turn: 0,
      call: { id: "call-cancelled", name: "cancelled", input: {} },
      signal: controller.signal
    });

    expect(result).toMatchObject({
      reason: "cancelled",
      result: {
        ok: false,
        error: { code: "TOOL_CANCELLED" },
        metadata: { synthetic: true, reason: "cancelled" }
      }
    });
  });

  it("fails closed when a dangerous tool hook times out", async () => {
    const registry = new CapabilityRegistry();
    const hookKernel = new HookKernel();
    const execute = vi.fn();
    registry.registerTool(readTool({ name: "slow-hook", execute }));
    hookKernel.registerHook("slow-plugin", 0, {
      id: "slow-hook",
      phase: HookPhase.ToolExecuteBefore,
      effect: HookEffect.Gate,
      control: { timeoutMs: 1 },
      handler() {
        return new Promise(() => undefined);
      }
    });
    const pipeline = new ExecutionPipeline({ registry, hookKernel });

    const result = await pipeline.execute({
      runId: "run-slow-hook",
      turn: 0,
      call: { id: "call-slow-hook", name: "slow-hook", input: {} }
    });

    expect(execute).not.toHaveBeenCalled();
    expect(result.result).toMatchObject({
      ok: false,
      error: { code: "TOOL_CALL_BLOCKED", message: "Tool hook timed out" }
    });
  });

  it("emits timeout lifecycle events for permission timeouts", async () => {
    const registry = new CapabilityRegistry();
    const eventBus = new EventBus();
    registry.registerTool({
      ...readTool({ name: "needs-permission" }),
      effect: "execute",
      runtime: { permission: { defaultAction: "ask" } }
    });
    const pipeline = new ExecutionPipeline({
      registry,
      eventBus,
      permissionKernel: new PermissionKernel({
        eventBus,
        timeoutMs: 1,
        resolver: () => new Promise(() => undefined)
      })
    });

    const result = await pipeline.execute({
      runId: "run-permission-timeout",
      turn: 0,
      call: { id: "call-permission-timeout", name: "needs-permission", input: {} }
    });

    expect(result.result).toMatchObject({
      ok: false,
      error: { code: "TOOL_PERMISSION_TIMEOUT" }
    });
    expect(eventBus.events.map((event) => event.type)).toContain(AgentEventType.ToolTimeout);
  });

  it("turns tool execution timeout into a structured timeout result", async () => {
    const registry = new CapabilityRegistry();
    const eventBus = new EventBus();
    registry.registerTool({
      ...readTool({ name: "slow-tool" }),
      runtime: { timeoutMs: 1 },
      execute() {
        return new Promise(() => undefined);
      }
    });
    const pipeline = new ExecutionPipeline({ registry, eventBus });

    const result = await pipeline.execute({
      runId: "run-tool-timeout",
      turn: 0,
      call: { id: "call-tool-timeout", name: "slow-tool", input: {} }
    });

    expect(result.result).toMatchObject({
      ok: false,
      error: { code: "TOOL_TIMEOUT" }
    });
    expect(eventBus.events.map((event) => event.type)).toContain(AgentEventType.ToolTimeout);
  });
});

function readTool(options: {
  name: string;
  content?: string;
  inputSchema?: unknown;
  execute?: ToolDefinition["execute"];
}): ToolDefinition {
  return {
    name: options.name,
    description: options.name,
    inputSchema: options.inputSchema ?? { type: "object" },
    effect: "read",
    execute: options.execute ?? (() => ({ ok: true, content: options.content ?? "ok" }))
  };
}

function durableEventBus(options: { failTypes?: Set<string> } = {}): EventBus {
  const events: DurableEventEnvelope[] = [];
  const store: EventStore = {
    append(event) {
      if (options.failTypes?.has(event.eventType)) {
        return { ok: false, status: "unavailable", reason: `failed ${event.eventType}` };
      }
      events.push(event);
      return { ok: true, status: "appended", event, streamRevision: event.streamRevision };
    },
    readStream() {
      return { ok: true, events, nextRevision: events.length };
    }
  };
  return new EventBus({
    durableContext: () => ({
      eventStore: store,
      session: { sessionId: "session-1", branchId: "main" }
    })
  });
}
