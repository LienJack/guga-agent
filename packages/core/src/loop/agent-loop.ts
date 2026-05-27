import { CoreError, type CoreErrorCode } from "../contracts/errors";
import { AgentEventType, type AgentEvent } from "../contracts/events";
import { HookPhase } from "../contracts/hooks";
import { ModelEventType } from "../contracts/model-events";
import type { CoreMessage, ToolCall } from "../contracts/messages";
import type { LegacyProviderError, Provider, ProviderError, ProviderRequest, ProviderResponse } from "../contracts/provider";
import { ProviderErrorCategory } from "../contracts/provider";
import type { AgentRunFailure, AgentRunOptions, AgentRunResult } from "../contracts/runtime";
import type { ToolAvailabilityContext } from "../contracts/tool-runtime";
import type { ToolDefinition } from "../contracts/tools";
import { ModelInputProjector } from "../context/model-input-projection";
import { contextPressureEvent, projectionCreatedEvent, shouldEmitContextPressure } from "../context/context-pressure";
import { CompactionService } from "../context/compaction-service";
import { compactionSummarySource, compactedRetryMessages, compactedRetryPolicyDecisions } from "../context/compacted-projection";
import { truncateContextSources } from "../context/context-truncation";
import { InMemoryContextDecisionLedger, type ContextDecisionLedger } from "../context/context-decision-ledger";
import { ReinjectionService } from "../context/reinjection-service";
import type { CompactionResult, ContextPolicyDecision, ContextSourceDescriptor, ReinjectionSource } from "../contracts/context";
import { ContextSourceKind, ContextSourcePriority } from "../contracts/context";
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
  projector?: ModelInputProjector;
  compactionService?: CompactionService;
  contextDecisionLedger?: ContextDecisionLedger;
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
  private readonly projector: ModelInputProjector;
  private readonly compactionService: CompactionService;
  private readonly contextDecisionLedger: ContextDecisionLedger;
  private readonly router: ProviderRouter | undefined;
  private readonly availabilityContext: ToolAvailabilityContext;

  constructor(options: AgentLoopOptions) {
    this.registry = options.registry;
    this.eventBus = options.eventBus ?? new EventBus();
    this.eventStartIndex = options.eventStartIndex;
    this.hookKernel = options.hookKernel;
    this.permissionKernel = options.permissionKernel;
    this.resultPolicy = options.resultPolicy;
    this.projector = options.projector ?? new ModelInputProjector();
    this.compactionService = options.compactionService ?? new CompactionService();
    this.contextDecisionLedger = options.contextDecisionLedger ?? new InMemoryContextDecisionLedger();
    this.router = options.router;
    this.availabilityContext = options.availabilityContext ?? {};
  }

  async run(options: AgentRunOptions): Promise<AgentRunResult> {
    const runId = options.runId ?? crypto.randomUUID();
    const maxTurns = options.maxTurns ?? 8;
    const eventStartIndex = this.eventStartIndex ?? this.eventBus.events.length;
    const state = new ConversationState();
    state.addUserMessage(options.input);
    let overridePolicyDecisions: Parameters<ModelInputProjector["assemble"]>[0]["policyDecisions"] | undefined;
    let reactiveRetries = 0;

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
      const projectionResult = await this.prepareProjection({
        runId,
        turn,
        messages,
        tools,
        ...(overridePolicyDecisions ? { policyDecisions: overridePolicyDecisions } : {}),
        model: modelTargetFor({ router: this.router, registry: this.registry, directProvider, options })
      });
      if (projectionResult instanceof CoreError) {
        return this.fail(runId, eventStartIndex, projectionResult, "hook_failed");
      }
      const projection = projectionResult.projection;
      if (shouldEmitContextPressure(projection.pressure)) {
        this.publish(contextPressureEvent(projection));
      }
      if (projection.pressure.level === "compact" && !projectionResult.alreadyCompacted) {
        const compacted = await this.compactForRetry(runId, turn, projection, undefined, "proactive-threshold");
        if (compacted instanceof CoreError) {
          return this.fail(runId, eventStartIndex, compacted, "hook_failed");
        }
        state.replaceMessages(compacted.messages);
        overridePolicyDecisions = compacted.policyDecisions;
        continue;
      }
      const routeResult = this.router
        ? await this.router.route({
            runId,
            turn,
            messages: projection.messages,
            tools: projection.tools,
            ...(options.purpose ? { purpose: options.purpose } : {}),
            ...(options.signal ? { signal: options.signal } : {})
          })
        : await this.callDirectProvider(runId, turn, requireDirectProvider(directProvider), projection.messages, projection.tools, options);

      for (const event of routeResult.events) {
        this.publish({ type: AgentEventType.ModelEvent, runId, turn, event });
      }

      if (!routeResult.ok) {
        const providerError = providerErrorFromRouterError(routeResult.error);
        if (providerError?.category === ProviderErrorCategory.ContextOverflow && reactiveRetries < 1) {
          const compacted = await this.compactForRetry(runId, turn, projection, providerError, "provider-overflow");
          if (compacted instanceof CoreError) {
            return this.fail(runId, eventStartIndex, compacted, "hook_failed");
          }
          state.replaceMessages(compacted.messages);
          overridePolicyDecisions = compacted.policyDecisions;
          reactiveRetries += 1;
          continue;
        }
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
        if (providerError.category === ProviderErrorCategory.ContextOverflow && reactiveRetries < 1) {
          const compacted = await this.compactForRetry(runId, turn, projection, providerError, "provider-overflow");
          if (compacted instanceof CoreError) {
            return this.fail(runId, eventStartIndex, compacted, "hook_failed");
          }
          state.replaceMessages(compacted.messages);
          overridePolicyDecisions = compacted.policyDecisions;
          reactiveRetries += 1;
          continue;
        }
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

  private async runContextHook(
    phase:
      | typeof HookPhase.ResourcesDiscover
      | typeof HookPhase.ContextAssemble
      | typeof HookPhase.ContextBudget
      | typeof HookPhase.ContextTruncate
      | typeof HookPhase.ContextCompactBefore
      | typeof HookPhase.ContextCompactAfter
      | typeof HookPhase.ContextReinject,
    context: Parameters<HookKernel["runContextHook"]>[1]
  ): Promise<CoreError | undefined> {
    if (!this.hookKernel) {
      return undefined;
    }
    const result = await this.hookKernel.runContextHook(phase, context);
    if (!result.ok) {
      return new CoreError("HOOK_FAILED", result.error.message, {
        hook: result.failedHook,
        error: result.error
      });
    }
    const denied = result.decisions.find((decision) => decision.kind === "gate" && !decision.allowed);
    if (denied) {
      return new CoreError("HOOK_FAILED", denied.reason ?? "Context hook denied", { decision: denied });
    }
    return undefined;
  }

  private async compactForRetry(
    runId: string,
    turn: number,
    projection: ReturnType<ModelInputProjector["assemble"]>,
    providerError: ProviderError | undefined,
    trigger: CompactionResult["trigger"]
  ): Promise<CoreError | { messages: ProviderRequest["messages"]; policyDecisions: Parameters<ModelInputProjector["assemble"]>[0]["policyDecisions"] }> {
    const beforeHook = await this.runContextHook(HookPhase.ContextCompactBefore, {
      runId,
      turn,
      runtimeContextId: runId,
      projection,
      sources: projection.sourceDescriptors
    });
    if (beforeHook instanceof CoreError) {
      return beforeHook;
    }

    const parentSummaryRef = parentSummaryRefFor(projection);
    const compacted = this.compactionService.compact({
      projection,
      trigger,
      ...(parentSummaryRef ? { parentSummaryRef } : {}),
      iterationNo: iterationNoFor(projection) + 1
    });
    this.publish({
      type: AgentEventType.ContextCompactStarted,
      runId,
      turn,
      projectionId: projection.id,
      trigger
    });
    this.publish({
      type: compacted.result.failed ? AgentEventType.ContextCompactFailed : AgentEventType.ContextCompactCompleted,
      runId,
      turn,
      projectionId: projection.id,
      result: compacted.result
    });
    const afterHook = await this.runContextHook(HookPhase.ContextCompactAfter, {
      runId,
      turn,
      runtimeContextId: runId,
      projection,
      sources: projection.sourceDescriptors,
      compaction: compacted.result
    });
    if (afterHook instanceof CoreError) {
      return afterHook;
    }
    if (compacted.result.failed) {
      return new CoreError("PROVIDER_FAILED", providerError?.message ?? "Context compaction failed", providerError);
    }

    const reinjected = await this.reinjectAfterCompaction(runId, turn, projection, compacted.result);
    if (reinjected instanceof CoreError) {
      return reinjected;
    }
    this.contextDecisionLedger.record(projection, compacted.result.boundary);

    return {
      messages: compactedRetryMessages(projection, compacted.result, [compactionSummarySource(compacted.result), ...reinjected.descriptors]),
      policyDecisions: [
        ...compactedRetryPolicyDecisions(projection, compacted.result),
        ...compacted.decisions,
        ...reinjected.decisions
      ]
    };
  }

  private async prepareProjection(options: {
    runId: string;
    turn: number;
    messages: readonly CoreMessage[];
    tools: readonly ToolDefinition[];
    model: ReturnType<typeof modelTargetFor>;
    policyDecisions?: ContextPolicyDecision[];
  }): Promise<CoreError | { projection: ReturnType<ModelInputProjector["assemble"]>; alreadyCompacted: boolean }> {
    const discoverHook = await this.collectContextHook(HookPhase.ResourcesDiscover, {
      runId: options.runId,
      turn: options.turn,
      runtimeContextId: options.runId
    });
    if (discoverHook instanceof CoreError) {
      return discoverHook;
    }
    const discoveredSources = contextSourcesFromDecisions(discoverHook.decisions);

    let projection = this.projector.assemble({
      runId: options.runId,
      turn: options.turn,
      messages: options.messages,
      tools: options.tools,
      ...(options.policyDecisions ? { policyDecisions: options.policyDecisions } : {}),
      ...(discoveredSources.length ? { additionalSources: discoveredSources } : {}),
      ...modelTargetOption(options.model)
    });
    let alreadyCompacted = hasCompactionSummary(projection.messages);
    this.publish(projectionCreatedEvent(projection));

    const assembleHook = await this.runContextHook(HookPhase.ContextAssemble, {
      runId: options.runId,
      turn: options.turn,
      runtimeContextId: options.runId,
      projection,
      sources: projection.sourceDescriptors
    });
    if (assembleHook instanceof CoreError) {
      return assembleHook;
    }

    const budgetHook = await this.runContextHook(HookPhase.ContextBudget, {
      runId: options.runId,
      turn: options.turn,
      runtimeContextId: options.runId,
      projection,
      sources: projection.sourceDescriptors
    });
    if (budgetHook instanceof CoreError) {
      return budgetHook;
    }

    if (projection.pressure.level !== "none") {
      const target = projection.budget.usableInputTokens
        ? Math.floor(projection.budget.usableInputTokens * projection.budget.warningThreshold)
        : Math.floor(projection.budget.estimatedInputTokens * projection.budget.warningThreshold);
      const truncated = truncateContextSources({ sources: projection.sourceDescriptors, targetTokenEstimate: target });
      const truncateHook = await this.runContextHook(HookPhase.ContextTruncate, {
        runId: options.runId,
        turn: options.turn,
        runtimeContextId: options.runId,
        projection,
        sources: truncated.retained
      });
      if (truncateHook instanceof CoreError) {
        return truncateHook;
      }
      if (truncated.decisions.length > 0) {
        projection = this.projector.assemble({
          runId: options.runId,
          turn: options.turn,
          messages: messagesWithoutSnippedSources(projection.messages, truncated.snipped),
          tools: options.tools,
          policyDecisions: [
            ...projection.policyDecisions,
            ...truncated.decisions
          ],
          additionalSources: discoveredSources.filter((source) => truncated.retained.some((retained) => retained.id === source.id)),
          ...modelTargetOption(options.model)
        });
        alreadyCompacted = alreadyCompacted || hasCompactionSummary(projection.messages);
        this.publish(projectionCreatedEvent(projection));
      }
    }

    this.contextDecisionLedger.record(projection);
    return { projection, alreadyCompacted };
  }

  private async collectContextHook(
    phase:
      | typeof HookPhase.ResourcesDiscover
      | typeof HookPhase.ContextReinject,
    context: Parameters<HookKernel["runContextHook"]>[1]
  ): Promise<CoreError | { decisions: ContextPolicyDecision[] }> {
    if (!this.hookKernel) {
      return { decisions: [] };
    }
    const result = await this.hookKernel.runContextHook(phase, context);
    if (!result.ok) {
      return new CoreError("HOOK_FAILED", result.error.message, {
        hook: result.failedHook,
        error: result.error
      });
    }
    const denied = result.decisions.find((decision) => decision.kind === "gate" && !decision.allowed);
    if (denied) {
      return new CoreError("HOOK_FAILED", denied.reason ?? "Context hook denied", { decision: denied });
    }
    return { decisions: result.decisions };
  }

  private async reinjectAfterCompaction(
    runId: string,
    turn: number,
    projection: ReturnType<ModelInputProjector["assemble"]>,
    compaction: CompactionResult
  ): Promise<CoreError | { descriptors: ContextSourceDescriptor[]; decisions: ContextPolicyDecision[] }> {
    const sources = defaultReinjectionSources(runId, projection);
    const hook = await this.collectContextHook(HookPhase.ContextReinject, {
      runId,
      turn,
      runtimeContextId: runId,
      projection,
      sources: projection.sourceDescriptors,
      compaction,
      reinjectionSources: sources
    });
    if (hook instanceof CoreError) {
      return hook;
    }
    const hookSources = reinjectionSourcesFromDecisions(hook.decisions);
    const reinjectionSources = [...sources, ...hookSources];
    const descriptors = new ReinjectionService({ runtimeContextId: runId }).descriptorsFor(reinjectionSources);
    this.publish({
      type: AgentEventType.ContextReinjected,
      runId,
      turn,
      projectionId: projection.id,
      sources: reinjectionSources
    });
    return {
      descriptors,
      decisions: [
        ...hook.decisions,
        {
          id: `${compaction.id}-active-state`,
          kind: "reinjection",
          phase: "context.reinject",
          sourceIds: descriptors.map((source) => source.id),
          reason: "restored active tools, permission mode, and discovered runtime context after compaction",
          metadata: {
            boundaryId: compaction.boundary.id
          }
        }
      ]
    };
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

function modelTargetFor(options: {
  router: ProviderRouter | undefined;
  registry: CapabilityRegistry;
  directProvider: Provider | undefined;
  options: AgentRunOptions;
}) {
  if (options.router) {
    const policyModel = options.router.metadataFor(options.options.purpose);
    return {
      ...(options.options.purpose ? { purpose: options.options.purpose } : {}),
      ...(policyModel ? {
        providerId: policyModel.providerId,
        modelId: policyModel.modelId,
        metadata: policyModel
      } : {})
    };
  }

  if (!options.directProvider) {
    return undefined;
  }

  const modelId = options.options.modelId ?? options.directProvider.id;
  const metadata = options.registry.getModel(options.directProvider.id, modelId);
  return {
    providerId: options.directProvider.id,
    modelId,
    ...(options.options.purpose ? { purpose: options.options.purpose } : {}),
    ...(metadata ? { metadata } : {})
  };
}

function modelTargetOption(
  model: ReturnType<typeof modelTargetFor>
): { model: NonNullable<ReturnType<typeof modelTargetFor>> } | Record<string, never> {
  return model ? { model } : {};
}

function contextSourcesFromDecisions(decisions: readonly ContextPolicyDecision[]): ContextSourceDescriptor[] {
  return decisions.flatMap((decision) => {
    if (decision.kind !== "source-contribution") {
      return [];
    }
    const sources = decision.metadata?.sources;
    return Array.isArray(sources) ? sources.filter(isContextSourceDescriptor) : [];
  });
}

function reinjectionSourcesFromDecisions(decisions: readonly ContextPolicyDecision[]): ReinjectionSource[] {
  return decisions.flatMap((decision) => {
    if (decision.kind !== "source-contribution" && decision.kind !== "reinjection") {
      return [];
    }
    const sources = decision.metadata?.reinjectionSources;
    return Array.isArray(sources) ? sources.filter(isReinjectionSource) : [];
  });
}

function defaultReinjectionSources(runId: string, projection: ReturnType<ModelInputProjector["assemble"]>): ReinjectionSource[] {
  return [
    ...projection.tools.map((tool) => ({
      id: `reinjected-tool-${tool.name}`,
      kind: ContextSourceKind.ActiveTool,
      priority: ContextSourcePriority.High,
      content: `Active tool: ${tool.name}. Effect: ${tool.effect}.`,
      runtimeContextId: runId,
      metadata: {
        toolName: tool.name,
        effect: tool.effect
      }
    })),
    {
      id: "reinjected-permission-mode",
      kind: ContextSourceKind.PermissionMode,
      priority: ContextSourcePriority.High,
      content: "Permission mode remains governed by the active runtime policy.",
      runtimeContextId: runId
    }
  ];
}

function messagesWithoutSnippedSources(messages: readonly CoreMessage[], snipped: readonly ContextSourceDescriptor[]): CoreMessage[] {
  const snippedIndexes = new Set(snipped.flatMap((source) => source.messageIndexes ?? []));
  return messages.filter((_message, index) => !snippedIndexes.has(index));
}

function hasCompactionSummary(messages: readonly CoreMessage[]): boolean {
  return messages.some((message) => message.role === "user" && message.content.includes("[Compaction summary:"));
}

function parentSummaryRefFor(projection: ReturnType<ModelInputProjector["assemble"]>): string | undefined {
  const summary = projection.sourceDescriptors.find((source) => source.kind === ContextSourceKind.CompactionSummary);
  return summary?.id;
}

function iterationNoFor(projection: ReturnType<ModelInputProjector["assemble"]>): number {
  const summaryIterations = projection.sourceDescriptors
    .filter((source) => source.kind === ContextSourceKind.CompactionSummary)
    .map((source) => Number(source.provenance.metadata?.iterationNo ?? source.metadata?.iterationNo ?? 0))
    .filter((value) => Number.isFinite(value));
  return summaryIterations.length === 0 ? 0 : Math.max(...summaryIterations);
}

function isContextSourceDescriptor(value: unknown): value is ContextSourceDescriptor {
  if (!value || typeof value !== "object") {
    return false;
  }
  const source = value as Partial<ContextSourceDescriptor>;
  return typeof source.id === "string" &&
    typeof source.kind === "string" &&
    typeof source.priority === "string" &&
    !!source.provenance &&
    !!source.tokenEstimate &&
    typeof source.modelVisible === "boolean";
}

function isReinjectionSource(value: unknown): value is ReinjectionSource {
  if (!value || typeof value !== "object") {
    return false;
  }
  const source = value as Partial<ReinjectionSource>;
  return typeof source.id === "string" &&
    typeof source.kind === "string" &&
    typeof source.priority === "string";
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

function providerErrorFromRouterError(error: { details?: unknown }): ProviderError | undefined {
  if ("providerError" in error && isProviderError(error.providerError)) {
    return error.providerError;
  }
  return providerErrorFromDetails(error.details);
}

function providerErrorFromDetails(details: unknown): ProviderError | undefined {
  if (!details || typeof details !== "object") {
    return undefined;
  }
  const record = details as { providerError?: ProviderError };
  return isProviderError(record.providerError) ? record.providerError : undefined;
}

function isProviderError(error: unknown): error is ProviderError {
  return !!error && typeof error === "object" && "category" in error && "code" in error && "message" in error;
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
