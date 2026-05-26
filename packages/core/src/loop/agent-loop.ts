import { CoreError } from "../contracts/errors";
import { AgentEventType, type AgentEvent } from "../contracts/events";
import { ModelEventType } from "../contracts/model-events";
import type { ToolCall } from "../contracts/messages";
import type { LegacyProviderError, Provider, ProviderError, ProviderRequest, ProviderResponse } from "../contracts/provider";
import { ProviderErrorCategory } from "../contracts/provider";
import type { AgentRunFailure, AgentRunOptions, AgentRunResult } from "../contracts/runtime";
import type { ToolExecutionContext, ToolResult } from "../contracts/tools";
import { EventBus } from "../events/event-bus";
import { HookKernel } from "../hooks/hook-kernel";
import { CapabilityRegistry } from "../registry/capability-registry";
import { ProviderRouter } from "../router/provider-router";
import { ConversationState } from "../state/conversation-state";

export type AgentLoopOptions = {
  registry: CapabilityRegistry;
  eventBus?: EventBus;
  eventStartIndex?: number;
  hookKernel?: HookKernel;
  router?: ProviderRouter;
};

export class AgentLoop {
  private readonly registry: CapabilityRegistry;
  private readonly eventBus: EventBus;
  private readonly eventStartIndex: number | undefined;
  private readonly hookKernel: HookKernel | undefined;
  private readonly router: ProviderRouter | undefined;

  constructor(options: AgentLoopOptions) {
    this.registry = options.registry;
    this.eventBus = options.eventBus ?? new EventBus();
    this.eventStartIndex = options.eventStartIndex;
    this.hookKernel = options.hookKernel;
    this.router = options.router;
  }

  async run(options: AgentRunOptions): Promise<AgentRunResult> {
    const runId = options.runId ?? crypto.randomUUID();
    const maxTurns = options.maxTurns ?? 8;
    const eventStartIndex = this.eventStartIndex ?? this.eventBus.events.length;
    const state = new ConversationState();
    state.addUserMessage(options.input);

    this.publish({ type: AgentEventType.RunStarted, runId, input: options.input });

    let directProvider: Provider | undefined;
    if (!this.router) {
      const providerOrError = options.providerId
        ? this.resolveProvider(options.providerId)
        : new CoreError("PROVIDER_NOT_FOUND", "Provider id is required when no provider router is configured");
      if (providerOrError instanceof CoreError) {
        return this.fail(runId, eventStartIndex, providerOrError, "provider_missing");
      }
      directProvider = providerOrError;
    }

    for (let turn = 0; turn < maxTurns; turn += 1) {
      const messages = state.snapshot();
      const tools = this.registry.listTools();
      const routeResult = this.router
        ? await this.router.route({
            runId,
            turn,
            messages,
            tools,
            ...(options.purpose ? { purpose: options.purpose } : {}),
            ...(options.signal ? { signal: options.signal } : {})
          })
        : await this.callDirectProvider(runId, turn, requireDirectProvider(directProvider), messages, tools, options);

      for (const event of routeResult.events) {
        this.publish({ type: AgentEventType.ModelEvent, runId, turn, event });
      }

      if (!routeResult.ok) {
        return this.fail(
          runId,
          eventStartIndex,
          new CoreError(routeResult.error.code, routeResult.error.message, routeResult.error.details),
          routeResult.error.code === "PROVIDER_NOT_FOUND" ? "provider_missing" : "provider_failed"
        );
      }

      const response = routeResult.response;
      this.publish({ type: AgentEventType.ModelResponded, runId, turn, response });
      if (response.usage) {
        this.publish({ type: AgentEventType.UsageRecorded, runId, turn, usage: response.usage });
      }

      if (response.type === "failure") {
        const providerError = normalizeProviderError(response.error, {
          providerId: routeResult.model.providerId,
          modelId: routeResult.model.modelId
        });
        return this.fail(
          runId,
          eventStartIndex,
          new CoreError("PROVIDER_FAILED", providerError.message, providerError),
          "provider_failed"
        );
      }

      if (response.type === "final") {
        state.addAssistantFinal(response.content);
        this.publish({ type: AgentEventType.RunFinished, runId, status: "completed" });
        return {
          ok: true,
          runId,
          finalAnswer: response.content,
          events: this.eventsForRun(eventStartIndex)
        };
      }

      state.addAssistantToolCalls(response.toolCalls, response.content);

      for (const call of response.toolCalls) {
        this.publish({ type: AgentEventType.ToolCalled, runId, turn, call });

        if (this.hookKernel) {
          const gateResult = await this.hookKernel.runPreToolGate({ runId, turn, call, tools });
          if (!gateResult.ok) {
            return this.fail(
              runId,
              eventStartIndex,
              new CoreError("HOOK_FAILED", gateResult.error.message, {
                hook: gateResult.failedHook,
                error: gateResult.error
              }),
              "hook_failed"
            );
          }

          if ("deniedBy" in gateResult) {
            const blockedResult: ToolResult = {
              ok: false,
              error: {
                code: "TOOL_CALL_BLOCKED",
                message: gateResult.decision.reason,
                details: {
                  hookId: gateResult.deniedBy.id,
                  pluginId: gateResult.deniedBy.pluginId
                }
              }
            };
            state.addToolResult(call, blockedResult);
            this.publish({ type: AgentEventType.ToolResult, runId, turn, call, result: blockedResult });
            continue;
          }
        }

        const tool = this.registry.getTool(call.name);
        if (!tool) {
          return this.fail(
            runId,
            eventStartIndex,
            new CoreError("TOOL_NOT_FOUND", `Tool not registered: ${call.name}`, { toolCall: call }),
            "tool_missing"
          );
        }

        const result = await executeTool(call, (input, context) => tool.execute(input, context), options.signal);
        state.addToolResult(call, result);
        this.publish({ type: AgentEventType.ToolResult, runId, turn, call, result });
      }
    }

    return this.fail(
      runId,
      eventStartIndex,
      new CoreError("MAX_TURNS_EXCEEDED", `Agent loop exceeded max turns: ${maxTurns}`, { maxTurns }),
      "max_turns_exceeded"
    );
  }

