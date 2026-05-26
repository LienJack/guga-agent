export type MessageRole = "system" | "user" | "assistant" | "tool";

export type ToolCall = {
  id: string;
  name: string;
  input: unknown;
};

export type SystemMessage = {
  role: "system";
  content: string;
};

export type UserMessage = {
  role: "user";
  content: string;
};

export type AssistantMessage =
  | {
      role: "assistant";
      content: string;
      toolCalls?: never;
    }
  | {
      role: "assistant";
      content?: string;
      toolCalls: ToolCall[];
    };

export type ToolMessage = {
  role: "tool";
  toolCallId: string;
  name: string;
  content: string;
  isError: boolean;
};

export type CoreMessage = SystemMessage | UserMessage | AssistantMessage | ToolMessage;
