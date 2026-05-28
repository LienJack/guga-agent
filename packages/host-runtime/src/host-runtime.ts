import {
  createAgentRuntime,
  type AgentRuntime,
  type AgentRuntimeOptions,
  type CapabilityDescriptor
} from "@guga-agent/core";
import {
  createHostEventSequencer,
  type AuditSummaryResource,
  type CapabilityResource,
  type HostEventSequencer,
  type HostEvent,
  type InteractionRequest,
  type InteractionResource,
  type MetricsSnapshotResource,
  type OperationalDiagnosticResource,
  type OperationalStatusResource,
  type ProviderHealthResource,
  type QueuedRunInputResource,
  type QueuedRunInputSummaryResource,
  type RunInputMode,
  type RunResource,
  type SessionBranchResource,
  type SessionResource,
  type SessionTreeResource,
  type UsageCostResource
} from "@guga-agent/host-protocol";
import { projectAgentEvent } from "./event-projector";
import { InMemoryRunStore } from "./in-memory-run-store";

export type HostRuntimeOptions = {
  runtime?: AgentRuntime;
  runtimeOptions?: AgentRuntimeOptions;
  now?: () => Date;
  idFactory?: () => string;
};

export type StartRunOptions = {
  sessionId: string;
  input: string;
  providerId?: string;
  modelId?: string;
  maxTurns?: number;
};

export type EnqueueRunInputOptions = {
  mode: RunInputMode;
  text: string;
};

export type ForkSessionOptions = {
  parentBranchId?: string;
  createdFromRunId?: string;
  summary?: string;
};

export type RequestInteractionOptions = {
  sessionId: string;
  runId?: string;
  request: InteractionRequest;
};

export class HostRuntime {
  private readonly runtime: AgentRuntime;
  private readonly ownsRuntime: boolean;
  private readonly now: () => Date;
  private readonly idFactory: () => string;
  private readonly store = new InMemoryRunStore();
  private readonly activeRunControllers = new Map<string, AbortController>();
  private readonly activeRunCompletions = new Map<string, Promise<RunResource>>();
  private readonly activeRunSequencers = new Map<string, HostEventSequencer>();

  constructor(options: HostRuntimeOptions = {}) {
    this.runtime = options.runtime ?? createAgentRuntime(options.runtimeOptions ?? {});
    this.ownsRuntime = !options.runtime;
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
  }

