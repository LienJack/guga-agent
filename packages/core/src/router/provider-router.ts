import { CoreError } from "../contracts/errors";
import { ModelEventType, type ModelEvent } from "../contracts/model-events";
import {
  ProviderErrorCategory,
  type ModelIdentifier,
  type LegacyProviderError,
  type ProviderError,
  type ProviderResponse
} from "../contracts/provider";
import type {
  ProviderRouterFailure,
  ProviderRouterPolicy,
  ProviderRouterRequest,
  ProviderRouterResult
} from "../contracts/provider-router";
import { CapabilityRegistry } from "../registry/capability-registry";

export type ProviderRouterOptions = {
  registry: CapabilityRegistry;
  policy?: ProviderRouterPolicy;
};

export class ProviderRouter {
  private readonly registry: CapabilityRegistry;
  private readonly policy: ProviderRouterPolicy | undefined;

  constructor(options: ProviderRouterOptions) {
    this.registry = options.registry;
    this.policy = options.policy;
  }

  async route(request: ProviderRouterRequest): Promise<ProviderRouterResult> {
    const events: ModelEvent[] = [];
    const candidates = this.candidatesFor(request);
    const maxRetries = this.policy?.maxRetries ?? 0;

    events.push({
      type: ModelEventType.Requested,
      runId: request.runId,
      turn: request.turn,
      messageCount: request.messages.length,
      toolNames: request.tools.map((tool) => tool.name),
      ...(request.purpose ? { purpose: request.purpose } : {})
    });

    if (candidates.length === 0) {
      return {
        ok: false,
        error: {
          code: "MODEL_NOT_FOUND",
          message: "No model candidates configured for provider routing",
          details: { purpose: request.purpose }
        },
        events
      };
    }

    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      const candidate = candidates[candidateIndex];
      if (!candidate) {
        continue;
      }

      const metadata = this.registry.getModel(candidate.providerId, candidate.modelId);
      if (!metadata) {
        return {
          ok: false,
          error: {
            code: "MODEL_NOT_FOUND",
            message: `Model not registered: ${candidate.providerId}/${candidate.modelId}`,
            details: candidate
          },
          events
        };
      }

      events.push({
        type: ModelEventType.Selected,
        runId: request.runId,
        turn: request.turn,
        attempt: 0,
        providerId: candidate.providerId,
        modelId: candidate.modelId,
        metadata,
        ...(request.purpose ? { purpose: request.purpose } : {})
      });

      let provider;
      try {
        provider = this.registry.requireProvider(candidate.providerId);
      } catch (error) {
        return {
          ok: false,
          error: toRouterError(error),
          events
        };
      }

      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        let response: ProviderResponse;
        try {
          response = await provider.generate({
            messages: request.messages,
            tools: request.tools,
            model: candidate,
            ...(request.purpose ? { purpose: request.purpose } : {}),
            ...(request.signal ? { signal: request.signal } : {})
          });
        } catch (error) {
          response = {
            type: "failure",
            error: thrownProviderError(error, candidate)
          };
        }

        const modelEvents = eventsFromResponse(request, candidate, attempt, response);
        events.push(...modelEvents);

        if (response.type !== "failure") {
          return { ok: true, response, model: candidate, events };
        }

        const providerError = normalizeProviderError(response.error, candidate);

        if (shouldRetry(providerError, attempt, maxRetries)) {
          events.push({
            type: ModelEventType.RetryScheduled,
            runId: request.runId,
            turn: request.turn,
            attempt,
            providerId: candidate.providerId,
            modelId: candidate.modelId,
            error: providerError,
            nextAttempt: attempt + 1,
            ...(request.purpose ? { purpose: request.purpose } : {})
          });
          continue;
        }

        if (candidateIndex + 1 < candidates.length) {
          const next = candidates[candidateIndex + 1];
          if (next) {
            events.push({
              type: ModelEventType.FallbackSelected,
              runId: request.runId,
              turn: request.turn,
              attempt,
              from: candidate,
              to: next,
              reason: providerError,
              ...(request.purpose ? { purpose: request.purpose } : {})
            });
          }
        }
        break;
      }
    }

    return {
      ok: false,
      error: {
        code: "PROVIDER_FAILED",
        message: "All provider router candidates failed",
        details: { purpose: request.purpose }
      },
      events
    };
  }

  private candidatesFor(request: ProviderRouterRequest): ModelIdentifier[] {
    const purpose = request.purpose ?? "primary";
    const purposePolicy = this.policy?.purposes?.find((policy) => policy.purpose === purpose);
    if (purposePolicy) {
      return purposePolicy.candidates;
    }
    return purpose === "primary" && this.policy ? [this.policy.primary] : [];
  }
}

function eventsFromResponse(
  request: ProviderRouterRequest,
  model: ModelIdentifier,
  attempt: number,
  response: ProviderResponse
): ModelEvent[] {
  const base = {
    runId: request.runId,
    turn: request.turn,
    attempt,
    providerId: model.providerId,
    modelId: model.modelId,
    ...(request.purpose ? { purpose: request.purpose } : {})
  };
  const events: ModelEvent[] = [];

  if (response.type === "final") {
    events.push({ ...base, type: ModelEventType.TextDelta, delta: response.content });
  }

  if (response.type === "tool_calls") {
    if (response.content) {
      events.push({ ...base, type: ModelEventType.TextDelta, delta: response.content });
    }
    for (const toolCall of response.toolCalls) {
      events.push({ ...base, type: ModelEventType.ToolIntent, toolCall });
    }
  }

  if (response.usage) {
    events.push({ ...base, type: ModelEventType.Usage, usage: response.usage });
  }

  for (const raw of response.raw ?? []) {
    events.push({ ...base, type: ModelEventType.Metadata, raw });
  }

  if (response.type === "failure") {
    events.push({ ...base, type: ModelEventType.ProviderError, error: normalizeProviderError(response.error, model) });
    return events;
  }

  events.push({
    ...base,
    type: ModelEventType.Finished,
    finishReason: response.finishReason ?? (response.type === "tool_calls" ? "tool-calls" : "stop")
  });
  return events;
}

function shouldRetry(error: ProviderError, attempt: number, maxRetries: number): boolean {
  return attempt < maxRetries && (error.retryable === true || error.category === ProviderErrorCategory.Retryable);
}

function normalizeProviderError(
  error: ProviderError | LegacyProviderError,
  model: ModelIdentifier
): ProviderError {
  if ("category" in error) {
    return {
      ...error,
      providerId: error.providerId ?? model.providerId,
      modelId: error.modelId ?? model.modelId
    };
  }

  return {
    category: ProviderErrorCategory.Fatal,
    code: error.code,
    message: error.message,
    details: error.details,
    providerId: model.providerId,
    modelId: model.modelId
  };
}

function thrownProviderError(error: unknown, model: ModelIdentifier): ProviderError {
  return {
    category: ProviderErrorCategory.Fatal,
    code: "PROVIDER_FAILED",
    message: error instanceof Error ? error.message : "Provider failed",
    providerId: model.providerId,
    modelId: model.modelId,
    cause: error
  };
}

function toRouterError(error: unknown): ProviderRouterFailure["error"] {
  if (error instanceof CoreError) {
    return {
      code: error.code === "PROVIDER_NOT_FOUND" ? "PROVIDER_NOT_FOUND" : "ROUTER_FAILED",
      message: error.message,
      details: error.details
    };
  }

  return {
    code: "ROUTER_FAILED",
    message: error instanceof Error ? error.message : "Provider router failed",
    details: error
  };
}
