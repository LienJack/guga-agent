import { describe, expect, it, vi } from "vitest";
import { createAgentRuntime } from "@guga-agent/core";
import {
  buildDelegationInput,
  createAgentDelegationPlugin,
  createDelegateTaskTool,
  createDelegationLedger,
  validateDelegationConfig
} from "./index";

const call = { id: "call-1", name: "delegate_task", input: {} };

describe("plugin-agent-delegation", () => {
  it("runs an isolated child task and returns compact correlation metadata", async () => {
    const runner = vi.fn(async (request) => ({
      status: "completed" as const,
      summary: `handled ${request.goal}`,
      events: [
        { type: "model.responded", count: 1 },
        { type: "run.started", count: 1 }
      ]
    }));
    const tool = createDelegateTaskTool({
      childRunner: runner,
      parentRunId: "parent-run",
      toolCatalog: [
        { name: "read_file", description: "Read", effect: "read" },
        { name: "run_tests", description: "Test", effect: "execute" }
      ]
    });

    const result = await tool.execute({
      goal: "inspect tests",
      context: "focus on fixtures",
      agentType: "review",
      toolAllowlist: ["run_tests", "read_file"],
      maxTurns: 2,
      timeoutMs: 1000
    }, { call });

    expect(result).toMatchObject({
      ok: true,
      content: expect.stringContaining("Delegated task completed."),
      metadata: {
        delegation: {
          parentRunId: "parent-run",
          parentToolCallId: "call-1",
          childRunId: "call-1-child",
          childSessionId: "parent-run/child/call-1-child",
          agentType: "review",
          status: "completed",
          tools: ["read_file", "run_tests"],
          events: [
            { type: "model.responded", count: 1 },
            { type: "run.started", count: 1 }
          ]
        }
      }
    });
    expect(runner).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.stringContaining("Goal:\ninspect tests"),
      context: "focus on fixtures",
      maxTurns: 2,
      timeoutMs: 1000,
      tools: ["read_file", "run_tests"]
    }));
  });

  it("rejects invalid input before running a child", async () => {
    const runner = vi.fn();
    const tool = createDelegateTaskTool({ childRunner: runner });

    const result = await tool.execute({ goal: " " }, { call });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "DELEGATION_INPUT_INVALID",
        details: [expect.objectContaining({ code: "DELEGATION_GOAL_REQUIRED" })]
      }
    });
    expect(runner).not.toHaveBeenCalled();
  });

  it("blocks recursive delegation tools by default", async () => {
    const tool = createDelegateTaskTool({
      childRunner: vi.fn(),
      toolCatalog: [{ name: "delegate_task", description: "Delegate", effect: "external" }]
    });

    const result = await tool.execute({ goal: "loop", toolAllowlist: ["delegate_task"] }, { call });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "DELEGATION_RECURSION_BLOCKED",
        message: expect.stringContaining("delegate_task")
      }
    });
  });

  it("rejects unavailable allowlisted tools when a parent catalog is provided", async () => {
    const tool = createDelegateTaskTool({
      childRunner: vi.fn(),
      toolCatalog: [{ name: "read_file", description: "Read", effect: "read" }]
    });

    const result = await tool.execute({ goal: "test", toolAllowlist: ["shell"] }, { call });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "DELEGATION_TOOL_UNAVAILABLE",
        details: { unavailable: ["shell"] }
      }
    });
  });

  it("returns failure output from the child as a tool failure with metadata", async () => {
    const tool = createDelegateTaskTool({
      parentRunId: "parent",
      childRunner: async () => ({
        status: "failed",
        summary: "review found blocking issue"
      })
    });

    const result = await tool.execute({ goal: "review" }, { call });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "DELEGATION_FAILED",
        message: "review found blocking issue"
      },
      metadata: {
        delegation: {
          parentRunId: "parent",
          status: "failed"
        }
      }
    });
  });

  it("passes abort signals through to the child runner", async () => {
    const controller = new AbortController();
    const runner = vi.fn(async (request) => {
      expect(request.signal).toBe(controller.signal);
      return { status: "completed" as const, summary: "ok" };
    });
    const tool = createDelegateTaskTool({ childRunner: runner });

    await tool.execute({ goal: "test" }, { call, signal: controller.signal });

    expect(runner).toHaveBeenCalledOnce();
  });

  it("builds deterministic ledgers and delegation prompts", () => {
    expect(buildDelegationInput({
      goal: "Summarize",
      context: "Only docs",
      toolAllowlist: ["search"]
    }, "research", ["search"])).toContain("Allowed tools:\n- search");

    expect(createDelegationLedger([
      {
        parentRunId: "b",
        parentToolCallId: "2",
        childRunId: "child-b",
        childSessionId: "session-b",
        agentType: "research",
        goal: "B",
        tools: ["search"],
        status: "failed",
        summary: "no",
        events: [{ type: "tool.started", count: 2 }]
      },
      {
        parentRunId: "a",
        parentToolCallId: "1",
        childRunId: "child-a",
        childSessionId: "session-a",
        agentType: "general",
        goal: "A",
        tools: [],
        status: "completed",
        summary: "yes",
        events: [{ type: "run.started", count: 1 }]
      }
    ])).toMatchObject({
      records: [
        { parentRunId: "a" },
        { parentRunId: "b" }
      ],
      statusCounts: {
        completed: 1,
        failed: 1,
        cancelled: 0,
        timed_out: 0
      },
      eventCounts: [
        { type: "run.started", count: 1 },
        { type: "tool.started", count: 2 }
      ]
    });
  });

  it("registers the delegate tool through a local plugin", async () => {
    const runtime = createAgentRuntime({
      plugins: [
        createAgentDelegationPlugin({
          pluginId: "delegation",
          childRunner: async () => ({ status: "completed", summary: "ok" })
        })
      ]
    });

    await runtime.run({ input: "missing provider", providerId: "missing", runId: "run-delegation-plugin" });

    expect(runtime.listCapabilityDescriptors?.()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "tool",
        name: "delegate_task",
        source: "plugin",
        ownerPluginId: "delegation",
        trust: expect.objectContaining({ level: "first-party" })
      })
    ]));
  });

  it("validates duplicate catalog entries and recursive default allowlists", () => {
    expect(validateDelegationConfig({
      childRunner: async () => ({ status: "completed", summary: "ok" }),
      toolCatalog: [
        { name: "read", description: "Read", effect: "read" },
        { name: "read", description: "Read again", effect: "read" }
      ],
      defaultToolAllowlist: ["delegateTask"]
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "DELEGATION_CATALOG_DUPLICATE_TOOL" }),
      expect.objectContaining({ code: "DELEGATION_DEFAULT_ALLOWLIST_RECURSIVE" })
    ]));
  });
});