  createSession(options: { title?: string } = {}): SessionResource {
    const timestamp = this.now().toISOString();
    const sessionId = `session-${this.idFactory()}`;
    const mainBranch: SessionBranchResource = {
      id: "main",
      sessionId,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const session: SessionResource = {
      id: sessionId,
      ...(options.title ? { title: options.title } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
      activeBranchId: mainBranch.id,
      branches: [mainBranch]
    };
    this.store.putSession(session);
    this.store.putBranch(mainBranch);
    return session;
  }

  getSession(sessionId: string): SessionResource | undefined {
    return this.store.getSession(sessionId);
  }

  listSessions(): SessionResource[] {
    return this.store.listSessions();
  }

  resumeSession(sessionId: string, options: { branchId?: string } = {}): SessionResource | undefined {
    const session = this.store.getSession(sessionId);
    if (!session) {
      return undefined;
    }
    if (!options.branchId) {
      return session;
    }
    const branch = this.store.listBranches(sessionId).find((candidate) => candidate.id === options.branchId);
    if (!branch) {
      return undefined;
    }
    this.store.updateSession(sessionId, {
      activeBranchId: branch.id,
      updatedAt: this.now().toISOString()
    });
    return this.store.getSession(sessionId);
  }

  forkSession(sessionId: string, options: ForkSessionOptions = {}): SessionResource | undefined {
    const session = this.store.getSession(sessionId);
    if (!session) {
      return undefined;
    }
    const timestamp = this.now().toISOString();
    const parentBranchId = options.parentBranchId ?? session.activeBranchId ?? "main";
    if (!this.store.listBranches(sessionId).some((branch) => branch.id === parentBranchId)) {
      return undefined;
    }
    const branch: SessionBranchResource = {
      id: `branch-${this.idFactory()}`,
      sessionId,
      parentBranchId,
      ...(options.createdFromRunId ? { createdFromRunId: options.createdFromRunId } : {}),
      ...(options.summary ? { summary: options.summary } : {}),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.store.putBranch(branch);
    this.store.updateSession(sessionId, {
      activeBranchId: branch.id,
      updatedAt: timestamp
    });
    return this.store.getSession(sessionId);
  }

  getSessionTree(sessionId: string): SessionTreeResource | undefined {
    const session = this.store.getSession(sessionId);
    if (!session) {
      return undefined;
    }
    return {
      sessionId,
      activeBranchId: session.activeBranchId ?? "main",
      branches: this.store.listBranches(sessionId)
    };
  }

  async startRun(options: StartRunOptions): Promise<RunResource> {
    const run = this.startRunDetached(options);
    return this.activeRunCompletions.get(run.id) ?? run;
  }

  startRunDetached(options: StartRunOptions): RunResource {
    const session = this.requireSession(options.sessionId);
    const timestamp = this.now().toISOString();
    const runId = `run-${this.idFactory()}`;
    const run: RunResource = {
      id: runId,
      sessionId: session.id,
      status: "running",
      input: options.input,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastSeq: 0,
      events: []
    };
    this.store.putRun(run);

    const sequencer = createHostEventSequencer({ now: this.now });
    const controller = new AbortController();
    this.activeRunControllers.set(runId, controller);
    this.activeRunSequencers.set(runId, sequencer);
    const unsubscribe = this.runtime.onEvent((event) => {
      const hostEvents = projectAgentEvent(event, { sessionId: session.id, runId, sequencer });
      this.store.appendEvents(runId, hostEvents);
      this.applyEventEffects(runId, hostEvents);
    });

    const completion = this.executeRun(options, {
      sessionId: session.id,
      branchId: session.activeBranchId ?? "main",
      runId,
      controller,
      sequencer,
      unsubscribe
    })
      .finally(() => {
        unsubscribe();
        this.activeRunControllers.delete(runId);
        this.activeRunCompletions.delete(runId);
        this.activeRunSequencers.delete(runId);
      });
    this.activeRunCompletions.set(runId, completion);
    void completion.catch(() => undefined);

    return run;
  }

  private async executeRun(
    options: StartRunOptions,
    state: {
      sessionId: string;
      branchId: string;
      runId: string;
      controller: AbortController;
      sequencer: HostEventSequencer;
      unsubscribe: () => void;
    }
  ): Promise<RunResource> {
    const result = await this.runtime.run({
      input: options.input,
      runId: state.runId,
      session: { sessionId: state.sessionId, branchId: state.branchId },
      signal: state.controller.signal,
      ...(options.providerId ? { providerId: options.providerId } : {}),
      ...(options.modelId ? { modelId: options.modelId } : {}),
      ...(options.maxTurns !== undefined ? { maxTurns: options.maxTurns } : {})
    }).catch((error: unknown) => ({
      ok: false as const,
      error: {
        code: "RUN_EXECUTION_ERROR",
        message: error instanceof Error ? error.message : "Run execution failed",
        details: error
      }
    }));

    const wasCancelled = state.controller.signal.aborted;
    const cancelError = {
      code: "RUN_CANCELLED",
      message: "Run was cancelled"
    };
    const terminalEvent = wasCancelled
      ? state.sequencer.next({
          type: "run.failed",
          sessionId: state.sessionId,
          runId: state.runId,
          error: cancelError
        })
      : result.ok
      ? state.sequencer.next({
          type: "run.completed",
          sessionId: state.sessionId,
          runId: state.runId,
          finalAnswer: result.finalAnswer
        })
      : state.sequencer.next({
          type: "run.failed",
          sessionId: state.sessionId,
          runId: state.runId,
          error: result.error
        });
    this.store.appendEvents(state.runId, [terminalEvent]);
    this.applyEventEffects(state.runId, [terminalEvent]);
    if (wasCancelled) {
      this.store.updateRun(state.runId, {
        status: "cancelled",
        error: cancelError,
        updatedAt: terminalEvent.occurredAt
      });
    }

    return this.store.getRun(state.runId) ?? {
      id: state.runId,
      sessionId: state.sessionId,
      status: wasCancelled ? "cancelled" : result.ok ? "completed" : "failed",
      input: options.input,
      createdAt: terminalEvent.occurredAt,
      updatedAt: terminalEvent.occurredAt,
      lastSeq: terminalEvent.seq
    };
  }

  cancelRun(runId: string): RunResource | undefined {
    const run = this.store.getRun(runId);
    if (!run) {
      return undefined;
    }
    if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
      return run;
    }
    this.activeRunControllers.get(runId)?.abort("Run cancelled");
    this.store.updateRun(runId, {
      status: "cancelled",
      updatedAt: this.now().toISOString()
    });
    return this.store.getRun(runId);
  }

  enqueueRunInput(runId: string, options: EnqueueRunInputOptions): RunResource | undefined {
    const run = this.store.getRun(runId);
    if (!run) {
      return undefined;
    }
    const timestamp = this.now().toISOString();
    const queuedInput: QueuedRunInputResource = {
      id: `input-${this.idFactory()}`,
      mode: options.mode,
      text: options.text,
      textPreview: previewText(options.text),
      createdAt: timestamp
    };
    const queuedInputs = [...(run.queuedInputs ?? []), queuedInput];
    this.store.updateRun(runId, {
      queuedInputs,
      updatedAt: timestamp
    });
    const sequencer = this.activeRunSequencers.get(runId)
      ?? createHostEventSequencer({ startSeq: run.lastSeq, now: this.now });
    const event = sequencer.next({
      type: "queue.updated",
      sessionId: run.sessionId,
      runId,
      pending: queuedInputs.map(queuedRunInputSummary)
    });
    this.store.appendEvents(runId, [event]);
    return this.store.getRun(runId);
  }

  requestInteraction(options: RequestInteractionOptions): InteractionResource | undefined {
    const session = this.store.getSession(options.sessionId);
    if (!session) {
      return undefined;
    }
    if (options.runId) {
      const run = this.store.getRun(options.runId);
      if (!run || run.sessionId !== options.sessionId) {
        return undefined;
      }
    }
    const timestamp = this.now().toISOString();
    const interaction: InteractionResource = {
      id: `interaction-${this.idFactory()}`,
      sessionId: options.sessionId,
      ...(options.runId ? { runId: options.runId } : {}),
      status: "pending",
      request: options.request,
      createdAt: timestamp
    };
    this.store.putInteraction(interaction);
    if (options.runId) {
      const run = this.store.getRun(options.runId);
      const sequencer = this.activeRunSequencers.get(options.runId)
        ?? createHostEventSequencer({ startSeq: run?.lastSeq ?? 0, now: this.now });
      this.store.appendEvents(options.runId, [
        sequencer.next({
          type: "interaction.requested",
          sessionId: options.sessionId,
          runId: options.runId,
          requestId: interaction.id,
          request: options.request
        })
      ]);
    }
    return interaction;
  }

  getInteraction(interactionId: string): InteractionResource | undefined {
    return this.store.getInteraction(interactionId);
  }

  resolveInteraction(interactionId: string, response: unknown): InteractionResource | undefined {
    const interaction = this.store.getInteraction(interactionId);
    if (!interaction) {
      return undefined;
    }
    const timestamp = this.now().toISOString();
    this.store.updateInteraction(interactionId, {
      status: "resolved",
      response,
      resolvedAt: timestamp
    });
    if (interaction.runId) {
      const run = this.store.getRun(interaction.runId);
      const sequencer = this.activeRunSequencers.get(interaction.runId)
        ?? createHostEventSequencer({ startSeq: run?.lastSeq ?? 0, now: this.now });
      this.store.appendEvents(interaction.runId, [
        sequencer.next({
          type: "interaction.resolved",
          sessionId: interaction.sessionId,
          runId: interaction.runId,
          requestId: interaction.id,
          response
        })
      ]);
    }
    return this.store.getInteraction(interactionId);
  }

  getRun(runId: string): RunResource | undefined {
    return this.store.getRun(runId);
  }

  listRunEvents(runId: string): HostEvent[] {
    return this.store.listEvents(runId);
  }

  listCapabilities(): CapabilityResource[] {
    return (this.runtime.listCapabilityDescriptors?.() ?? []).map(capabilityResourceFromDescriptor);
  }

  listProviderHealth(): ProviderHealthResource[] {
    const timestamp = this.now().toISOString();
    return (this.runtime.listCapabilityDescriptors?.() ?? [])
      .filter((descriptor) => descriptor.type === "provider")
      .map((descriptor) => ({
        providerId: descriptor.name,
        status: "unknown",
        checkedAt: timestamp,
        diagnostics: [{
          severity: "info",
          code: "HEALTH_CHECK_NOT_RUN",
          message: "Provider health checks are exposed as operation capabilities and have not been executed by the host"
        }]
      }));
  }

  listAuditSummaries(): AuditSummaryResource[] {
    return this.store.listRuns().map((run) => auditSummaryFromRun(run, this.store.listEvents(run.id)));
  }

  getMetricsSnapshot(): MetricsSnapshotResource {
    return metricsSnapshotFromEvents(this.store.listAllEvents(), this.now().toISOString());
  }

  getOperationalStatus(): OperationalStatusResource {
    const metrics = this.getMetricsSnapshot();
    return {
      updatedAt: metrics.updatedAt,
      capabilities: this.listCapabilities(),
      health: this.listProviderHealth(),
      audit: this.listAuditSummaries(),
      metrics,
      diagnostics: []
    };
  }

  async dispose(): Promise<void> {
    if (this.ownsRuntime) {
      await this.runtime.dispose();
    }
  }

  private requireSession(sessionId: string): SessionResource {
    const session = this.store.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return session;
  }

  private applyEventEffects(runId: string, events: HostEvent[]): void {
    for (const event of events) {
      if (event.type === "run.completed") {
        this.store.updateRun(runId, {
          status: "completed",
          ...(event.finalAnswer !== undefined ? { finalAnswer: event.finalAnswer } : {}),
          updatedAt: event.occurredAt
        });
      } else if (event.type === "run.failed") {
        this.store.updateRun(runId, {
          status: "failed",
          error: event.error,
          updatedAt: event.occurredAt
        });
      } else if (event.type === "permission.requested") {
        this.store.updateRun(runId, {
          status: "waiting-for-permission",
          updatedAt: event.occurredAt
        });
      } else if (event.type === "permission.resolved") {
        this.store.updateRun(runId, {
          status: "running",
          updatedAt: event.occurredAt
        });
      }
    }
  }
}

function queuedRunInputSummary(input: QueuedRunInputResource): QueuedRunInputSummaryResource {
  return {
    id: input.id,
    mode: input.mode,
    textPreview: input.textPreview,
    createdAt: input.createdAt
  };
}

function previewText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
}

export function createHostRuntime(options: HostRuntimeOptions = {}): HostRuntime {
  return new HostRuntime(options);
}

function capabilityResourceFromDescriptor(descriptor: CapabilityDescriptor): CapabilityResource {
  return {
    type: descriptor.type,
    name: descriptor.name,
    source: descriptor.source,
    status: descriptor.status,
    ...(descriptor.namespace ? { namespace: descriptor.namespace } : {}),
    ...(descriptor.ownerPluginId ? { ownerPluginId: descriptor.ownerPluginId } : {}),
    ...(descriptor.reason ? { reason: descriptor.reason } : {}),
    ...(descriptor.trust ? { trust: descriptor.trust } : {})
  };
}

function auditSummaryFromRun(run: RunResource, events: HostEvent[]): AuditSummaryResource {
  const usage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cost: summarizeHostCost(events)
  };
  const failures: OperationalDiagnosticResource[] = [];
  let startedAt: string | undefined;
  let completedAt: string | undefined;
  const toolCalls = {
    started: 0,
    completed: 0,
    failed: 0
  };
  const permissions = {
    requested: 0,
    allowed: 0,
    denied: 0
  };

