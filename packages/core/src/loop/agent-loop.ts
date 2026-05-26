import { CoreError, type CoreErrorCode } from "../contracts/errors";
import { AgentEventType, type AgentEvent } from "../contracts/events";
import { ModelEventType } from "../contracts/model-events";
import type { ToolCall } from "../contracts/messages";
import type { LegacyProviderError, Provider, ProviderError, ProviderRequest, ProviderResponse } from "../contracts/provider";
import { ProviderErrorCategory } from "../contracts/provider";
import type { AgentRunFailure, AgentRunOptions, AgentRunResult } from "../contracts/runtime";
import type { ToolAvailabilityContext } from "../contracts/tool-runtime";
import type { ToolDefinition } from "../contracts/tools";
import { EventBus } from "../events/event-bus";
import { HookKernel } from "../hooks/hook-kernel";
import { PermissionKernel } from "../permissions/permission-kernel";
import { CapabilityRegistry } from "../registry/capability-registry";
import { ProviderRouter } from "../router/provider-router";
import { ConversationState } from "../state/conversation-state";
import { ExecutionPipeline, toolVisibilityDecision } from "../tools/execution-pipeline";
import { ResultPolicy } from "../tools/result-policy";
import { ToolScheduler } from "../tools/tool-scheduler";

export type AgentLoopOptions = {
  registry: CapabilityRegistry;
  eventBus?: EventBus;
  eventStartIndex?: number;
  hookKernel?: HookKernel;
  permissionKernel?: PermissionKernel;
  resultPolicy?: ResultPolicy;
  router?: ProviderRouter;
  availabilityContext?: ToolAvailabilityContext;
};

export class AgentLoop {
  private readonly registry: CapabilityRegistry;
  private readonly eventBus: EventBus;
  private readonly eventStartIndex: number | undefined;
  private readonly hookKernel: HookKernel | undefined;
  private readonly permissionKernel: PermissionKernel | undefined;
  private readonly resultPolicy: ResultPolicy | undefined;
  private readonly router: ProviderRouter | undefined;
  private readonly availabilityContext: ToolAvailabilityContext;

  constructor(options: AgentLoopOptions) {
    this.registry = options.registry;
    this.eventBus = options.eventBus ?? new EventBus();
    this.eventStartIndex = options.eventStartIndex;
    this.hookKernel = options.hookKernel;
    this.permissionKernel = options.permissionKernel;
    this.resultPolicy = options.resultPolicy;
    this.router = options.router;
    this.availabilityContext = options.availabilityContext ?? {};
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
      const tools = visibleTools(this.registry.listTools(), this.availabilityContext, this.eventBus, runId, turn);
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
      const pipeline = new ExecutionPipeline({
        registry: this.registry,
        eventBus: this.eventBus,
        ...(this.hookKernel ? { hookKernel: this.hookKernel } : {}),
        ...(this.permissionKernel ? { permissionKernel: this.permissionKernel } : {}),
        ...(this.resultPolicy ? { resultPolicy: this.resultPolicy } : {}),
        availabilityContext: this.availabilityContext
      });
      const scheduler = new ToolScheduler({ allowScopedParallelism: true });

      const scheduledCalls = response.toolCalls.map((call) => ({
        call,
        tool: this.registry.getTool(call.name) ?? {
          name: call.name,
          effect: "external" as const,
          runtime: { scheduler: { concurrency: "serial" as const } }
        }
      }));

      let batchIndex = 0;
      for (const batch of scheduler.createBatches(scheduledCalls)) {
        const batchId = `turn-${turn}-batch-${batchIndex}`;
        batchIndex += 1;
        const executions = batch.calls.map((scheduledCall) => () => pipeline.execute({
          runId,
          turn,
          call: scheduledCall.call,
          batchId,
          ...(options.signal ? { signal: options.signal } : {})
        }));
        const settled = batch.parallel
          ? await Promise.allSettled(executions.map((execute) => execute()))
          : await settleSerially(executions);
        for (const result of settled) {
          if (result.status === "rejected") {
            const coreError = toCoreError(result.reason, "HOOK_FAILED");
            return this.fail(runId, eventStartIndex, coreError, coreError.code === "HOOK_FAILED" ? "hook_failed" : "tool_failed");
          }
          state.addToolResult(result.value.call, result.value.result);
        }
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

async function settleSerially<T>(executions: Array<() => Promise<T>>): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  for (const execute of executions) {
    try {
      results.push({ status: "fulfilled", value: await execute() });
    } catch (reason) {
      results.push({ status: "rejected", reason });
    }
  }
  return results;
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

function visibleTools(
  tools: ToolDefinition[],
  context: ToolAvailabilityContext,
  eventBus: EventBus,
  runId: string,
  turn: number
): ToolDefinition[] {
  return tools.filter((tool) => {
    const decision = toolVisibilityDecision(tool, context);
    if (decision.visible) {
      return true;
    }
    eventBus.publish({
      type: AgentEventType.ToolVisibilityFiltered,
      runId,
      turn,
      decision
    });
    return false;
  });
}

function toCoreError(error: unknown, fallbackCode: CoreErrorCode = "PROVIDER_FAILED"): CoreError {
  return error instanceof CoreError
    ? error
    : new CoreError(fallbackCode, error instanceof Error ? error.message : "Unknown provider failure", error);
}
