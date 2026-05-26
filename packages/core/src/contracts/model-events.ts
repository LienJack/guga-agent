import type { ToolCall } from "./messages";
import type {
  ModelFinishReason,
  ModelIdentifier,
  ModelMetadata,
  ModelPurpose,
  ProviderError,
  ProviderRawReference,
  Usage
} from "./provider";

export const ModelEventType = {
  Requested: "model.requested",
  Selected: "model.selected",
  RetryScheduled: "model.retry_scheduled",
  FallbackSelected: "model.fallback_selected",
  TextDelta: "model.text_delta",
  ReasoningDelta: "model.reasoning_delta",
  ToolIntent: "model.tool_intent",
  Usage: "model.usage",
  Metadata: "model.metadata",
  Finished: "model.finished",
  ProviderError: "model.provider_error"
} as const;

export type ModelEventType = (typeof ModelEventType)[keyof typeof ModelEventType];

export type ModelCallIdentity = {
  runId?: string;
  turn?: number;
  attempt?: number;
  callId?: string;
};

export type ModelCallTarget = Partial<ModelIdentifier> & {
  purpose?: ModelPurpose;
};

export type ModelEventBase = ModelCallIdentity & ModelCallTarget & {
  timestamp?: number;
};

export type ModelRequestedEvent = ModelEventBase & {
  type: typeof ModelEventType.Requested;
  messageCount: number;
  toolNames: string[];
};

export type ModelSelectedEvent = ModelEventBase & {
  type: typeof ModelEventType.Selected;
  providerId: string;
  modelId: string;
  metadata?: ModelMetadata;
};

export type ModelRetryScheduledEvent = ModelEventBase & {
  type: typeof ModelEventType.RetryScheduled;
  providerId: string;
  modelId: string;
  error: ProviderError;
  nextAttempt: number;
};

export type ModelFallbackSelectedEvent = ModelEventBase & {
  type: typeof ModelEventType.FallbackSelected;
  from: ModelIdentifier;
  to: ModelIdentifier;
  reason: ProviderError;
};

export type ModelTextDeltaEvent = ModelEventBase & {
  type: typeof ModelEventType.TextDelta;
  delta: string;
};

export type ModelReasoningDeltaEvent = ModelEventBase & {
  type: typeof ModelEventType.ReasoningDelta;
  delta: string;
};

export type ModelToolIntentEvent = ModelEventBase & {
  type: typeof ModelEventType.ToolIntent;
  toolCall: ToolCall;
};

export type ModelUsageEvent = ModelEventBase & {
  type: typeof ModelEventType.Usage;
  usage: Usage;
};

export type ModelMetadataEvent = ModelEventBase & {
  type: typeof ModelEventType.Metadata;
  raw: ProviderRawReference;
};

export type ModelFinishedEvent = ModelEventBase & {
  type: typeof ModelEventType.Finished;
  finishReason: ModelFinishReason;
};

export type ModelProviderErrorEvent = ModelEventBase & {
  type: typeof ModelEventType.ProviderError;
  error: ProviderError;
};

export type ModelEvent =
  | ModelRequestedEvent
  | ModelSelectedEvent
  | ModelRetryScheduledEvent
  | ModelFallbackSelectedEvent
  | ModelTextDeltaEvent
  | ModelReasoningDeltaEvent
  | ModelToolIntentEvent
  | ModelUsageEvent
  | ModelMetadataEvent
  | ModelFinishedEvent
  | ModelProviderErrorEvent;
