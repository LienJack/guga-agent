import type { ModelFinishReason, ProviderError, Usage } from "../contracts/provider";

export const AiSdkProviderErrorCategory = {
  Auth: "auth",
  RateLimit: "rate-limit",
  ContextOverflow: "context-overflow",
  Payment: "payment",
  Retryable: "retryable",
  Fatal: "fatal"
} as const satisfies Record<string, ProviderError["category"]>;

export type AiSdkUsageLike = {
  inputTokens?: number;
  promptTokens?: number;
  outputTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
};

export function mapAiSdkUsage(usage: AiSdkUsageLike | undefined): Usage | undefined {
  if (!usage) {
    return undefined;
  }

  const mapped: Usage = {
    cost: { status: "unknown", reason: "AI SDK result did not include Guga pricing metadata" }
  };
  const inputTokens = usage.inputTokens ?? usage.promptTokens;
  const outputTokens = usage.outputTokens ?? usage.completionTokens;

  if (inputTokens !== undefined) {
    mapped.inputTokens = inputTokens;
  }
  if (outputTokens !== undefined) {
    mapped.outputTokens = outputTokens;
  }
  if (usage.totalTokens !== undefined) {
    mapped.totalTokens = usage.totalTokens;
  }
  if (usage.cachedInputTokens !== undefined) {
    mapped.cachedInputTokens = usage.cachedInputTokens;
  }
  if (usage.reasoningTokens !== undefined) {
    mapped.reasoningTokens = usage.reasoningTokens;
  }

  return mapped;
}

export function mapAiSdkFinishReason(reason: unknown): ModelFinishReason {
  if (reason === "stop" || reason === "length" || reason === "content-filter") {
    return reason;
  }
  if (reason === "tool-calls" || reason === "tool_calls") {
    return "tool-calls";
  }
  if (reason === "error") {
    return "error";
  }
  return "unknown";
}

export function mapAiSdkError(
  error: unknown,
  metadata: { providerId: string; modelId: string; requestId?: string }
): ProviderError {
  const statusCode = statusFromError(error);
  const message = error instanceof Error ? error.message : "AI SDK provider call failed";

  const mapped: ProviderError = {
    category: categoryFromError(error, statusCode, message),
    code: codeFromError(error, statusCode),
    message,
    retryable: isRetryable(statusCode),
    providerId: metadata.providerId,
    modelId: metadata.modelId,
    metadata: { source: "ai-sdk" },
    cause: error
  };

  if (metadata.requestId !== undefined) {
    mapped.requestId = metadata.requestId;
  }
  if (statusCode !== undefined) {
    mapped.statusCode = statusCode;
  }

  return mapped;
}

function categoryFromError(error: unknown, statusCode: number | undefined, message: string): ProviderError["category"] {
  const code = codeFromError(error, statusCode).toLowerCase();
  const lowerMessage = message.toLowerCase();

  if (statusCode === 401 || statusCode === 403 || code.includes("auth")) {
    return AiSdkProviderErrorCategory.Auth;
  }
  if (statusCode === 429 || code.includes("rate") || lowerMessage.includes("rate limit")) {
    return AiSdkProviderErrorCategory.RateLimit;
  }
  if (statusCode === 402 || lowerMessage.includes("payment") || lowerMessage.includes("billing")) {
    return AiSdkProviderErrorCategory.Payment;
  }
  if (lowerMessage.includes("context") || lowerMessage.includes("token limit")) {
    return AiSdkProviderErrorCategory.ContextOverflow;
  }
  if (isRetryable(statusCode)) {
    return AiSdkProviderErrorCategory.Retryable;
  }
  return AiSdkProviderErrorCategory.Fatal;
}

function codeFromError(error: unknown, statusCode: number | undefined): string {
  if (isRecord(error)) {
    const value = error.code;
    if (typeof value === "string") {
      return value;
    }
  }
  return statusCode ? `HTTP_${statusCode}` : "AI_SDK_PROVIDER_FAILED";
}

function statusFromError(error: unknown): number | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  const status = error.statusCode ?? error.status;
  return typeof status === "number" ? status : undefined;
}

function isRetryable(statusCode: number | undefined): boolean {
  return statusCode === 408 || statusCode === 409 || statusCode === 429 || (typeof statusCode === "number" && statusCode >= 500);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
