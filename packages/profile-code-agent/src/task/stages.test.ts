import { describe, expect, it } from "vitest";
import { createCodeTask } from "./contracts";
import { buildCodeTaskStagePrompt } from "./stages";

describe("code task stage prompts", () => {
  it("includes objective, phase contract and verification contract", () => {
    const prompt = buildCodeTaskStagePrompt({
      role: "repairer",
      task: {
        ...createCodeTask({
          taskId: "task-1",
          sessionId: "session-1",
          rootRunId: "run-1",
          cwd: "/repo",
          objective: "fix failing parser test",
          now: "2026-05-29T00:00:00.000Z"
        }),
        attempt: 1,
        maxRepairAttempts: 2
      },
      failureEvidence: [{
        id: "verify-1",
        command: "pnpm test",
        cwd: "/repo",
        required: true,
        status: "failed",
        reason: "focused unit test",
        exitCode: 1,
        outputSummary: "parser rejects valid input"
      }]
    });

    expect(prompt).toContain("Objective: fix failing parser test");
    expect(prompt).toContain("Repair");
    expect(prompt).toContain("Verification failures to repair");
    expect(prompt).toContain("Completion requires");
  });
});
