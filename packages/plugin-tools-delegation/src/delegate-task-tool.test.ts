import { describe, expect, it, vi } from "vitest";
import { createAgentRuntime } from "@guga-agent/core";
import {
  buildDelegationInput,
  createDelegationPlugin,
  createDelegateTaskTool,
  createDelegationLedger,
  validateDelegationConfig
} from "./index";

const call = { id: "call-1", name: "delegate_task", input: {} };

describe("plugin-tools-delegation", () => {
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
        { name: "read_file" },
        { name: "run_tests" }
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
          allowance: {
            tools: ["read_file", "run_tests"],
            context: "provided"
          },
          budget: {
            maxTurns: 2,
            timeoutMs: 1000
          },
          timeoutMs: 1000,
          trace: {
            parentRunId: "parent-run",
            parentToolCallId: "call-1",
            childRunId: "call-1-child",
            childSessionId: "parent-run/child/call-1-child"
          },
          evidence: {
            source: "delegation",
            rawSource: "parent-run/child/call-1-child",
            verifier: { status: "unverified" },
            redaction: { state: "none" }
          },
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

  it("declares delegation as a governed tool-like action", () => {
    const tool = createDelegateTaskTool({
      childRunner: vi.fn(),
      toolCatalog: [{ name: "read_file" }],
      defaultToolAllowlist: ["read_file"],
      defaultMaxTurns: 3,
      defaultTimeoutMs: 5000
    });

    expect(tool.runtime).toMatchObject({
      permission: { defaultAction: "ask", profileActions: { headless: "deny", background: "deny" } },
      action: {
        category: "delegate",
        risk: "high",
        effects: [expect.objectContaining({
          kind: "delegation",
          access: "execute",
          target: "child-agent",
          metadata: expect.objectContaining({
            defaultMaxTurns: 3,
            defaultTimeoutMs: 5000
          })
        })]
      },
      principal: { kind: "agent", label: "Child agent" },
      eval: expect.objectContaining({
        categories: ["tool-action", "delegation"],
        coveredRisks: ["high"]
      })
    });
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
      toolCatalog: [{ name: "delegate_task" }]
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
      toolCatalog: [{ name: "read_file" }]
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

  it("rejects invented child tools when no parent catalog is provided", async () => {
    const runner = vi.fn();
    const tool = createDelegateTaskTool({ childRunner: runner });

    const result = await tool.execute({ goal: "test", toolAllowlist: ["shell_exec"] }, { call });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "DELEGATION_TOOL_UNAVAILABLE",
        details: { unavailable: ["shell_exec"] }
      }
    });
    expect(runner).not.toHaveBeenCalled();
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

  it("keeps child metadata from overwriting delegation correlation", async () => {
    const tool = createDelegateTaskTool({
      parentRunId: "parent",
      childRunner: async () => ({
        status: "completed",
        summary: "ok",
        metadata: {
          delegation: { parentRunId: "forged" },
          evidence: { rawSource: "forged" },
          note: "from child"
        }
      })
    });

    const result = await tool.execute({ goal: "review" }, { call });

    expect(result).toMatchObject({
      ok: true,
      metadata: {
        childMetadata: {
          delegation: { parentRunId: "forged" },
          evidence: { rawSource: "forged" },
          note: "from child"
        },
        delegation: {
          parentRunId: "parent",
          parentToolCallId: "call-1",
          evidence: {
            source: "delegation",
            rawSource: "parent/child/call-1-child"
          }
        }
      }
    });
  });

  it("rejects invalid child output before surfacing delegation metadata", async () => {
    const tool = createDelegateTaskTool({
      childRunner: async () => ({
        status: "completed",
        summary: "",
        events: [{ type: "run.started", count: -1 }]
      })
    });

    const result = await tool.execute({ goal: "review" }, { call });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "DELEGATION_OUTPUT_INVALID",
        details: expect.arrayContaining([
          expect.objectContaining({ code: "DELEGATION_SUMMARY_EMPTY" }),
          expect.objectContaining({ code: "DELEGATION_EVENT_COUNT_INVALID" })
        ])
      }
    });
    expect(result.metadata).toBeUndefined();
  });

  it("normalizes runner exceptions into tool failures", async () => {
    const tool = createDelegateTaskTool({
      childRunner: async () => {
        throw new Error("child runtime unavailable");
      }
    });

    const result = await tool.execute({ goal: "review" }, { call });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "DELEGATION_RUNNER_FAILED",
        message: "child runtime unavailable"
      }
    });
  });

  it("normalizes abort errors into cancelled delegation failures", async () => {
    const controller = new AbortController();
    const tool = createDelegateTaskTool({
      childRunner: async () => {
        controller.abort();
        throw new DOMException("Aborted", "AbortError");
      }
    });

    const result = await tool.execute({ goal: "review" }, { call, signal: controller.signal });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "DELEGATION_CANCELLED"
      },
      metadata: {
        delegation: {
          status: "cancelled"
        }
      }
    });
  });

  it("passes abort signals through to the child runner", async () => {
    const controller = new AbortController();
    const runner = vi.fn(async (request) => {
      expect(request.signal).toBeInstanceOf(AbortSignal);
      controller.abort();
      expect(request.signal?.aborted).toBe(true);
      return { status: "completed" as const, summary: "ok" };
    });
    const tool = createDelegateTaskTool({ childRunner: runner });

    await tool.execute({ goal: "test" }, { call, signal: controller.signal });

    expect(runner).toHaveBeenCalledOnce();
  });

  it("runs batch child tasks with a bounded concurrency cap and compact settled output", async () => {
    let active = 0;
    let maxActive = 0;
    const runner = vi.fn(async (request) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return {
        status: request.taskIndex === 1 ? "failed" as const : "completed" as const,
        summary: `handled ${request.goal}`,
        metadata: {
          secretToken: "do-not-leak",
          note: request.goal
        }
      };
    });
    const tool = createDelegateTaskTool({
      parentRunId: "parent-run",
      childRunner: runner,
      toolCatalog: [{ name: "read_file" }],
      defaultToolAllowlist: ["read_file"]
    });

    const result = await tool.execute({
      tasks: [
        { id: "alpha", goal: "inspect alpha" },
        { id: "beta", goal: "inspect beta" },
        { id: "gamma", goal: "inspect gamma" }
      ],
      maxConcurrency: 2
    }, { call });

    expect(result).toMatchObject({
      ok: true,
      content: expect.stringContaining("Delegated batch failed."),
      metadata: {
        delegation: {
          mode: "batch",
          status: "failed",
          statusCounts: {
            completed: 2,
            failed: 1,
            cancelled: 0,
            timed_out: 0
          },
          children: [
            expect.objectContaining({ taskIndex: 0, taskId: "alpha", status: "completed" }),
            expect.objectContaining({ taskIndex: 1, taskId: "beta", status: "failed" }),
            expect.objectContaining({ taskIndex: 2, taskId: "gamma", status: "completed" })
          ]
        }
      }
    });
    expect(result.content).toContain("[0:alpha] completed call-1-child-0");
    expect(result.content).toContain("[1:beta] failed call-1-child-1");
    expect(result.content).toContain("[2:gamma] completed call-1-child-2");
    expect(JSON.stringify(result.metadata)).not.toContain("do-not-leak");
    expect(maxActive).toBeLessThanOrEqual(2);
    expect(runner).toHaveBeenCalledTimes(3);
  });

  it("rejects batches above the configured task cap before running children", async () => {
    const runner = vi.fn();
    const tool = createDelegateTaskTool({ childRunner: runner, maxBatchTasks: 2 });

    const result = await tool.execute({
      tasks: [
        { goal: "one" },
        { goal: "two" },
        { goal: "three" }
      ]
    }, { call });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "DELEGATION_INPUT_INVALID",
        details: [expect.objectContaining({ code: "DELEGATION_TASKS_TOO_MANY" })]
      }
    });
    expect(runner).not.toHaveBeenCalled();
  });

  it("keeps invalid child output model-visible for batch calls", async () => {
    const tool = createDelegateTaskTool({
      childRunner: async (request) => request.taskIndex === 0
        ? { status: "completed" as const, summary: "" }
        : { status: "completed" as const, summary: "ok" }
    });

    const result = await tool.execute({
      tasks: [
        { goal: "bad child" },
        { goal: "good child" }
      ]
    }, { call });

    expect(result).toMatchObject({
      ok: true,
      metadata: {
        delegation: {
          status: "failed",
          statusCounts: {
            completed: 1,
            failed: 1,
            cancelled: 0,
            timed_out: 0
          }
        }
      }
    });
    expect(result.content).toContain("[0] failed call-1-child-0: Delegate task output is invalid");
    expect(result.content).toContain("[1] completed call-1-child-1: ok");
  });

  it("blocks child tools with unsafe capabilities by default", async () => {
    const tool = createDelegateTaskTool({
      childRunner: vi.fn(),
      toolCatalog: [{ name: "clarifier", capabilities: ["user-clarification"] }]
    });

    const result = await tool.execute({ goal: "ask", toolAllowlist: ["clarifier"] }, { call });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "DELEGATION_RECURSION_BLOCKED",
        details: { blocked: ["clarifier"] }
      }
    });
  });

  it("enforces per-child timeouts in the delegation plugin", async () => {
    const tool = createDelegateTaskTool({
      childRunner: () => new Promise(() => undefined)
    });

    const result = await tool.execute({ goal: "slow", timeoutMs: 1 }, { call });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "DELEGATION_TIMED_OUT"
      },
      metadata: {
        delegation: {
          status: "timed_out"
        }
      }
    });
  });

  it("bounds and redacts child metadata before exposing audit metadata", async () => {
    const tool = createDelegateTaskTool({
      maxChildMetadataChars: 80,
      childRunner: async () => ({
        status: "completed" as const,
        summary: "ok",
        metadata: {
          apiKey: "secret-value",
          payload: "x".repeat(1000)
        }
      })
    });

    const result = await tool.execute({ goal: "metadata" }, { call });

    expect(result).toMatchObject({
      ok: true,
      metadata: {
        childMetadata: {
          truncated: true
        }
      }
    });
    expect(JSON.stringify(result.metadata)).not.toContain("secret-value");
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
        taskIndex: 1,
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
        taskIndex: 0,
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
        createDelegationPlugin({
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
        { name: "read" },
        { name: "read" }
      ],
      defaultToolAllowlist: ["delegateTask"]
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "DELEGATION_CATALOG_DUPLICATE_TOOL" }),
      expect.objectContaining({ code: "DELEGATION_DEFAULT_ALLOWLIST_RECURSIVE" })
    ]));
  });
});
