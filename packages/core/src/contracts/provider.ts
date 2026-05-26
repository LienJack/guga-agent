import type { CoreMessage, ToolCall } from "./messages";
import type { ToolDefinition } from "./tools";

export const ModelPurpose = {
  Primary: "primary",
  Auxiliary: "auxiliary"
} as const;

export type ModelPurpose = (typeof ModelPurpose)[keyof typeof ModelPurpose] | (string & {});

export type ModelIdentifier = {
  providerId: string;
  modelId: string;
};

export type ModelCapability = {
  toolCalling?: boolean;
  streaming?: boolean;
  reasoning?: boolean;
  usage?: "required" | "optional" | "unavailable";
};

export type ModelMetadata = ModelIdentifier & {
  displayName?: string;
  purposes?: ModelPurpose[];
  contextWindow?: number;
  maxOutputTokens?: number;
  capabilities?: ModelCapability;
  metadata?: Record<string, unknown>;
};

export type UsageCostUnknown = {
  status: "unknown";
  reason?: string;
};

export type UsageCostKnown = {
  status: "known";
  amount: number;
  currency: string;
};

export type UsageCost = UsageCostUnknown | UsageCostKnown;

export type Usage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  cost?: UsageCost;
};

export type ProviderRequest = {
  messages: CoreMessage[];
  tools: ToolDefinition[];
  model?: ModelIdentifier;
  purpose?: ModelPurpose;
  signal?: AbortSignal;
};

export const ProviderErrorCategory = {
  Auth: "auth",
  RateLimit: "rate-limit",
  ContextOverflow: "context-overflow",
  Payment: "payment",
  Retryable: "retryable",
  Fatal: "fatal"
} as const;

export type ProviderErrorCategory =
  (typeof ProviderErrorCategory)[keyof typeof ProviderErrorCategory];

export type ProviderError = {
  category: ProviderErrorCategory;
  code: string;
  message: string;
  retryable?: boolean;
  providerId?: string;
  modelId?: string;
  requestId?: string;
  statusCode?: number;
  metadata?: Record<string, unknown>;
  cause?: unknown;
};

export type ProviderRawReference = {
  label: string;
  value: unknown;
};

export type ModelFinishReason =
  | "stop"
  | "length"
  | "tool-calls"
  | "content-filter"
  | "error"
  | "unknown";

export type ProviderFinalResponse = {
  type: "final";
  content: string;
  usage?: Usage;
  finishReason?: ModelFinishReason;
  raw?: ProviderRawReference[];
};

export type ProviderToolCallResponse = {
  type: "tool_calls";
  toolCalls: ToolCall[];
  content?: string;
  usage?: Usage;
  finishReason?: ModelFinishReason;
  raw?: ProviderRawReference[];
};

export type ProviderFailureResponse = {
  type: "failure";
  error: ProviderError;
  usage?: Usage;
  raw?: ProviderRawReference[];
};

export type ProviderResponse =
  | ProviderFinalResponse
  | ProviderToolCallResponse
  | ProviderFailureResponse;

export type Provider = {
  id: string;
  generate(request: ProviderRequest): Promise<ProviderResponse> | ProviderResponse;
};