  private fail(runId: string, eventStartIndex: number, error: CoreError, reason: string): AgentRunFailure {
    this.publish({
      type: AgentEventType.Error,
      runId,
      code: error.code,
      message: error.message,
      details: error.details
    });
    this.publish({ type: AgentEventType.RunFinished, runId, status: "failed", reason });
    return {
      ok: false,
      runId,
      error: { code: error.code, message: error.message, details: error.details },
      events: this.eventsForRun(eventStartIndex)
    };
  }

  private eventsForRun(eventStartIndex: number): AgentEvent[] {
    return this.eventBus.events.slice(eventStartIndex);
  }

  private publish(event: AgentEvent): void {
    this.eventBus.publish(event);
  }

  private resolveProvider(providerId: string): CoreError | Provider {
    try {
      return this.registry.requireProvider(providerId);
    } catch (error) {
      return toCoreError(error);
    }
  }

  private async callDirectProvider(
    runId: string,
    turn: number,
    provider: ReturnType<CapabilityRegistry["requireProvider"]>,
    messages: ProviderRequest["messages"],
    tools: ProviderRequest["tools"],
    options: AgentRunOptions
  ) {
    this.publish({
      type: AgentEventType.ModelRequested,
      runId,
      turn,
      providerId: provider.id,
      messages,
      toolNames: tools.map((tool) => tool.name)
    });

    const request: ProviderRequest = { messages, tools };
    if (options.signal) {
      request.signal = options.signal;
    }

    try {
      const response = await provider.generate(request);
      return {
        ok: true as const,
        response,
        model: { providerId: provider.id, modelId: options.modelId ?? provider.id },
        events: modelEventsFromDirectResponse(runId, turn, provider.id, options.modelId ?? provider.id, response)
      };
    } catch (error) {
      const providerError = {
        category: ProviderErrorCategory.Fatal,
        code: "PROVIDER_FAILED",
        message: error instanceof Error ? error.message : "Provider failed",
        cause: error,
        providerId: provider.id,
        modelId: options.modelId ?? provider.id
      };
      return {
        ok: false as const,
        error: {
          code: "PROVIDER_FAILED" as const,
          message: providerError.message,
          details: providerError
        },
        events: [
          {
            type: ModelEventType.ProviderError,
            runId,
            turn,
            providerId: provider.id,
            modelId: options.modelId ?? provider.id,
            error: providerError
          }
        ]
      };
    }
  }
}

function modelEventsFromDirectResponse(
  runId: string,
  turn: number,
  providerId: string,
  modelId: string,
  response: ProviderResponse
) {
  const base = { runId, turn, providerId, modelId };
  const events = [];

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
  if (response.type === "failure") {
    events.push({
      ...base,
      type: ModelEventType.ProviderError,
      error: normalizeProviderError(response.error, { providerId, modelId })
    });
  } else {
    events.push({
      ...base,
      type: ModelEventType.Finished,
      finishReason: response.finishReason ?? (response.type === "tool_calls" ? "tool-calls" : "stop")
    });
  }

  return events;
}

function requireDirectProvider(provider: Provider | undefined): Provider {
  if (!provider) {
    throw new CoreError("PROVIDER_NOT_FOUND", "Provider not resolved for direct provider call");
  }
  return provider;
}

function normalizeProviderError(
  error: ProviderError | LegacyProviderError,
  model: { providerId: string; modelId: string }
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

async function executeTool(
  call: ToolCall,
  execute: (input: unknown, context: ToolExecutionContext) => Promise<ToolResult> | ToolResult,
  signal?: AbortSignal
): Promise<ToolResult> {
  try {
    const context: ToolExecutionContext = { call };
    if (signal) {
      context.signal = signal;
    }
    return await execute(call.input, context);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "TOOL_EXECUTION_FAILED",
        message: error instanceof Error ? error.message : "Tool execution failed",
        details: error
      }
    };
  }
}

function toCoreError(error: unknown): CoreError {
  return error instanceof CoreError
    ? error
    : new CoreError("PROVIDER_FAILED", error instanceof Error ? error.message : "Unknown provider failure", error);
}
