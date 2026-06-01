import {
  createAgentRuntime,
  computeDurableEventRecordHash,
  type AgentRuntime,
  type AgentRuntimeOptions,
  type CapabilityDescriptor,
  createDurableEventEnvelope,
  type JsonObject,
  type PermissionAllowDecision,
  type PermissionDenyDecision,
  type PermissionRequest,
  type Provider,
  type SessionBranch,
  type SessionLeaf,
  type SessionRecord,
  type SessionStore,
  type ToolDefinition,
  type RuntimeToolInvokeOptions,
  type ToolRuntimeResult
} from "@guga-agent/core";
import {
  HOST_PROTOCOL_FEATURES,
  HOST_PROTOCOL_VERSION,
  createHostEventSequencer,
  type AuditSummaryResource,
  type CapabilityResource,
  type CodeTaskPlanResource,
  type CodeTaskResource,
  type HostErrorPayload,
  type HostEventSequencer,
  type HostEvent,
  type HostEventInput,
  type HostProtocolInfoResource,
  type InteractionRequest,
  type InteractionResource,
  type MetricsSnapshotResource,
  type OperationalDiagnosticResource,
  type OperationalStatusResource,
  type PermissionRequestResource,
  type PermissionResolution,
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
  profileId?: string;
  cwd?: string;
  codeTasks?: HostCodeTaskRuntime;
};

export type StartRunOptions = {
  sessionId: string;
  input: string;
  providerId?: string;
  modelId?: string;
  maxTurns?: number;
};

export type HostCodeTaskClassification = {
  shouldCreateTask: boolean;
  reason: string;
  confidence?: "high" | "medium" | "low";
};

export type HostCodeTaskStageRunRequest = {
  taskId: string;
  role: "scout" | "planner" | "executor" | "verifier" | "repairer";
  prompt: string;
};

export type HostCodeTaskStageRunResult = {
  runId: string;
  finalAnswer?: string;
  plan?: CodeTaskPlanResource;
};

export type HostCodeTaskEventInput = {
  type: string;
  [key: string]: unknown;
};

export type HostCodeTaskStartOptions = {
  taskId: string;
  sessionId: string;
  rootRunId: string;
  cwd: string;
  objective: string;
  prompt: string;
  signal?: AbortSignal;
  emit(event: HostCodeTaskEventInput): HostEvent | undefined;
  runStage(request: HostCodeTaskStageRunRequest): Promise<HostCodeTaskStageRunResult>;
  invokeTool(options: RuntimeToolInvokeOptions): Promise<ToolRuntimeResult>;
};

export type HostCodeTaskRunResult = {
  finalAnswer: string;
};

