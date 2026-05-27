import { describe, expect, it } from "vitest";
import { AgentEventType } from "@guga-agent/core";
import { buildConversationView } from "./conversation-view";
import { durableEvent } from "./test-fixtures";

describe("conversation replay view", () => {
  it("derives branch-visible messages without invoking tools or providers", () => {
    const view = buildConversationView([
      durableEvent({ type: AgentEventType.RunStarted, runId: "run-1", input: "hello" }, { eventId: "event-1" }),
      durableEvent({
        type: AgentEventType.ModelResponded,
        runId: "run-1",
        turn: 0,
        response: { type: "final", content: "hi" }
      }, { eventId: "event-2" })
    ]);

    expect(view).toEqual({
      ok: true,
      messages: [{ role: "user", content: "hello" }, { role: "assistant", content: "hi" }],
      diagnostics: []
    });
  });

  it("turns dangling tool starts into pairing diagnostics instead of exposing unsafe tool_use", () => {
    const view = buildConversationView([
      durableEvent({ type: AgentEventType.RunStarted, runId: "run-1", input: "search" }, { eventId: "event-1" }),
      durableEvent({
        type: AgentEventType.ToolStarted,
        runId: "run-1",
        turn: 0,
        correlation: { runId: "run-1", turn: 0, toolCallId: "call-1", attempt: 0 },
        call: { id: "call-1", name: "search", input: { query: "x" } }
      }, { eventId: "event-2" })
    ]);

    expect(view.messages.at(-1)).toMatchObject({
      role: "tool",
      toolCallId: "call-1",
      isError: true,
      content: expect.stringContaining("Replay diagnostic")
    });
    expect(view.diagnostics).toEqual([
      expect.objectContaining({ code: "TOOL_PAIRING_REPAIRED", severity: "warning" })
    ]);
  });

  it("repairs dangling assistant tool calls before exposing replayed conversation", () => {
    const view = buildConversationView([
      durableEvent({ type: AgentEventType.RunStarted, runId: "run-1", input: "search" }, { eventId: "event-1" }),
      durableEvent({
        type: AgentEventType.ModelResponded,
        runId: "run-1",
        turn: 0,
        response: {
          type: "tool_calls",
          toolCalls: [{ id: "call-1", name: "search", input: { query: "x" } }]
        }
      }, { eventId: "event-2" })
    ]);

    expect(view.messages).not.toContainEqual(expect.objectContaining({
      role: "assistant",
      toolCalls: expect.any(Array)
    }));
    expect(view.messages.at(-1)).toMatchObject({
      role: "tool",
      toolCallId: "call-1",
      isError: true,
      content: expect.stringContaining("Replay diagnostic")
    });
    expect(view.diagnostics).toEqual([
      expect.objectContaining({ code: "TOOL_PAIRING_REPAIRED", severity: "warning" })
    ]);
  });
});
