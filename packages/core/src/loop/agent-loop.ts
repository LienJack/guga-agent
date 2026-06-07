import { CoreError, type CoreErrorCode } from "../contracts/errors";
import { AgentEventType, type AgentEvent } from "../contracts/events";
import { HookPhase } from "../contracts/hooks";
import { ModelEventType } from "../contracts/model-events";
import type { CoreMessage, ToolCall } from "../contracts/messages";
import type { LegacyProviderError, Provider, ProviderError, ProviderRequest, ProviderResponse } from "../contracts/provider";
import { ProviderErrorCategory } from "../contracts/provider";
import type { AgentRunFailure, AgentRunOptions, AgentRunResult } from "../contracts/runtime";
import type { DurablePublishResult } from "../events/event-bus";
import type { ToolAvailabilityContext, ToolCapabilityLease } from "../contracts/tool-runtime";
import type { ToolDefinition } from "../contracts/tools";
import { ModelInputProjector } from "../context/model-input-projection";
import { buildAccountableTraceSource } from "../context/accountable-trace";
import { contextPressureEvent, projectionCreatedEvent, shouldEmitContextPressure } from "../context/context-pressure";
import { CompactionService } from "../context/compaction-service";
import { compactionSummarySource, compactedRetryMessages, compactedRetryPolicyDecisions } from "../context/compacted-projection";
import { truncateContextSources } from "../context/context-truncation";
import { InMemoryContextDecisionLedger, type ContextDecisionLedger } from "../context/context-decision-ledger";
import { ReinjectionService } from "../context/reinjection-service";
import { buildStateProjectionSource } from "../context/state-projection";
import type { CompactionResult, ContextPolicyDecision, ContextSourceDescriptor, ReinjectionSource } from "../contracts/context";
import { ContextSourceKind, ContextSourcePriority } from "../contracts/context";
import { EventBus } from "../events/event-bus";
import { HookKernel } from "../hooks/hook-kernel";
import { PermissionKernel } from "../permissions/permission-kernel";
import { CapabilityRegistry } from "../registry/capability-registry";
import { ProviderRouter } from "../router/provider-router";
import { ConversationState } from "../state/conversation-state";
import { ExecutionPipeline } from "../tools/execution-pipeline";
import { projectToolView } from "../tools/tool-projection";
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

    const runStarted = await this.publishDurable({
      type: AgentEventType.RunStarted,
      runId,
      input: options.input
    }, durableKey(runId, 0, "run.started", runId));
    if (runStarted instanceof CoreError) {
      return this.fail(runId, eventStartIndex, runStarted, "persistence_unavailable");
    }

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
      const toolView = projectToolView({
        tools: this.registry.listTools(),
        context: this.availabilityContext,
        runId,
        turn
      });
      for (const decision of toolView.filtered) {
        this.publish({
          type: AgentEventType.ToolVisibilityFiltered,
          runId,
          turn,
          decision,
          lease: toolView.lease
        });
      }
      const projectionResult = await this.prepareProjection({
        runId,
        turn,
        messages,
        tools: toolView.visibleTools,
        toolLease: toolView.lease,
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
            eventBus: this.eventBus,
            projection,
            ...(options.purpose ? { purpose: options.purpose } : {}),
            ...(options.signal ? { signal: options.signal } : {})
          })
        : await this.callDirectProvider(runId, turn, requireDirectProvider(directProvider), projection, options);

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
      const modelResponded = await this.publishDurable({
        type: AgentEventType.ModelResponded,
        runId,
        turn,
        response
      }, durableKey(runId, turn, "model.responded", routeResult.model.providerId));
      if (modelResponded instanceof CoreError) {
        return this.fail(runId, eventStartIndex, modelResponded, "persistence_interrupted");
      }
      if (response.usage) {
        const usage = await this.publishDurable({
          type: AgentEventType.UsageRecorded,
          runId,
          turn,
          usage: response.usage
        }, durableKey(runId, turn, "usage.recorded", routeResult.model.providerId));
        if (usage instanceof CoreError) {
          return this.fail(runId, eventStartIndex, usage, "persistence_interrupted");
        }
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
        const finished = await this.publishDurable({
          type: AgentEventType.RunFinished,
          runId,
          status: "completed"
        }, durableKey(runId, turn, "run.finished", "completed"));
        if (finished instanceof CoreError) {
          return this.fail(runId, eventStartIndex, finished, "persistence_interrupted");
        }
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
          ...(projection.toolLease ? { toolLease: projection.toolLease } : {}),
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
          const persistenceStatus = result.value.result.metadata?.persistenceStatus;
          if (persistenceStatus === "interrupted") {
            return this.fail(
              runId,
              eventStartIndex,
              new CoreError("PROVIDER_FAILED", "Tool terminal marker could not be durably recorded", result.value.result.metadata),
              "persistence_interrupted"
            );
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

  private async fail(runId: string, eventStartIndex: number, error: CoreError, reason: string): Promise<AgentRunFailure> {
    this.publish({
      type: AgentEventType.Error,
      runId,
      code: error.code,
      message: error.message,
      details: error.details
    });
    const finished = await this.publishDurable({
      type: AgentEventType.RunFinished,
      runId,
      status: "failed",
      reason
    }, durableKey(runId, 0, "run.finished", reason));
    if (finished instanceof CoreError) {
      this.publish({ type: AgentEventType.RunFinished, runId, status: "failed", reason: "persistence_interrupted" });
    }
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

  private async publishDurable(event: AgentEvent, idempotencyKey: string): Promise<CoreError | undefined> {
    const result = await this.eventBus.publishDurable(event, { idempotencyKey });
    if (!result.ok) {
      return new CoreError("PROVIDER_FAILED", `Durable event ${event.type} could not be recorded`, {
        persistenceStatus: "interrupted",
        durableResult: result
      });
    }
    return undefined;
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
    projection: ReturnType<ModelInputProjector["assemble"]>,
    options: AgentRunOptions
  ) {
    const messages = projection.messages;
    const tools = projection.tools;
    const requestEvent = {
      type: AgentEventType.ModelRequested,
      runId,
      turn,
      providerId: provider.id,
      messages,
      toolNames: tools.map((tool) => tool.name),
      ...(projection.toolLease ? { toolLease: projection.toolLease } : {})
    } as const;
    const start = await this.eventBus.publishDurable(requestEvent, {
      idempotencyKey: durableKey(runId, turn, "model.requested", provider.id)
    });
    if (!start.ok) {
      return durableProviderFailure(runId, turn, provider.id, options.modelId ?? provider.id, start, "Provider request was not durably recorded");
    }

    const inputCommitted = await this.eventBus.publishDurable({
      type: AgentEventType.ProviderInputCommitted,
      runId,
      turn,
      projectionId: projection.id,
      ...(projection.hash ? { projectionHash: projection.hash } : {})
    }, {
      idempotencyKey: durableKey(runId, turn, "provider.input.committed", projection.id)
    });
    if (!inputCommitted.ok) {
      return durableProviderFailure(runId, turn, provider.id, options.modelId ?? provider.id, inputCommitted, "Provider input was not durably recorded");
    }

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
    const start = await this.eventBus.publishDurable({
      type: AgentEventType.ContextCompactStarted,
      runId,
      turn,
      projectionId: projection.id,
      trigger
    }, {
      idempotencyKey: durableKey(runId, turn, "context.compact.started", projection.id)
    });
    if (!start.ok) {
      return new CoreError("PROVIDER_FAILED", "Context compaction start marker could not be durably recorded", start);
    }
    const preCommit = await this.eventBus.appendDurableRecord({
      type: "context.compact.pre_commit",
      runId,
      turn,
      projectionId: projection.id,
      trigger,
      boundary: compacted.result.boundary
    }, {
      eventType: "context.compact.pre_commit",
      idempotencyKey: durableKey(runId, turn, "context.compact.pre_commit", projection.id)
    });
    if (!preCommit.ok) {
      return new CoreError("PROVIDER_FAILED", "Context compaction pre-commit marker could not be durably recorded", preCommit);
    }
    const terminal = await this.eventBus.publishDurable({
      type: compacted.result.failed ? AgentEventType.ContextCompactFailed : AgentEventType.ContextCompactCompleted,
      runId,
      turn,
      projectionId: projection.id,
      result: compacted.result
    }, {
      idempotencyKey: durableKey(runId, turn, "context.compact.terminal", projection.id)
    });
    if (!terminal.ok) {
      return new CoreError("PROVIDER_FAILED", "Context compaction terminal marker could not be durably recorded", {
        persistenceStatus: "interrupted",
        durableResult: terminal
      });
    }
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
        ...compactedRetryPolicyDecisions(compacted.result),
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
    toolLease?: ToolCapabilityLease;
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
    const basePolicyDecisions = [
      ...(options.policyDecisions ? options.policyDecisions : []),
      ...discoverHook.decisions
    ];
    let additionalSources = discoveredSources;
    let policyDecisions = basePolicyDecisions;

    let projection = this.projector.assemble({
      runId: options.runId,
      turn: options.turn,
      messages: options.messages,
      tools: options.tools,
      ...(options.toolLease ? { toolLease: options.toolLease } : {}),
      ...(policyDecisions.length ? { policyDecisions } : {}),
      ...(additionalSources.length ? { additionalSources } : {}),
      ...modelTargetOption(options.model)
    });
    const derivedSources = derivedContextSources(projection);
    if (derivedSources.length > 0) {
      additionalSources = [...additionalSources, ...derivedSources];
      policyDecisions = [
        ...policyDecisions,
        {
          id: `attention-derived-${projection.id}`,
          kind: "annotation",
          phase: "context.assemble",
          sourceIds: derivedSources.map((source) => source.id),
          reason: "derived state and trace context sources from the stable base projection",
          metadata: {
            sourceKinds: derivedSources.map((source) => source.kind)
          }
        }
      ];
      projection = this.projector.assemble({
        runId: options.runId,
        turn: options.turn,
        messages: options.messages,
        tools: options.tools,
        ...(options.toolLease ? { toolLease: options.toolLease } : {}),
        policyDecisions,
        additionalSources,
        ...modelTargetOption(options.model)
      });
    }
    let alreadyCompacted = hasCompactionSummary(projection.messages);
    const projectionPublished = await this.publishDurable(
      projectionCreatedEvent(projection),
      durableKey(options.runId, options.turn, "context.projection.created", projection.id)
    );
    if (projectionPublished instanceof CoreError) {
      return projectionPublished;
    }

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
          ...(options.toolLease ? { toolLease: options.toolLease } : {}),
          policyDecisions: [
            ...policyDecisions,
            ...truncated.decisions
          ],
          additionalSources: additionalSources.filter((source) => truncated.retained.some((retained) => retained.id === source.id)),
          ...modelTargetOption(options.model)
        });
        alreadyCompacted = alreadyCompacted || hasCompactionSummary(projection.messages);
        const truncatedProjectionPublished = await this.publishDurable(
          projectionCreatedEvent(projection),
          durableKey(options.runId, options.turn, "context.projection.created", projection.id)
        );
        if (truncatedProjectionPublished instanceof CoreError) {
          return truncatedProjectionPublished;
        }
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
    ...projection.sourceDescriptors
      .filter(isAttentionReinjectionDescriptor)
      .map((source) => ({
        id: `reinjected-${source.id}`,
        kind: source.kind,
        priority: source.priority === ContextSourcePriority.Critical ? ContextSourcePriority.High : source.priority,
        content: attentionReinjectionContent(source),
        ...(source.references ? { references: source.references } : {}),
        runtimeContextId: runId,
        metadata: {
          sourceId: source.id,
          sourceKind: source.kind
        }
      })),
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

function isAttentionReinjectionDescriptor(
  source: ContextSourceDescriptor
): source is ContextSourceDescriptor & { kind: typeof ContextSourceKind.StateProjection | typeof ContextSourceKind.AccountableTrace } {
  return source.provenance.origin === "core" &&
    (source.kind === ContextSourceKind.StateProjection || source.kind === ContextSourceKind.AccountableTrace);
}

function derivedContextSources(projection: ReturnType<ModelInputProjector["assemble"]>): ContextSourceDescriptor[] {
  return [
    buildStateProjectionSource(projection),
    buildAccountableTraceSource(projection)
  ].filter((source): source is ContextSourceDescriptor => source !== undefined);
}

function attentionReinjectionContent(source: ContextSourceDescriptor): string {
  const labels = metadataItemLabels(source)
    .map((label) => `- ${label}`)
    .join("\n");
  const references = (source.references ?? [])
    .map((reference) => `${reference.type}:${reference.id}`)
    .join(", ");
  return [
    `${source.kind} continuity from current runtime facts.`,
    labels ? `Signals:\n${labels}` : "Signals: none",
    references ? `References: ${references}` : "References: none"
  ].join("\n");
}

function metadataItemLabels(source: ContextSourceDescriptor): string[] {
  const items = source.metadata?.items;
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return undefined;
      }
      const record = item as Record<string, unknown>;
      return typeof record.kind === "string" && typeof record.label === "string"
        ? `${record.kind}: ${record.label}`
        : undefined;
    })
    .filter((label): label is string => typeof label === "string");
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
    isReinjectionSourceKind(source.kind) &&
    typeof source.priority === "string";
}

