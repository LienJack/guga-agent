import { describe, expect, it } from "vitest";
import { createCodeTask, validateCodeTask, type CodeTask } from "./contracts";

const NOW = "2026-05-29T00:00:00.000Z";

describe("code task contracts", () => {
  it("creates a durable task in the created state", () => {
    const task = createCodeTask({
      taskId: "task-1",
      sessionId: "session-1",
      rootRunId: "run-1",
      cwd: "/repo",
      objective: "implement feature",
      now: NOW
    });

    expect(task).toMatchObject({
      taskId: "task-1",
      sessionId: "session-1",
      rootRunId: "run-1",
      cwd: "/repo",
      objective: "implement feature",
      state: "created",
      phase: "created",
      attempt: 0,
      maxRepairAttempts: 2,
      createdAt: NOW,
      updatedAt: NOW
    });
    expect(validateCodeTask(task)).toEqual({ ok: true });
  });

  it("rejects completed tasks without passing required verification evidence", () => {
    const completed: CodeTask = {
      ...createCodeTask({
        taskId: "task-1",
        sessionId: "session-1",
        rootRunId: "run-1",
        cwd: "/repo",
        objective: "implement feature",
        now: NOW
      }),
      state: "completed",
      phase: "completed",
      completionEvidence: {
        completedAt: NOW,
        passingVerificationAttemptIds: ["verify-1"]
      },
      verificationAttempts: [{
        id: "verify-1",
        command: "pnpm test",
        cwd: "/repo",
        required: true,
        status: "failed",
        reason: "focused test",
        exitCode: 1
      }]
    };

    const validation = validateCodeTask(completed);

    expect(validation.ok).toBe(false);
    expect(validation).toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "PASSING_REQUIRED_VERIFICATION_REQUIRED" })
      ])
    });
  });

  it("accepts completed tasks with referenced passing required verification", () => {
    const completed: CodeTask = {
      ...createCodeTask({
        taskId: "task-1",
        sessionId: "session-1",
        rootRunId: "run-1",
        cwd: "/repo",
        objective: "implement feature",
        now: NOW
      }),
      state: "completed",
      phase: "completed",
      completionEvidence: {
        completedAt: NOW,
        passingVerificationAttemptIds: ["verify-1"],
        summary: "focused tests passed"
      },
      verificationAttempts: [{
        id: "verify-1",
        command: "pnpm test",
        cwd: "/repo",
        required: true,
        status: "passed",
        reason: "focused test",
        exitCode: 0,
        outputSummary: "ok"
      }]
    };

    expect(validateCodeTask(completed)).toEqual({ ok: true });
  });

  it("requires durable evidence before ledger items can be done", () => {
    const completed: CodeTask = {
      ...createCodeTask({
        taskId: "task-1",
        sessionId: "session-1",
        rootRunId: "run-1",
        cwd: "/repo",
        objective: "implement feature",
        now: NOW
      }),
      state: "completed",
      phase: "completed",
      plan: {
        summary: "implement feature",
        files: [],
        checks: [],
        assumptions: [],
        risks: [],
        ledgerItems: [{
          id: "item-1",
          title: "change behavior",
          status: "done",
          evidence: [],
          changedFiles: ["src/feature.ts"],
          verificationAttemptIds: ["verify-1"],
          risks: []
        }]
      },
      completionEvidence: {
        completedAt: NOW,
        passingVerificationAttemptIds: ["verify-1"]
      },
      verificationAttempts: [{
        id: "verify-1",
        command: "pnpm test",
        cwd: "/repo",
        required: true,
        status: "passed",
        reason: "focused test"
      }]
    };

    expect(validateCodeTask(completed)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "PLAN_LEDGER_EVIDENCE_REQUIRED" }),
        expect.objectContaining({ code: "PLAN_LEDGER_CHANGED_FILE_PROVENANCE_REQUIRED" })
      ])
    });
  });

  it("accepts completed ledger items with passing verification and changed-file provenance", () => {
    const completed: CodeTask = {
      ...createCodeTask({
        taskId: "task-1",
        sessionId: "session-1",
        rootRunId: "run-1",
        cwd: "/repo",
        objective: "implement feature",
        now: NOW
      }),
      state: "completed",
      phase: "completed",
      plan: {
        summary: "implement feature",
        files: [],
        checks: [],
        assumptions: [],
        risks: [],
        ledgerItems: [{
          id: "item-1",
          title: "change behavior",
          status: "done",
          evidence: [{
            kind: "diff",
            id: "diff-1",
            summary: "updated src/feature.ts",
            changedFiles: ["src/feature.ts"]
          }],
          changedFiles: ["src/feature.ts"],
          verificationAttemptIds: ["verify-1"],
          risks: []
        }]
      },
      completionEvidence: {
        completedAt: NOW,
        passingVerificationAttemptIds: ["verify-1"]
      },
      verificationAttempts: [{
        id: "verify-1",
        command: "pnpm test",
        cwd: "/repo",
        required: true,
        status: "passed",
        reason: "focused test"
      }]
    };

    expect(validateCodeTask(completed)).toEqual({ ok: true });
  });

  it("requires terminal reasons for blocked, failed and cancelled tasks", () => {
    const base = createCodeTask({
      taskId: "task-1",
      sessionId: "session-1",
      rootRunId: "run-1",
      cwd: "/repo",
      objective: "implement feature",
      now: NOW
    });

    expect(validateCodeTask({ ...base, state: "blocked", phase: "blocked" })).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "BLOCKED_REASON_REQUIRED" })])
    });
    expect(validateCodeTask({ ...base, state: "failed", phase: "failed" })).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "FAILURE_REASON_REQUIRED" })])
    });
    expect(validateCodeTask({ ...base, state: "cancelled", phase: "cancelled" })).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "CANCELLED_ACTOR_REQUIRED" })])
    });
  });

  it("serializes as plain JSON without class instances", () => {
    const task = createCodeTask({
      taskId: "task-1",
      sessionId: "session-1",
      rootRunId: "run-1",
      cwd: "/repo",
      objective: "implement feature",
      now: NOW
    });

    expect(JSON.parse(JSON.stringify(task))).toEqual(task);
  });
});
