import { describe, expect, it } from "vitest";
import { summarizeVerificationToolResult } from "./verification-summary";

describe("verification summary", () => {
  it("summarizes passing shell output", () => {
    expect(summarizeVerificationToolResult({
      ok: true,
      content: "ok\n",
      metadata: { exitCode: 0 }
    })).toEqual({
      status: "passed",
      exitCode: 0,
      outputSummary: "ok"
    });
  });

  it("summarizes failing shell output", () => {
    expect(summarizeVerificationToolResult({
      ok: false,
      error: {
        code: "SHELL_COMMAND_FAILED",
        message: "Shell command exited with code 1",
        details: "expected true to be false"
      },
      metadata: { exitCode: 1 }
    })).toMatchObject({
      status: "failed",
      exitCode: 1,
      outputSummary: expect.stringContaining("expected true")
    });
  });
});
