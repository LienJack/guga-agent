import { describe, expect, it } from "vitest";
import { createCodeTask } from "./contracts";
import { canTransitionCodeTask, transitionCodeTask } from "./lifecycle";

const NOW = "2026-05-29T00:00:00.000Z";
const LATER = "2026-05-29T00:01:00.000Z";

function task() {
  return createCodeTask({
    taskId: "task-1",
    sessionId: "session-1",
    rootRunId: "run-1",
    cwd: "/repo",
    objective: "implement feature",
    now: NOW
  });
}

describe("code task lifecycle", () => {
  it("allows the normal execution path from created to verifying", () => {
    let result = transitionCodeTask(task(), { type: "advance", state: "scouting", at: LATER });
    expect(result).toMatchObject({ ok: true, task: { state: "scouting", phase: "scouting" } });
    if (!result.ok) {
      throw new Error("expected transition to succeed");
    }

    result = transitionCodeTask(result.task, { type: "advance", state: "planning", at: LATER });
    expect(result).toMatchObject({ ok: true, task: { state: "planning" } });
    if (!result.ok) {
      throw new Error("expected transition to succeed");
    }

    result = transitionCodeTask(result.task, { type: "advance", state: "executing", at: LATER });
    expect(result).toMatchObject({ ok: true, task: { state: "executing" } });
    if (!result.ok) {
      throw new Error("expected transition to succeed");
    }

    result = transitionCodeTask(result.task, { type: "advance", state: "verifying", at: LATER });
    expect(result).toMatchObject({ ok: true, task: { state: "verifying" } });
  });

  it("rejects invalid transitions from terminal states", () => {
    const base = {
      ...task(),
      state: "completed" as const,
      phase: "completed" as const,
      completionEvidence: {
        completedAt: LATER,
        passingVerificationAttemptIds: ["verify-1"]
      },
      verificationAttempts: [{
        id: "verify-1",
        command: "pnpm test",
        cwd: "/repo",
        required: true,
        status: "passed" as const,
        reason: "focused test"
      }]
    };

    const result = transitionCodeTask(base, { type: "advance", state: "executing", at: LATER });

    expect(canTransitionCodeTask("completed", "executing")).toBe(false);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_CODE_TASK_TRANSITION" }
    });
  });

  it("records stage runs and verification attempts", () => {
    let result = transitionCodeTask(task(), {
      type: "start_stage_run",
      at: LATER,
      role: "scout",
      runId: "run-scout"
    });
    expect(result).toMatchObject({
      ok: true,
      task: {
        activeRunId: "run-scout",
        stageRuns: [expect.objectContaining({ role: "scout", runId: "run-scout", status: "running" })]
      }
    });
    if (!result.ok) {
      throw new Error("expected transition to succeed");
    }

    result = transitionCodeTask(result.task, {
      type: "finish_stage_run",
      at: LATER,
      runId: "run-scout",
      status: "completed"
    });
    expect(result).toMatchObject({
      ok: true,
      task: {
        stageRuns: [expect.objectContaining({ runId: "run-scout", status: "completed", completedAt: LATER })]
      }
    });
    if (!result.ok) {
      throw new Error("expected transition to succeed");
    }

    result = transitionCodeTask(result.task, {
      type: "record_verification",
      at: LATER,
      attempt: {
        id: "verify-1",
        command: "pnpm --filter @guga-agent/profile-code-agent test",
        cwd: "/repo",
        required: true,
        status: "passed",
        reason: "focused package test",
        exitCode: 0,
        outputSummary: "ok"
      }
    });

    expect(result).toMatchObject({
      ok: true,
      task: {
        verificationAttempts: [expect.objectContaining({ id: "verify-1", status: "passed", required: true })]
      }
    });
  });

  it("blocks completion without passing required verification", () => {
    const verifying = {
      ...task(),
      state: "verifying" as const,
      phase: "verifying" as const
    };

    const result = transitionCodeTask(verifying, {
      type: "complete",
      at: LATER,
      evidence: {
        completedAt: LATER,
        passingVerificationAttemptIds: []
      }
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "CODE_TASK_INVARIANT_VIOLATION" }
    });
  });

  it("requires block reasons and cancellation actors through transitions", () => {
    const blocked = transitionCodeTask(task(), {
      type: "block",
      at: LATER,
      reason: {
        code: "PERMISSION_DENIED",
        message: "write permission denied",
        recoverable: true
      }
    });
    expect(blocked).toMatchObject({ ok: true, task: { state: "blocked", blockedReason: { code: "PERMISSION_DENIED" } } });

    const cancelled = transitionCodeTask(task(), {
      type: "cancel",
      at: LATER,
      actor: "user"
    });
    expect(cancelled).toMatchObject({ ok: true, task: { state: "cancelled", cancelledBy: "user" } });
  });
});
