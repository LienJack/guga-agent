import { describe, expect, it } from "vitest";
import type { RuntimeToolInvoker, ToolRuntimeResult } from "@guga-agent/core";
import { CodeTaskController, type CodeTaskStageRunner } from "./controller";

describe("code task controller", () => {
  it("moves a happy-path task through verified completion", async () => {
    const controller = new CodeTaskController({
      invoker: invokerWithResults([{ ok: true, content: "ok", metadata: { exitCode: 0 } }]),
      runStage: stageRunner(),
      now: () => new Date("2026-05-29T00:00:00.000Z")
    });

    const result = await controller.start({
      taskId: "task-1",
      sessionId: "session-1",
      rootRunId: "run-root",
      cwd: "/repo",
      objective: "implement feature",
      prompt: "implement feature",
      plannedChecks: [{
        id: "verify-unit",
        command: "pnpm test",
        cwd: "/repo",
        required: true,
        reason: "focused unit test"
      }]
    });

    expect(result.task).toMatchObject({
      state: "completed",
      phase: "completed",
      completionEvidence: {
        passingVerificationAttemptIds: ["verify-unit"]
      },
      verificationAttempts: [
        expect.objectContaining({ id: "verify-unit", status: "passed", required: true })
      ]
    });
  });

  it("repairs after a failed verification and completes only after a passing retry", async () => {
    const roles: string[] = [];
    const controller = new CodeTaskController({
      invoker: invokerWithResults([
        {
          ok: false,
          error: {
            code: "SHELL_COMMAND_FAILED",
            message: "Shell command exited with code 1",
            details: "failed once"
          },
          metadata: { exitCode: 1 }
        },
        { ok: true, content: "ok", metadata: { exitCode: 0 } }
      ]),
      runStage: stageRunner(roles),
      now: () => new Date("2026-05-29T00:00:00.000Z"),
      maxRepairAttempts: 2
    });

    const result = await controller.start({
      taskId: "task-1",
      sessionId: "session-1",
      rootRunId: "run-root",
      cwd: "/repo",
      objective: "implement feature",
      prompt: "implement feature",
      plannedChecks: [{
        id: "verify-unit",
        command: "pnpm test",
        cwd: "/repo",
        required: true,
        reason: "focused unit test"
      }]
    });

    expect(roles).toContain("repairer");
    expect(result.task).toMatchObject({
      state: "completed",
      attempt: 1,
      completionEvidence: {
        passingVerificationAttemptIds: ["verify-unit"]
      }
    });
  });

  it("blocks when verification keeps failing after the repair budget", async () => {
    const controller = new CodeTaskController({
      invoker: invokerWithResults([
        {
          ok: false,
          error: { code: "SHELL_COMMAND_FAILED", message: "Shell command exited with code 1", details: "fail 1" },
          metadata: { exitCode: 1 }
        },
        {
          ok: false,
          error: { code: "SHELL_COMMAND_FAILED", message: "Shell command exited with code 1", details: "fail 2" },
          metadata: { exitCode: 1 }
        }
      ]),
      runStage: stageRunner(),
      now: () => new Date("2026-05-29T00:00:00.000Z"),
      maxRepairAttempts: 1
    });

    const result = await controller.start({
      taskId: "task-1",
      sessionId: "session-1",
      rootRunId: "run-root",
      cwd: "/repo",
      objective: "implement feature",
      prompt: "implement feature",
      plannedChecks: [{
        command: "pnpm test",
        cwd: "/repo",
        required: true,
        reason: "focused unit test"
      }]
    });

    expect(result.task).toMatchObject({
      state: "blocked",
      blockedReason: { code: "VERIFICATION_FAILED" }
    });
  });
});

function stageRunner(observedRoles: string[] = []): CodeTaskStageRunner {
  return async (request) => {
    observedRoles.push(request.role);
    return {
      runId: `run-${request.role}-${observedRoles.length}`,
      ...(request.role === "planner"
        ? {
            plan: {
              summary: "Plan edits and focused tests",
              files: [],
              checks: [],
              assumptions: [],
              risks: []
            }
          }
        : {})
    };
  };
}

function invokerWithResults(results: ToolRuntimeResult["result"][]): RuntimeToolInvoker {
  let index = 0;
  return {
    async invokeTool(options) {
      const result = results[index] ?? results[results.length - 1];
      index += 1;
      if (!result) {
        throw new Error("missing tool result");
      }
      return {
        call: options.call,
        correlation: {
          runId: options.runId,
          turn: 0,
          toolCallId: options.call.id,
          attempt: 1,
          source: options.source,
          ...(options.taskId ? { taskId: options.taskId } : {})
        },
        result
      };
    }
  };
}
