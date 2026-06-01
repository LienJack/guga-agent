import { describe, expect, it } from "vitest";
import type { RuntimeToolInvoker } from "@guga-agent/core";
import { createCodeTask } from "./contracts";
import { runVerification, selectVerificationCommands } from "./verification-runner";

describe("verification runner", () => {
  it("selects planned checks before discovered defaults", () => {
    expect(selectVerificationCommands({
      cwd: "/repo",
      packageScripts: { test: "vitest" },
      plannedChecks: [{
        command: "pnpm --filter @guga-agent/core test",
        cwd: "/repo",
        required: true,
        reason: "plan-selected focused test"
      }]
    })).toEqual([{
      command: "pnpm --filter @guga-agent/core test",
      cwd: "/repo",
      required: true,
      reason: "plan-selected focused test"
    }]);
  });

  it("executes verification commands through the runtime tool invoker", async () => {
    const invocations: string[] = [];
    const invoker: RuntimeToolInvoker = {
      async invokeTool(options) {
        invocations.push(String((options.call.input as Record<string, unknown>).command));
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
          result: {
            ok: true,
            content: "ok",
            metadata: { exitCode: 0 }
          }
        };
      }
    };
    const task = createCodeTask({
      taskId: "task-1",
      sessionId: "session-1",
      rootRunId: "run-1",
      cwd: "/repo",
      objective: "implement feature",
      now: "2026-05-29T00:00:00.000Z"
    });

    const result = await runVerification({
      task,
      invoker,
      commands: [{
        id: "verify-unit",
        command: "pnpm test",
        cwd: "/repo",
        required: true,
        reason: "focused unit test"
      }],
      now: () => new Date("2026-05-29T00:00:00.000Z")
    });

    expect(invocations).toEqual(["pnpm test"]);
    expect(result).toMatchObject({
      passedRequired: true,
      failedRequired: [],
      attempts: [expect.objectContaining({
        id: "verify-unit",
        status: "passed",
        exitCode: 0,
        outputSummary: "ok"
      })]
    });
  });

  it("reports failed required checks as repair evidence", async () => {
    const invoker: RuntimeToolInvoker = {
      async invokeTool(options) {
        return {
          call: options.call,
          correlation: {
            runId: options.runId,
            turn: 0,
            toolCallId: options.call.id,
            attempt: 1,
            source: options.source
          },
          result: {
            ok: false,
            error: {
              code: "SHELL_COMMAND_FAILED",
              message: "Shell command exited with code 1",
              details: "test failed"
            },
            metadata: { exitCode: 1 }
          }
        };
      }
    };
    const task = createCodeTask({
      taskId: "task-1",
      sessionId: "session-1",
      rootRunId: "run-1",
      cwd: "/repo",
      objective: "implement feature",
      now: "2026-05-29T00:00:00.000Z"
    });

    const result = await runVerification({
      task,
      invoker,
      commands: [{
        command: "pnpm test",
        cwd: "/repo",
        required: true,
        reason: "focused unit test"
      }]
    });

    expect(result.passedRequired).toBe(false);
    expect(result.failedRequired).toEqual([
      expect.objectContaining({ status: "failed", exitCode: 1, outputSummary: expect.stringContaining("test failed") })
    ]);
  });

  it("requires every required command to pass", async () => {
    const invoker: RuntimeToolInvoker = {
      async invokeTool(options) {
        const command = String((options.call.input as Record<string, unknown>).command);
        return {
          call: options.call,
          correlation: {
            runId: options.runId,
            turn: 0,
            toolCallId: options.call.id,
            attempt: 1,
            source: options.source
          },
          result: command.includes("typecheck")
            ? {
                ok: false,
                error: { code: "SHELL_COMMAND_FAILED", message: "Shell command exited with code 1", details: "type error" },
                metadata: { exitCode: 1 }
              }
            : {
                ok: true,
                content: "tests ok",
                metadata: { exitCode: 0 }
              }
        };
      }
    };
    const task = createCodeTask({
      taskId: "task-1",
      sessionId: "session-1",
      rootRunId: "run-1",
      cwd: "/repo",
      objective: "implement feature",
      now: "2026-05-29T00:00:00.000Z"
    });

    const result = await runVerification({
      task,
      invoker,
      commands: [
        { command: "pnpm test", cwd: "/repo", required: true, reason: "tests" },
        { command: "pnpm typecheck", cwd: "/repo", required: true, reason: "types" }
      ]
    });

    expect(result.passedRequired).toBe(false);
    expect(result.failedRequired).toEqual([
      expect.objectContaining({ command: "pnpm typecheck", status: "failed" })
    ]);
  });
});