  for (const event of events) {
    switch (event.type) {
      case "run.started":
        startedAt ??= event.occurredAt;
        break;
      case "run.completed":
        completedAt = event.occurredAt;
        break;
      case "run.failed":
        completedAt = event.occurredAt;
        failures.push({
          severity: "error",
          code: event.error.code,
          message: event.error.message
        });
        break;
      case "tool.started":
        toolCalls.started += 1;
        break;
      case "tool.completed":
        toolCalls.completed += 1;
        break;
      case "tool.failed":
        toolCalls.failed += 1;
        failures.push({
          severity: "error",
          code: event.error.code,
          message: event.error.message
        });
        break;
      case "permission.requested":
        permissions.requested += 1;
        break;
      case "permission.resolved":
        if (event.decision === "allow") {
          permissions.allowed += 1;
        } else {
          permissions.denied += 1;
        }
        break;
      case "usage.recorded":
        usage.inputTokens += event.inputTokens ?? 0;
        usage.outputTokens += event.outputTokens ?? 0;
        usage.totalTokens += event.totalTokens ?? 0;
        break;
      default:
        break;
    }
  }

  const summary: AuditSummaryResource = {
    runId: run.id,
    toolCalls,
    permissions,
    usage,
    failures
  };
  if (startedAt !== undefined) {
    summary.startedAt = startedAt;
  }
  if (completedAt !== undefined) {
    summary.completedAt = completedAt;
  }
  return summary;
}

