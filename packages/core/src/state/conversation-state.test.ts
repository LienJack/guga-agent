import { describe, expect, it } from "vitest";
import { ConversationState } from "./conversation-state";
import type { ToolCall } from "../contracts/messages";

describe("ConversationState", () => {
  it("preserves assistant tool calls and matching tool results", () => {
    const state = new ConversationState();
    const call: ToolCall = { id: "call-1", name: "echo", input: { value: "hi" } };

    state.addUserMessage("Use a tool");
    state.addAssistantToolCalls([call]);
    state.addToolResult(call, { ok: true, content: "hi" });

    expect(state.snapshot()).toEqual([
      { role: "user", content: "Use a tool" },
      { role: "assistant", toolCalls: [call] },
      { role: "tool", toolCallId: "call-1", name: "echo", content: "hi", isError: false }
    ]);
  });

  it("stores tool failures as model-visible observations", () => {
    const state = new ConversationState();
    const call: ToolCall = { id: "call-2", name: "fail", input: {} };

    state.addAssistantToolCalls([call]);
    state.addToolResult(call, {
      ok: false,
      error: { code: "FAILED", message: "Tool failed" }
    });

    expect(state.snapshot().at(-1)).toEqual({
      role: "tool",
      toolCallId: "call-2",
      name: "fail",
      content: "FAILED: Tool failed",
      isError: true
    });
  });

  it("can replace messages after compaction without sharing mutable references", () => {
    const state = new ConversationState([{ role: "user", content: "old" }]);
    const messages = [{ role: "user" as const, content: "summary" }];

    state.replaceMessages(messages);
    messages[0].content = "mutated";

    expect(state.snapshot()).toEqual([{ role: "user", content: "summary" }]);
  });
});