function isReinjectionSourceKind(kind: unknown): kind is ReinjectionSource["kind"] {
  return kind === ContextSourceKind.ResourceFile ||
    kind === ContextSourceKind.PlanTodo ||
    kind === ContextSourceKind.SkillBody ||
    kind === ContextSourceKind.ActiveTool ||
    kind === ContextSourceKind.PermissionMode ||
    kind === ContextSourceKind.HostContext ||
    kind === ContextSourceKind.StateProjection ||
    kind === ContextSourceKind.AccountableTrace;
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

function durableKey(runId: string, turn: number, boundary: string, identity: string): string {
  return `${runId}:${turn}:${boundary}:${identity}`;
}

function durableProviderFailure(
  runId: string,
  turn: number,
  providerId: string,
  modelId: string,
  result: DurablePublishResult,
  message: string
) {
  const providerError = {
    category: ProviderErrorCategory.Fatal,
    code: "PROVIDER_FAILED",
    message,
    providerId,
    modelId,
    metadata: {
      persistenceStatus: "unavailable",
      durableResult: result
    }
  };
  return {
    ok: false as const,
    error: {
      code: "PROVIDER_FAILED" as const,
      message,
      details: providerError
    },
    events: [
      {
        type: ModelEventType.ProviderError,
        runId,
        turn,
        providerId,
        modelId,
        error: providerError
      }
    ]
  };
}

function toCoreError(error: unknown, fallbackCode: CoreErrorCode = "PROVIDER_FAILED"): CoreError {
  return error instanceof CoreError
    ? error
    : new CoreError(fallbackCode, error instanceof Error ? error.message : "Unknown provider failure", error);
}