function metricsSnapshotFromEvents(events: HostEvent[], updatedAt: string): MetricsSnapshotResource {
  const counters: Record<string, number> = {
    "runs.started": 0,
    "runs.completed": 0,
    "runs.failed": 0,
    "tools.started": 0,
    "tools.completed": 0,
    "tools.failed": 0,
    "permissions.requested": 0,
    "permissions.allowed": 0,
    "permissions.denied": 0,
    "usage.input_tokens": 0,
    "usage.output_tokens": 0,
    "usage.total_tokens": 0
  };

  for (const event of events) {
    switch (event.type) {
      case "run.started":
        increment(counters, "runs.started");
        break;
      case "run.completed":
        increment(counters, "runs.completed");
        break;
      case "run.failed":
        increment(counters, "runs.failed");
        break;
      case "tool.started":
        increment(counters, "tools.started");
        break;
      case "tool.completed":
        increment(counters, "tools.completed");
        break;
      case "tool.failed":
        increment(counters, "tools.failed");
        break;
      case "permission.requested":
        increment(counters, "permissions.requested");
        break;
      case "permission.resolved":
        increment(counters, event.decision === "allow" ? "permissions.allowed" : "permissions.denied");
        break;
      case "usage.recorded":
        increment(counters, "usage.input_tokens", event.inputTokens ?? 0);
        increment(counters, "usage.output_tokens", event.outputTokens ?? 0);
        increment(counters, "usage.total_tokens", event.totalTokens ?? 0);
        break;
      default:
        break;
    }
  }

  return { updatedAt, counters };
}

function summarizeHostCost(events: HostEvent[]): UsageCostResource {
  const usageEvents = events.filter((event) => event.type === "usage.recorded");
  if (usageEvents.length === 0) {
    return {
      status: "unknown",
      reason: "event stream does not contain known usage costs"
    };
  }
  if (usageEvents.every((event) => event.costUsd !== undefined)) {
    return {
      status: "known",
      amount: usageEvents.reduce((sum, event) => sum + (event.costUsd ?? 0), 0),
      currency: "USD"
    };
  }
  return {
    status: "unknown",
    reason: "event stream contains usage records without known costs"
  };
}

function increment(counters: Record<string, number>, key: string, amount = 1): void {
  counters[key] = (counters[key] ?? 0) + amount;
}
