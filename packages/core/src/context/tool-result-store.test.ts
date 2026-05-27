import { describe, expect, it } from "vitest";
import { InMemoryToolResultStore, toolResultRecordId } from "./tool-result-store";

describe("InMemoryToolResultStore", () => {
  it("stores raw tool result content behind a stable correlation key", () => {
    const store = new InMemoryToolResultStore();
    const correlation = {
      runId: "run-1",
      turn: 2,
      toolCallId: "call-1",
      attempt: 1,
      batchId: "batch-1"
    };
    const reference = store.store({
      correlation,
      toolName: "shell_exec",
      result: { ok: true, content: "full output" },
      content: "full output"
    });

    expect(reference.id).toBe("tool-result-run-1-turn-2-attempt-1-batch-1-call-1");
    expect(store.get(reference.id)).toMatchObject({
      id: reference.id,
      correlation,
      toolName: "shell_exec",
      content: "full output",
      originalContentChars: 11
    });
  });

  it("includes run, turn, attempt, batch, and call id in record ids", () => {
    expect(toolResultRecordId({
      runId: "run",
      turn: 0,
      attempt: 3,
      batchId: "batch",
      toolCallId: "call"
    })).toBe("tool-result-run-turn-0-attempt-3-batch-call");
  });
});
