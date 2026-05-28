import { describe, expect, it } from "vitest";
import { ensureToolPairingSafety } from "./tool-pairing-safety";

describe("ensureToolPairingSafety", () => {
  it("passes complete assistant tool call and result pairs unchanged", () => {
    const messages = [
      { role: "assistant" as const, toolCalls: [{ id: "call-1", name: "echo", input: {} }] },
      { role: "tool" as const, toolCallId: "call-1", name: "echo", content: "ok", isError: false }
    ];

    const result = ensureToolPairingSafety(messages);

    expect(result.messages).toEqual(messages);
    expect(result.decisions).toContainEqual(expect.objectContaining({
      type: "valid",
      batchId: "message-0",
      retainedToolCallIds: ["call-1"]
    }));
  });

  it("adds synthetic placeholders for pending calls in a parallel batch", () => {
    const result = ensureToolPairingSafety([
      {
        role: "assistant",
        toolCalls: [
          { id: "call-a", name: "read_a", input: {} },
          { id: "call-b", name: "read_b", input: {} },
          { id: "call-c", name: "read_c", input: {} }
        ]
      },
      { role: "tool", toolCallId: "call-a", name: "read_a", content: "a", isError: false }
    ]);

    expect(result.messages.filter((message) => message.role === "tool")).toHaveLength(3);
    expect(result.decisions).toContainEqual(expect.objectContaining({
      type: "repair",
      batchId: "message-0",
      retainedToolCallIds: ["call-a", "call-b", "call-c"],
      snippedToolCallIds: ["call-b", "call-c"],
      syntheticResults: ["call-b", "call-c"]
    }));
  });

  it("diagnoses orphan tool results without mutating them", () => {
    const result = ensureToolPairingSafety([
      { role: "tool", toolCallId: "missing", name: "echo", content: "orphan", isError: false }
    ]);

    expect(result.messages).toHaveLength(1);
    expect(result.decisions).toContainEqual(expect.objectContaining({
      type: "refuse",
      reason: expect.stringContaining("orphan tool result")
    }));
  });
});
