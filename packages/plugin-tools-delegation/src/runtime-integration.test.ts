import { describe, expect, it, vi } from "vitest";
import { AgentEventType, createAgentRuntime, createMockProvider } from "@guga-agent/core";
import { createDelegationPlugin } from "./index";

describe("delegation plugin runtime integration", () => {
  it("runs delegate_task through permission, pipeline, and model-visible result flow", async () => {
    const childRunner = vi.fn(async () => ({ status: "completed" as const, summary: "child checked the issue" }));
    const runtime = createAgentRuntime({
      plugins: [
        createDelegationPlugin({
          pluginId: "delegation",
          childRunner,
          parentRunId: "parent-run",
          toolCatalog: [{ name: "fs_read" }],
          defaultToolAllowlist: ["fs_read"]
        })
      ],
      permissions: {
        resolver: () => ({ action: "allow", remember: "once", source: "host" })
      }
    });
    runtime.registerProvider(createMockProvider([
      { type: "tool_calls", toolCalls: [{ id: "delegate", name: "delegate_task", input: { goal: "review docs" } }] },
      (request) => ({
        type: "final",
        content: request.messages.at(-1)?.role === "tool" ? request.messages.at(-1)!.content : "missing tool result"
      })
    ]));

    const result = await runtime.run({ input: "delegate", providerId: "mock", runId: "parent-run" });

    expect(result).toMatchObject({
      ok: true,
      finalAnswer: expect.stringContaining("Delegated task completed.")
    });
    expect(childRunner).toHaveBeenCalledWith(expect.objectContaining({
      parentRunId: "parent-run",
      parentToolCallId: "delegate",
      tools: ["fs_read"]
    }));
    expect(result.events.map((event) => event.type)).toContain(AgentEventType.PermissionRequested);
    await runtime.dispose();
  });

  it("filters delegate_task from headless provider projection before backend execution", async () => {
    const childRunner = vi.fn(async () => ({ status: "completed" as const, summary: "no" }));
    const projectedTools: string[][] = [];
    const runtime = createAgentRuntime({
      plugins: [createDelegationPlugin({ childRunner })],
      permissions: { profile: "headless" }
    });
    runtime.registerProvider(createMockProvider([
      (request) => ({
        type: "final",
        content: (projectedTools.push(request.tools.map((tool) => tool.name)), request.tools.map((tool) => tool.name).join(","))
      })
    ]));

    const result = await runtime.run({ input: "delegate", providerId: "mock", runId: "run-delegate-headless" });

    expect(childRunner).not.toHaveBeenCalled();
    expect(projectedTools[0]).toEqual([
      "fs_read",
      "fs_list",
      "fs_search",
      "fs_glob",
      "fs_grep",
      "git_status",
      "git_diff",
      "git_commit_message"
    ]);
    expect(projectedTools[0]).not.toContain("delegate_task");
    expect(result).toMatchObject({ ok: true, finalAnswer: "fs_read,fs_list,fs_search,fs_glob,fs_grep,git_status,git_diff,git_commit_message" });
    await runtime.dispose();
  });

  it("does not execute delegate_task if a headless provider emits the hidden tool anyway", async () => {
    const childRunner = vi.fn(async () => ({ status: "completed" as const, summary: "no" }));
    const runtime = createAgentRuntime({
      plugins: [createDelegationPlugin({ childRunner })],
      permissions: { profile: "headless" }
    });
    runtime.registerProvider(createMockProvider([
      { type: "tool_calls", toolCalls: [{ id: "delegate", name: "delegate_task", input: { goal: "should not run" } }] },
      (request) => ({
        type: "final",
        content: request.messages.at(-1)?.role === "tool" ? request.messages.at(-1)!.content : "missing tool result"
      })
    ]));

    const result = await runtime.run({ input: "delegate", providerId: "mock", runId: "run-delegate-headless-call" });

    expect(childRunner).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      finalAnswer: expect.stringContaining("TOOL_UNAVAILABLE: Tool is not model-visible: delegate_task")
    });
    await runtime.dispose();
  });
});
