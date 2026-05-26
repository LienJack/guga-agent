import type { CoreMessage, ToolCall } from "./messages";
import type { ToolDefinition } from "./tools";

export type Usage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type ProviderRequest = {
  messages: CoreMessage[];
  tools: ToolDefinition[];
  signal?: AbortSignal;
};

export type ProviderFinalResponse = {
  type: "final";
  content: string;
  usage?: Usage;
};

export type ProviderToolCallResponse = {
  type: "tool_calls";
  toolCalls: ToolCall[];
  content?: string;
  usage?: Usage;
};

export type ProviderFailureResponse = {
  type: "failure";
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  usage?: Usage;
};

export type ProviderResponse =
  | ProviderFinalResponse
  | ProviderToolCallResponse
  | ProviderFailureResponse;

export type Provider = {
  id: string;
  generate(request: ProviderRequest): Promise<ProviderResponse> | ProviderResponse;
};
