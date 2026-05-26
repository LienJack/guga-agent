import type { AssistantMessage, CoreMessage, ToolCall, ToolMessage } from "../contracts/messages";
import type { ToolResult } from "../contracts/tools";

export class ConversationState {
  private readonly messages: CoreMessage[] = [];

  constructor(initialMessages: CoreMessage[] = []) {
    this.messages.push(...initialMessages);
  }

  addUserMessage(content: string): void {
    this.messages.push({ role: "user", content });
  }

  addAssistantToolCalls(toolCalls: ToolCall[], content?: string): void {
    const message: AssistantMessage = content
      ? { role: "assistant", content, toolCalls }
      : { role: "assistant", toolCalls };
    this.messages.push(message);
  }

  addAssistantFinal(content: string): void {
    this.messages.push({ role: "assistant", content });
  }

  addToolResult(call: ToolCall, result: ToolResult): void {
    this.messages.push(toToolMessage(call, result));
  }

  snapshot(): CoreMessage[] {
    return this.messages.map((message) => structuredClone(message));
  }
}

export function toToolMessage(call: ToolCall, result: ToolResult): ToolMessage {
  if (result.ok) {
    return {
      role: "tool",
      toolCallId: call.id,
      name: call.name,
      content: result.content,
      isError: false
    };
  }

  return {
    role: "tool",
    toolCallId: call.id,
    name: call.name,
    content: `${result.error.code}: ${result.error.message}`,
    isError: true
  };
}
