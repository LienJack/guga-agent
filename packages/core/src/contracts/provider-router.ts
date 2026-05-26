import type { CoreMessage } from "./messages";
import type { ModelEvent } from "./model-events";
import type { ModelIdentifier, ModelPurpose, ProviderResponse } from "./provider";
import type { ToolDefinition } from "./tools";

export type ProviderRouterModelCandidate = ModelIdentifier;

export type ProviderRouterPurposePolicy = {
  purpose: ModelPurpose;
  candidates: ProviderRouterModelCandidate[];
};

export type ProviderRouterPolicy = {
  primary: ProviderRouterModelCandidate;
  purposes?: ProviderRouterPurposePolicy[];
  maxRetries?: number;
};

export type ProviderRouterRequest = {
  runId: string;
  turn: number;
  messages: CoreMessage[];
  tools: ToolDefinition[];
  purpose?: ModelPurpose;
  signal?: AbortSignal;
};

export type ProviderRouterSuccess = {
  ok: true;
  response: ProviderResponse;
  model: ModelIdentifier;
  events: ModelEvent[];
};

export type ProviderRouterFailure = {
  ok: false;
  error: {
    code: "MODEL_NOT_FOUND" | "PROVIDER_NOT_FOUND" | "PROVIDER_FAILED" | "ROUTER_FAILED";
    message: string;
    details?: unknown;
  };
  events: ModelEvent[];
};

export type ProviderRouterResult = ProviderRouterSuccess | ProviderRouterFailure;
