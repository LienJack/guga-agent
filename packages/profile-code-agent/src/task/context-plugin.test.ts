import { describe, expect, it } from "vitest";
import { ContextSourceKind, ContextSourcePriority } from "@guga-agent/core";
import { createCodeTask } from "./contracts";
import { createCodeTaskReinjectionSource, renderCodeTaskContext } from "./context-plugin";

describe("code task context plugin", () => {
  it("renders active task state, plan, verification failures and next step", () => {
    const task = {
      ...createCodeTask({
        taskId: "task-1",
        sessionId: "session-1",
        rootRunId: "run-1",
        cwd: "/repo",
        objective: "implement feature",
        now: "2026-05-29T00:00:00.000Z"
      }),
      state: "repairing" as const,
      phase: "repairing" as const,
      attempt: 1,
      plan: {
        summary: "Modify parser and add focused tests",
        files: [{ path: "packages/core/src/parser.ts", action: "modify" as const }],
        checks: [{ command: "pnpm test", cwd: "/repo", required: true, reason: "focused test" }],
        assumptions: [],
        risks: [],
        ledgerItems: [{
          id: "item-1",
          title: "Update parser",
          status: "evidence-submitted" as const,
          evidence: [{ kind: "diff" as const, id: "diff-1", summary: "parser change", changedFiles: ["packages/core/src/parser.ts"] }],
          changedFiles: ["packages/core/src/parser.ts"],
          verificationAttemptIds: [],
          risks: []
        }]
      },
      verificationAttempts: [{
        id: "verify-1",
        command: "pnpm test",
        cwd: "/repo",
        required: true,
        status: "failed" as const,
        reason: "focused test",
        outputSummary: "parser rejects valid input"
      }]
    };

    expect(renderCodeTaskContext(task)).toContain("Active code task: implement feature");
    expect(renderCodeTaskContext(task)).toContain("Plan: Modify parser");
    expect(renderCodeTaskContext(task)).toContain("Ledger: 0/1 verified or done");
    expect(renderCodeTaskContext(task)).toContain("item-1 [evidence-submitted] Update parser");
    expect(renderCodeTaskContext(task)).toContain("parser rejects valid input");
    expect(renderCodeTaskContext(task)).toContain("Next step: repair");
  });

  it("creates a high-priority reinjection source for compaction recovery", () => {
    const task = createCodeTask({
      taskId: "task-1",
      sessionId: "session-1",
      rootRunId: "run-1",
      cwd: "/repo",
      objective: "implement feature",
      now: "2026-05-29T00:00:00.000Z"
    });

    expect(createCodeTaskReinjectionSource({ task, runtimeContextId: "run-1" })).toMatchObject({
      id: "code-task:task-1",
      kind: ContextSourceKind.PlanTodo,
      priority: ContextSourcePriority.High,
      runtimeContextId: "run-1",
      metadata: {
        taskId: "task-1",
        state: "created"
      }
    });
  });
});