export type HostCodeTaskRuntime = {
  classify(options: { prompt: string; profileId?: string; cwd: string }): HostCodeTaskClassification;
  start(options: HostCodeTaskStartOptions): Promise<HostCodeTaskRunResult>;
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

export type PermissionResponseResult =
  | {
      ok: true;
      permission: PermissionRequestResource;
    }
  | {
      ok: false;
      status: 400 | 404 | 409;
      error: HostErrorPayload;
    };

export class HostRuntime {
  private readonly runtime: AgentRuntime;
  private readonly sessionStore: SessionStore | undefined;
  private readonly ownsRuntime: boolean;
  private readonly now: () => Date;
  private readonly idFactory: () => string;
  private readonly profileId: string | undefined;
  private readonly cwd: string;
  private readonly codeTasks: HostCodeTaskRuntime | undefined;
  private readonly store = new InMemoryRunStore();
  private readonly activeRunControllers = new Map<string, AbortController>();
  private readonly activeRunCompletions = new Map<string, Promise<RunResource>>();
  private readonly activeRunSequencers = new Map<string, HostEventSequencer>();
  private readonly pendingDurableHostFacts = new Map<string, HostEvent[]>();
  private readonly pendingPermissionResolvers = new Map<
    string,
    (decision: PermissionAllowDecision | PermissionDenyDecision) => void
  >();
  private readonly resolvedPermissionDecisions = new Map<string, PermissionAllowDecision | PermissionDenyDecision>();

  constructor(options: HostRuntimeOptions = {}) {
    this.runtime = options.runtime ?? createAgentRuntime(this.runtimeOptionsWithPermissionBridge(options.runtimeOptions));
    this.sessionStore = this.runtime.getPersistenceCapabilities().sessionStore;
    this.ownsRuntime = !options.runtime;
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
    this.profileId = options.profileId;
    this.cwd = options.cwd ?? process.cwd();
    this.codeTasks = options.codeTasks;
  }

  getProtocolInfo(): HostProtocolInfoResource {
    return {
      version: HOST_PROTOCOL_VERSION,
      features: HOST_PROTOCOL_FEATURES
    };
  }

  registerProvider(provider: Provider): void {
    this.runtime.registerProvider(provider);
  }

  registerTool(tool: ToolDefinition): void {
    this.runtime.registerTool(tool);
  }

  private runtimeOptionsWithPermissionBridge(runtimeOptions: AgentRuntimeOptions | undefined): AgentRuntimeOptions {
    const configuredResolver = runtimeOptions?.permissions?.resolver;
    return {
      ...(runtimeOptions ?? {}),
      permissions: {
        ...(runtimeOptions?.permissions ?? {}),
        resolver: configuredResolver
          ? async (request) => {
              const decision = await configuredResolver(request);
              if (decision.action === "deny" && decision.metadata?.hostResolverRequired === true) {
                return this.resolveHostPermission(request);
              }
              return decision;
            }
          : (request) => this.resolveHostPermission(request)
      }
    };
  }

  private async resolveHostPermission(
    request: PermissionRequest
  ): Promise<PermissionAllowDecision | PermissionDenyDecision> {
    const permissionId = permissionRequestId(request);
    const existingDecision = this.resolvedPermissionDecisions.get(permissionId);
    if (existingDecision) {
      this.resolvedPermissionDecisions.delete(permissionId);
      return existingDecision;
    }
    return await new Promise<PermissionAllowDecision | PermissionDenyDecision>((resolve) => {
      this.pendingPermissionResolvers.set(permissionId, resolve);
    });
  }

  async createSession(options: { title?: string } = {}): Promise<SessionResource> {
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
    if (this.sessionStore) {
      const created = await this.sessionStore.createSession({
        sessionId,
        branchId: mainBranch.id,
        ...(options.title ? { title: options.title } : {})
      });
      if (created.ok) {
        const durableSession = sessionResourceFromDurable(created.session, [created.branch], {
          sessionId,
          branchId: mainBranch.id,
          eventId: null,
          updatedAt: created.session.updatedAt,
          reason: "session-created"
        });
        this.store.putSession(durableSession);
        for (const branch of durableSession.branches ?? []) {
          this.store.putBranch(branch);
        }
        return durableSession;
      }
    }
    this.store.putSession(session);
    this.store.putBranch(mainBranch);
    return session;
  }

  async getSession(sessionId: string): Promise<SessionResource | undefined> {
    const session = this.store.getSession(sessionId);
    if (session) {
      return session;
    }
    const tree = await this.sessionStore?.getSessionTree(sessionId);
    if (!tree?.ok) {
      return undefined;
    }
    const durable = sessionResourceFromDurable(tree.session, tree.branches, tree.activeLeaf);
    this.store.putSession(durable);
    for (const branch of durable.branches ?? []) {
      this.store.putBranch(branch);
    }
    return durable;
  }

  async listSessions(): Promise<SessionResource[]> {
    const listed = await this.sessionStore?.listSessions?.({ order: "updated_desc" });
    if (listed?.ok) {
      return listed.sessions.map((summary) => sessionResourceFromDurable(
        summary.session,
        undefined,
        summary.activeLeaf
      ));
    }
    return this.store.listSessions();
  }

  async resumeSession(sessionId: string, options: { branchId?: string } = {}): Promise<SessionResource | undefined> {
    const session = await this.getSession(sessionId);
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
    await this.sessionStore?.setActiveLeaf({
      sessionId,
      branchId: branch.id,
      eventId: null,
      reason: "resume-selected"
    });
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
    this.updateSessionRunProjection(session.id, session.activeBranchId ?? "main", run);

    const sequencer = createHostEventSequencer({ now: this.now });
    const controller = new AbortController();
    this.activeRunControllers.set(runId, controller);
    this.activeRunSequencers.set(runId, sequencer);
    const unsubscribe = this.runtime.onEvent((event) => {
      if (isTerminalRunStatus(this.store.getRun(runId)?.status ?? "running")) {
        return;
      }
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
    const codeTaskClassification = this.codeTasks?.classify({
      prompt: options.input,
      ...(this.profileId ? { profileId: this.profileId } : {}),
      cwd: this.cwd
    });
    if (this.codeTasks && codeTaskClassification?.shouldCreateTask === true) {
      return this.executeCodeTaskRun(options, state);
    }

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
    const followUp = wasCancelled ? undefined : this.consumeNextFollowUpInput(state.runId, state.sequencer);
    if (wasCancelled && this.store.listEvents(state.runId).some((event) => event.type === "run.cancelled")) {
      return this.store.getRun(state.runId) ?? {
        id: state.runId,
        sessionId: state.sessionId,
        status: "cancelled",
        input: options.input,
        createdAt: this.now().toISOString(),
        updatedAt: this.now().toISOString(),
        lastSeq: 0
      };
    }
    const terminalEvent = wasCancelled
      ? state.sequencer.next({
          type: "run.cancelled",
          sessionId: state.sessionId,
          runId: state.runId,
          reason: cancelError.message
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
    if (followUp) {
      this.startRunDetached({
        sessionId: state.sessionId,
        input: followUp.text,
        ...(options.providerId ? { providerId: options.providerId } : {}),
        ...(options.modelId ? { modelId: options.modelId } : {}),
        ...(options.maxTurns !== undefined ? { maxTurns: options.maxTurns } : {})
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

  private async executeCodeTaskRun(
    options: StartRunOptions,
    state: {
      sessionId: string;
      branchId: string;
      runId: string;
      controller: AbortController;
      sequencer: HostEventSequencer;
    }
  ): Promise<RunResource> {
    const taskId = `task-${this.idFactory()}`;
    this.emitHostEvent(state.runId, state.sequencer, {
      type: "run.started",
      sessionId: state.sessionId,
      runId: state.runId,
      input: options.input
    });

    const result = await this.codeTasks?.start({
      taskId,
      sessionId: state.sessionId,
      rootRunId: state.runId,
      cwd: this.cwd,
      objective: options.input,
      prompt: options.input,
      signal: state.controller.signal,
      emit: (event) => this.emitHostEvent(state.runId, state.sequencer, event as HostEventInput),
      runStage: (request) => this.runCodeTaskStage(options, state, request),
      invokeTool: (toolOptions) => this.runtime.invokeTool({
        ...toolOptions,
        signal: toolOptions.signal ?? state.controller.signal
      })
    }).catch((error: unknown) => ({
      error: {
        code: "CODE_TASK_EXECUTION_ERROR",
        message: error instanceof Error ? error.message : "Code task execution failed",
        details: error
      }
    }));

    const wasCancelled = state.controller.signal.aborted;
    if (wasCancelled && !this.store.listEvents(state.runId).some((event) => event.type === "task.cancelled")) {
      this.emitHostEvent(state.runId, state.sequencer, {
        type: "task.cancelled",
        sessionId: state.sessionId,
        taskId,
        actor: "user",
        reason: "Run was cancelled"
      });
    }
    if (wasCancelled && this.store.listEvents(state.runId).some((event) => event.type === "run.cancelled")) {
      return this.store.getRun(state.runId) ?? {
        id: state.runId,
        sessionId: state.sessionId,
        status: "cancelled",
        input: options.input,
        createdAt: this.now().toISOString(),
        updatedAt: this.now().toISOString(),
        lastSeq: 0
      };
    }

    const terminalEvent = wasCancelled
      ? state.sequencer.next({
          type: "run.cancelled",
          sessionId: state.sessionId,
          runId: state.runId,
          reason: "Run was cancelled"
        })
      : result && "error" in result
        ? state.sequencer.next({
            type: "run.failed",
            sessionId: state.sessionId,
            runId: state.runId,
            error: result.error
          })
        : state.sequencer.next({
            type: "run.completed",
            sessionId: state.sessionId,
            runId: state.runId,
            finalAnswer: result?.finalAnswer ?? "Code task finished"
          });
    this.store.appendEvents(state.runId, [terminalEvent]);
    this.applyEventEffects(state.runId, [terminalEvent]);
    await this.flushDurableHostFacts(state.runId);

    const followUp = wasCancelled ? undefined : this.consumeNextFollowUpInput(state.runId, state.sequencer);
    if (followUp) {
      this.startRunDetached({
        sessionId: state.sessionId,
        input: followUp.text,
        ...(options.providerId ? { providerId: options.providerId } : {}),
        ...(options.modelId ? { modelId: options.modelId } : {}),
        ...(options.maxTurns !== undefined ? { maxTurns: options.maxTurns } : {})
      });
    }

    return this.store.getRun(state.runId) ?? {
      id: state.runId,
      sessionId: state.sessionId,
      status: wasCancelled ? "cancelled" : result && "error" in result ? "failed" : "completed",
      input: options.input,
      createdAt: terminalEvent.occurredAt,
      updatedAt: terminalEvent.occurredAt,
      lastSeq: terminalEvent.seq
    };
  }

  private async runCodeTaskStage(
    options: StartRunOptions,
    state: {
      sessionId: string;
      branchId: string;
      runId: string;
      controller: AbortController;
      sequencer: HostEventSequencer;
    },
    request: HostCodeTaskStageRunRequest
  ): Promise<HostCodeTaskStageRunResult> {
    const stageRunId = `${state.runId}:${request.role}-${this.idFactory()}`;
    const unsubscribe = this.runtime.onEvent((event) => {
      if (isTerminalRunStatus(this.store.getRun(state.runId)?.status ?? "running")) {
        return;
      }
      const hostEvents = projectAgentEvent(event, {
        sessionId: state.sessionId,
        runId: state.runId,
        sourceRunId: stageRunId,
        sequencer: state.sequencer
      });
      this.store.appendEvents(state.runId, hostEvents);
      this.applyEventEffects(state.runId, hostEvents);
    });
    try {
      const result = await this.runtime.run({
        input: request.prompt,
        runId: stageRunId,
        session: { sessionId: state.sessionId, branchId: state.branchId },
        signal: state.controller.signal,
        ...(options.providerId ? { providerId: options.providerId } : {}),
        ...(options.modelId ? { modelId: options.modelId } : {}),
        ...(options.maxTurns !== undefined ? { maxTurns: options.maxTurns } : {})
      });
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return {
        runId: stageRunId,
        finalAnswer: result.finalAnswer
      };
    } finally {
      unsubscribe();
    }
  }

  cancelRun(runId: string): RunResource | undefined {
    const run = this.store.getRun(runId);
    if (!run) {
      return undefined;
    }
    if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
      return run;
    }
    this.cancelPendingRunState(run, "Run was cancelled");
    this.emitRunCancelled(runId, run.sessionId, "Run was cancelled");
    this.activeRunControllers.get(runId)?.abort("Run cancelled");
    return this.store.getRun(runId);
  }

  enqueueRunInput(runId: string, options: EnqueueRunInputOptions): RunResource | undefined {
    const run = this.store.getRun(runId);
    if (!run) {
      return undefined;
    }
    if (isTerminalRunStatus(run.status)) {
      return undefined;
    }
    const timestamp = this.now().toISOString();
    const queuedInput: QueuedRunInputResource = {
      id: `input-${this.idFactory()}`,
      mode: options.mode,
      status: options.mode === "steer" ? "deferred" : "pending",
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
      const event = sequencer.next({
        type: "interaction.requested",
        sessionId: options.sessionId,
        runId: options.runId,
        requestId: interaction.id,
        request: options.request
      });
      this.store.appendEvents(options.runId, [event]);
      this.applyEventEffects(options.runId, [event]);
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
      const event = sequencer.next({
        type: "interaction.resolved",
        sessionId: interaction.sessionId,
        runId: interaction.runId,
        requestId: interaction.id,
        response
      });
      this.store.appendEvents(interaction.runId, [event]);
      this.applyEventEffects(interaction.runId, [event]);
    }
    return this.store.getInteraction(interactionId);
  }

  getPermission(permissionId: string): PermissionRequestResource | undefined {
    return this.store.getPermission(permissionId);
  }

  respondPermission(permissionId: string, resolution: PermissionResolution): PermissionResponseResult {
    const validation = validatePermissionResolution(resolution);
    if (!validation.ok) {
      return validation;
    }

    const permission = this.store.getPermission(permissionId);
    if (!permission) {
      return {
        ok: false,
        status: 404,
        error: {
          code: "NOT_FOUND",
          message: "Permission request not found"
        }
      };
    }
    if (permission.status !== "pending") {
      return {
        ok: false,
        status: 409,
        error: {
          code: "PERMISSION_NOT_PENDING",
          message: "Permission request is not pending"
        }
      };
    }

    const timestamp = this.now().toISOString();
    const status = resolution.decision === "allow" ? "allowed" : "denied";
    this.store.updatePermission(permissionId, {
      status,
      ...(resolution.reason !== undefined ? { reason: resolution.reason } : {}),
      resolvedAt: timestamp
    });
    const resolver = this.pendingPermissionResolvers.get(permissionId);
    this.pendingPermissionResolvers.delete(permissionId);
    const decision = permissionDecisionFromResolution(resolution);
    if (resolver) {
      resolver(decision);
    } else {
      this.resolvedPermissionDecisions.set(permissionId, decision);
    }
    return {
      ok: true,
      permission: this.store.getPermission(permissionId) ?? {
        ...permission,
        status,
        ...(resolution.reason !== undefined ? { reason: resolution.reason } : {}),
        resolvedAt: timestamp
      }
    };
  }

  getRun(runId: string): RunResource | undefined {
    return this.store.getRun(runId);
  }

  listRunEvents(runId: string): HostEvent[] {
    return this.store.listEvents(runId);
  }

  recordHostEvent(runId: string, input: HostEventInput): HostEvent | undefined {
    const run = this.store.getRun(runId);
    if (!run) {
      return undefined;
    }
    const sequencer = this.activeRunSequencers.get(runId)
      ?? createHostEventSequencer({ startSeq: run.lastSeq, now: this.now });
    const event = sequencer.next(input);
    this.store.appendEvents(runId, [event]);
    this.applyEventEffects(runId, [event]);
    this.trackDurableHostFact(runId, event);
    return event;
  }

  private emitHostEvent(runId: string, sequencer: HostEventSequencer, input: HostEventInput): HostEvent | undefined {
    if (!this.store.getRun(runId)) {
      return undefined;
    }
    const event = sequencer.next(input);
    this.store.appendEvents(runId, [event]);
    this.applyEventEffects(runId, [event]);
    this.trackDurableHostFact(runId, event);
    return event;
  }

  getTask(taskId: string): CodeTaskResource | undefined {
    return this.store.getTask(taskId);
  }

  listSessionTasks(sessionId: string): CodeTaskResource[] {
    return this.store.listTasksBySession(sessionId);
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
        this.updateSessionRunProjection(event.sessionId, this.store.getSession(event.sessionId)?.activeBranchId ?? "main", {
          id: runId,
          status: "completed",
          updatedAt: event.occurredAt
        });
      } else if (event.type === "run.failed") {
        this.store.updateRun(runId, {
          status: "failed",
          error: event.error,
          updatedAt: event.occurredAt
        });
        this.updateSessionRunProjection(event.sessionId, this.store.getSession(event.sessionId)?.activeBranchId ?? "main", {
          id: runId,
          status: "failed",
          updatedAt: event.occurredAt
        });
      } else if (event.type === "run.cancelled") {
        this.store.updateRun(runId, {
          status: "cancelled",
          error: {
            code: "RUN_CANCELLED",
            message: event.reason ?? "Run was cancelled"
          },
          updatedAt: event.occurredAt
        });
        this.updateSessionRunProjection(event.sessionId, this.store.getSession(event.sessionId)?.activeBranchId ?? "main", {
          id: runId,
          status: "cancelled",
          updatedAt: event.occurredAt
        });
      } else if (event.type === "permission.requested") {
        this.store.putPermission({
          id: event.requestId,
          runId,
          sessionId: event.sessionId,
          callId: event.callId,
          toolName: event.toolName,
          status: "pending",
          ...(event.input !== undefined ? { input: event.input } : {}),
          ...(event.reason ? { reason: event.reason } : {}),
          createdAt: event.occurredAt
        });
        this.store.updateRun(runId, {
          status: "waiting-for-permission",
          updatedAt: event.occurredAt
        });
      } else if (event.type === "permission.resolved") {
        const permission = this.store.getPermission(event.requestId);
        if (permission?.status === "pending") {
          this.store.updatePermission(event.requestId, {
            status: event.decision === "allow" ? "allowed" : "denied",
            ...(event.reason !== undefined ? { reason: event.reason } : {}),
            resolvedAt: event.occurredAt
          });
        }
        if (!isTerminalRunStatus(this.store.getRun(runId)?.status ?? "running")) {
          this.store.updateRun(runId, {
            status: "running",
            updatedAt: event.occurredAt
          });
        }
      } else if (event.type === "permission.cancelled") {
        this.store.updatePermission(event.requestId, {
          status: "cancelled",
          ...(event.reason !== undefined ? { reason: event.reason } : {}),
          resolvedAt: event.occurredAt
        });
      } else if (event.type === "interaction.requested") {
        this.store.updateRun(runId, {
          status: "waiting-for-interaction",
          updatedAt: event.occurredAt
        });
      } else if (event.type === "interaction.resolved") {
        if (!isTerminalRunStatus(this.store.getRun(runId)?.status ?? "running")) {
          this.store.updateRun(runId, {
            status: "running",
            updatedAt: event.occurredAt
          });
        }
      } else if (event.type === "interaction.cancelled") {
        this.store.updateInteraction(event.requestId, {
          status: "cancelled",
          resolvedAt: event.occurredAt
        });
      } else if (event.type === "task.created") {
        this.store.putTask({
          id: event.taskId,
          sessionId: event.sessionId,
          rootRunId: event.rootRunId,
          cwd: event.cwd,
          objective: event.objective,
          state: event.state,
          phase: event.state,
          attempt: 0,
          maxRepairAttempts: 2,
          createdAt: event.occurredAt,
          updatedAt: event.occurredAt,
          ...(event.plan ? { plan: event.plan } : {}),
          ...(event.plan ? ledgerSummaryPatch(event.plan) : {}),
          verificationAttempts: [],
          durability: this.runtime.getPersistenceCapabilities().eventStore
            ? { status: "durable" }
            : { status: "memory_only", reason: "No EventStore is configured for HostRuntime task facts" }
        });
      } else if (event.type === "task.phase_changed") {
        this.store.updateTask(event.taskId, {
          state: event.to,
          phase: event.to,
          ...(event.activeRunId ? { activeRunId: event.activeRunId } : {}),
          ...(event.plan ? { plan: event.plan } : {}),
          ...(event.plan ? ledgerSummaryPatch(event.plan) : {}),
          attempt: event.attempt,
          updatedAt: event.occurredAt
        });
      } else if (event.type === "verification.started" || event.type === "verification.completed") {
        this.store.upsertVerificationAttempt(event.attempt);
      } else if (event.type === "task.completed") {
        this.store.updateTask(event.taskId, {
          state: "completed",
          phase: "completed",
          completionEvidence: event.evidence,
          updatedAt: event.occurredAt
        });
      } else if (event.type === "task.blocked") {
        this.store.updateTask(event.taskId, {
          state: "blocked",
          phase: "blocked",
          terminalReason: event.reason,
          updatedAt: event.occurredAt
        });
      } else if (event.type === "task.failed") {
        this.store.updateTask(event.taskId, {
          state: "failed",
          phase: "failed",
          terminalReason: event.reason,
          updatedAt: event.occurredAt
        });
      } else if (event.type === "task.cancelled") {
        this.store.updateTask(event.taskId, {
          state: "cancelled",
          phase: "cancelled",
          ...(event.reason ? { terminalReason: { code: "TASK_CANCELLED", message: event.reason } } : {}),
          updatedAt: event.occurredAt
        });
      }
    }
  }

  private trackDurableHostFact(runId: string, event: HostEvent): void {
    if (!isDurableTaskHostEvent(event)) {
      return;
    }
    const pending = this.pendingDurableHostFacts.get(runId) ?? [];
    pending.push(event);
    this.pendingDurableHostFacts.set(runId, pending);
  }

  private async flushDurableHostFacts(runId: string): Promise<void> {
    const pending = this.pendingDurableHostFacts.get(runId) ?? [];
    this.pendingDurableHostFacts.delete(runId);
    for (const event of pending) {
      await this.persistDurableHostFact(runId, event);
    }
  }

  private async persistDurableHostFact(runId: string, event: HostEvent): Promise<void> {
    const { eventStore, sessionStore } = this.runtime.getPersistenceCapabilities();
    const taskId = "taskId" in event ? event.taskId : undefined;
    if (!eventStore) {
      if (taskId) {
        this.store.updateTask(taskId, {
          durability: { status: "memory_only", reason: "No EventStore is configured for HostRuntime task facts" },
          updatedAt: event.occurredAt
        });
      }
      return;
    }

    const streamId = `session/${event.sessionId}`;
    const branchId = this.store.getSession(event.sessionId)?.activeBranchId ?? "main";
    const read = await eventStore.readStream(streamId);
    if (!read.ok && read.status !== "not_found") {
      if (taskId) {
        this.store.updateTask(taskId, {
          durability: {
            status: "unavailable",
            reason: read.diagnostics[0]?.message ?? `Unable to read durable event stream ${streamId}`
          },
          updatedAt: event.occurredAt
        });
      }
      return;
    }

    const existingEvents = read.ok ? read.events : [];
    const previous = existingEvents.at(-1);
    const payload = toJsonObject({ hostEvent: event });
    const idempotencyKey = `host-task-fact/${event.sessionId}/${runId}/${event.seq}/${event.type}`;
    const envelope = createDurableEventEnvelope({
      schemaVersion: 1,
      eventId: `host-event-${event.sessionId}-${runId}-${event.seq}`,
      eventType: `host.${event.type}`,
      streamId,
      streamRevision: previous ? previous.streamRevision + 1 : 0,
      sessionId: event.sessionId,
      branchId,
      runId,
      parentEventId: previous?.eventId ?? null,
      previousEventHash: previous
        ? { algorithm: "sha256", value: computeDurableEventRecordHash(previous) }
        : null,
      createdAt: event.occurredAt,
      actor: { type: "host", id: "host-runtime" },
      source: { type: "host", id: "host-runtime", packageName: "@guga-agent/host-runtime" },
      idempotency: { key: idempotencyKey, scope: "stream" },
      payload
    });
    const append = await eventStore.append(envelope, {
      expectedRevision: previous ? previous.streamRevision : "no-stream",
      idempotencyKey
    });

    if (append.ok) {
      if (taskId) {
        this.store.updateTask(taskId, {
          durability: { status: "durable", latestEventId: append.event.eventId },
          updatedAt: event.occurredAt
        });
      }
      await sessionStore?.setActiveLeaf({
        sessionId: event.sessionId,
        branchId,
        eventId: append.event.eventId,
        reason: "host-selected"
      });
      return;
    }

    if (taskId) {
      this.store.updateTask(taskId, {
        durability: {
          status: "unavailable",
          reason: append.status === "unavailable" ? append.reason : append.status
        },
        updatedAt: event.occurredAt
      });
    }
  }

  private updateSessionRunProjection(
    sessionId: string,
    branchId: string,
    run: { id: string; status: RunResource["status"]; updatedAt: string }
  ): void {
    this.store.updateSession(sessionId, {
      lastRunId: run.id,
      lastRunStatus: run.status,
      updatedAt: run.updatedAt
    });
    this.store.updateBranch(sessionId, branchId, {
      lastRunId: run.id,
      lastRunStatus: run.status,
      updatedAt: run.updatedAt
    });
  }

  private consumeNextFollowUpInput(runId: string, sequencer: HostEventSequencer): QueuedRunInputResource | undefined {
    const run = this.store.getRun(runId);
    const queuedInputs = run?.queuedInputs ?? [];
    const followUp = queuedInputs.find((input) => input.mode === "follow_up" && input.status === "pending");
    if (!run || !followUp) {
      return undefined;
    }
    const timestamp = this.now().toISOString();
    const remaining = queuedInputs
      .filter((input) => input.id !== followUp.id)
      .map((input) => input.mode === "steer" && input.status === "pending"
        ? { ...input, status: "deferred" as const }
        : input);
    this.store.updateRun(runId, {
      queuedInputs: remaining,
      updatedAt: timestamp
    });
    const event = sequencer.next({
      type: "queue.updated",
      sessionId: run.sessionId,
      runId,
      pending: remaining.map(queuedRunInputSummary)
    });
    this.store.appendEvents(runId, [event]);
    return {
      ...followUp,
      status: "consumed",
      resolvedAt: timestamp
    };
  }

  private cancelPendingRunState(run: RunResource, reason: string): void {
    const sequencer = this.activeRunSequencers.get(run.id)
      ?? createHostEventSequencer({ startSeq: run.lastSeq, now: this.now });
    const timestamp = this.now().toISOString();
    const events: HostEvent[] = [];

    if ((run.queuedInputs ?? []).length > 0) {
      this.store.updateRun(run.id, {
        queuedInputs: [],
        updatedAt: timestamp
      });
      events.push(sequencer.next({
        type: "queue.updated",
        sessionId: run.sessionId,
        runId: run.id,
        pending: []
      }));
    }

    for (const permission of this.store.listPermissionsByRun(run.id).filter((item) => item.status === "pending")) {
      this.store.updatePermission(permission.id, {
        status: "cancelled",
        reason,
        resolvedAt: timestamp
      });
      const resolver = this.pendingPermissionResolvers.get(permission.id);
      this.pendingPermissionResolvers.delete(permission.id);
      const decision: PermissionDenyDecision = {
        action: "deny",
        remember: "once",
        source: "host",
        reason,
        metadata: { cancelled: true }
      };
      if (resolver) {
        resolver(decision);
      } else {
        this.resolvedPermissionDecisions.set(permission.id, decision);
      }
      events.push(sequencer.next({
        type: "permission.cancelled",
        sessionId: run.sessionId,
        runId: run.id,
        requestId: permission.id,
        callId: permission.callId,
        toolName: permission.toolName,
        reason
      }));
    }

    for (const interaction of this.store.listInteractionsByRun(run.id).filter((item) => item.status === "pending")) {
      this.store.updateInteraction(interaction.id, {
        status: "cancelled",
        resolvedAt: timestamp
      });
      events.push(sequencer.next({
        type: "interaction.cancelled",
        sessionId: run.sessionId,
        runId: run.id,
        requestId: interaction.id,
        reason
      }));
    }

    this.store.appendEvents(run.id, events);
  }

  private emitRunCancelled(runId: string, sessionId: string, reason: string): void {
    const run = this.store.getRun(runId);
    if (!run || isTerminalRunStatus(run.status) || this.store.listEvents(runId).some((event) => event.type === "run.cancelled")) {
      return;
    }
    const sequencer = this.activeRunSequencers.get(runId)
      ?? createHostEventSequencer({ startSeq: run.lastSeq, now: this.now });
    const event = sequencer.next({
      type: "run.cancelled",
      sessionId,
      runId,
      reason
    });
    this.store.appendEvents(runId, [event]);
    this.applyEventEffects(runId, [event]);
  }
}

function queuedRunInputSummary(input: QueuedRunInputResource): QueuedRunInputSummaryResource {
  return {
    id: input.id,
    mode: input.mode,
    status: input.status,
    textPreview: input.textPreview,
    createdAt: input.createdAt,
    ...(input.resolvedAt ? { resolvedAt: input.resolvedAt } : {})
  };
}

function permissionRequestId(request: PermissionRequest): string {
  return `${request.runId}:${request.toolCallId}:${request.attempt}`;
}

function isDurableTaskHostEvent(event: HostEvent): boolean {
  return event.type === "task.created"
    || event.type === "task.phase_changed"
    || event.type === "task.completed"
    || event.type === "task.blocked"
    || event.type === "task.failed"
    || event.type === "task.cancelled"
    || event.type === "verification.started"
    || event.type === "verification.completed";
}

function toJsonObject(value: unknown): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function ledgerSummaryPatch(plan: CodeTaskPlanResource): Pick<CodeTaskResource, "ledgerSummary"> | Record<string, never> {
  const ledgerSummary = ledgerSummaryFromPlan(plan);
  return ledgerSummary ? { ledgerSummary } : {};
}

function ledgerSummaryFromPlan(plan: CodeTaskPlanResource): CodeTaskResource["ledgerSummary"] {
  const items = plan.ledgerItems ?? [];
  if (items.length === 0) {
    return undefined;
  }
  const current = items.find((item) =>
    item.status === "in-progress" || item.status === "evidence-submitted" || item.status === "pending"
  );
  const blocked = items.find((item) => item.status === "blocked");
  return {
    total: items.length,
    pending: items.filter((item) => item.status === "pending").length,
    inProgress: items.filter((item) => item.status === "in-progress").length,
    evidenceSubmitted: items.filter((item) => item.status === "evidence-submitted").length,
    verified: items.filter((item) => item.status === "verified").length,
    done: items.filter((item) => item.status === "done").length,
    blocked: items.filter((item) => item.status === "blocked").length,
    ...(current ? { currentItemId: current.id } : {}),
    ...(blocked ? { blockedItemId: blocked.id } : {})
  };
}

function sessionResourceFromDurable(
  session: SessionRecord,
  branches: SessionBranch[] | undefined,
  activeLeaf: SessionLeaf | undefined
): SessionResource {
  return {
    id: session.id,
    ...(session.title ? { title: session.title } : {}),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    activeBranchId: session.activeBranchId,
    rootBranchId: session.rootBranchId,
    ...(activeLeaf ? { activeLeafEventId: activeLeaf.eventId } : {}),
    ...(session.metadata ? { metadata: session.metadata } : {}),
    ...(branches ? { branches: branches.map(sessionBranchResourceFromDurable) } : {})
  };
}

function sessionBranchResourceFromDurable(branch: SessionBranch): SessionBranchResource {
  return {
    id: branch.id,
    sessionId: branch.sessionId,
    ...(branch.parentBranchId ? { parentBranchId: branch.parentBranchId } : {}),
    createdAt: branch.createdAt,
    updatedAt: branch.createdAt,
    ...(branch.metadata ? { metadata: branch.metadata } : {})
  };
}

function validatePermissionResolution(
  resolution: PermissionResolution
): PermissionResponseResult & { ok: false } | { ok: true } {
  if (
    !resolution
    || typeof resolution !== "object"
    || (resolution.decision !== "allow" && resolution.decision !== "deny")
  ) {
    return {
      ok: false,
      status: 400,
      error: {
        code: "BAD_REQUEST",
        message: "Permission resolution requires decision allow|deny"
      }
    };
  }
  if (
    resolution.remember !== undefined
    && resolution.remember !== "once"
    && resolution.remember !== "session"
    && resolution.remember !== "always"
  ) {
    return {
      ok: false,
      status: 400,
      error: {
        code: "BAD_REQUEST",
        message: "Permission resolution remember must be once|session|always"
      }
    };
  }
  return { ok: true };
}

function permissionDecisionFromResolution(
  resolution: PermissionResolution
): PermissionAllowDecision | PermissionDenyDecision {
  const remember = resolution.remember === "always" ? "session" : resolution.remember ?? "once";
  if (resolution.decision === "allow") {
    return {
      action: "allow",
      remember,
      source: "host",
      ...(resolution.reason ? { reason: resolution.reason } : {})
    };
  }
  return {
    action: "deny",
    remember,
    source: "host",
    reason: resolution.reason ?? "Permission denied by host",
    ...(resolution.updatedInput !== undefined ? { metadata: { updatedInput: resolution.updatedInput } } : {})
  };
}

function isTerminalRunStatus(status: RunResource["status"]): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
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
      case "run.cancelled":
        completedAt = event.occurredAt;
        failures.push({
          severity: "warning",
          code: "RUN_CANCELLED",
          message: event.reason ?? "Run was cancelled"
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
    "runs.cancelled": 0,
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
      case "run.cancelled":
        increment(counters, "runs.cancelled");
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
