import type { CoreMessage } from "../contracts/messages";

export type AiSdkModelMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: unknown;
};

export function mapCoreMessagesToAiSdk(messages: readonly CoreMessage[]): AiSdkModelMessage[] {
  return messages.map((message) => {
    if (message.role === "assistant" && Array.isArray(message.toolCalls)) {
      return {
        role: "assistant",
        content: [
          ...(message.content ? [{ type: "text", text: message.content }] : []),
          ...message.toolCalls.map((call) => ({
            type: "tool-call",
            toolCallId: call.id,
            toolName: call.name,
            input: call.input
          }))
        ]
      };
    }

    if (message.role === "tool") {
      return {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: message.toolCallId,
            toolName: message.name,
            output: {
              type: message.isError ? "error-text" : "text",
              value: message.content
            }
          }
        ]
      };
    }

    return {
      role: message.role,
      content: message.content
    };
  });
}
