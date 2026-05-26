import { describe, expect, it } from "vitest";
import type { CoreMessage, ToolCall } from "./messages";
import type { ProviderResponse } from "./provider";
import type { ToolResult } from "./tools";

describe("core contracts", () => {
  it("can express a user to tool to final message sequence", () => {
    const call: ToolCall = { id: "call-1", name: "echo", input: { value: "hi" } };
    const messages: CoreMessage[] = [
      { role: "user", content: "Say hi through a tool" },
      { role: "assistant", toolCalls: [call] },
      { role: "tool", toolCallId: call.id, name: call.name, content: "hi", isError: false },
      { role: "assistant", content: "hi" }
    ];

    expect(messages.at(1)).toMatchObject({ role: "assistant", toolCalls: [call] });
    expect(messages.at(2)).toMatchObject({ role: "tool", toolCallId: "call-1" });
  });

  it("can express a structured tool failure observation", () => {
    const result: ToolResult = {
      ok: false,
      error: { code: "TEST_TOOL_FAILED", message: "The test tool failed" }
    };
    const observation: CoreMessage = {
      role: "tool",
      toolCallId: "call-2",
      name: "fail",
      content: "TEST_TOOL_FAILED: The test tool failed",
      isError: true
    };

    expect(result.ok).toBe(false);
    expect(observation.isError).toBe(true);
  });

  it("keeps provider responses independent from provider SDK types", () => {
    const response: ProviderResponse = {
      type: "tool_calls",
      toolCalls: [{ id: "call-3", name: "echo", input: { value: "hi" } }],
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 }
    };

    expect(response.type).toBe("tool_calls");
    expect(response.usage?.totalTokens).toBe(3);
  });
});
