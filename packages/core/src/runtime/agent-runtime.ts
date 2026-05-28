import { CoreError } from "../contracts/errors";
import type { AgentEvent } from "../contracts/events";
import { AgentEventType } from "../contracts/events";
import type {
  DurableEventActor,
  DurableEventSource,
  ForkBranchOptions,
  ForkBranchResult,
  ReplayAuditResult,
  ReplayConversationResult,
  ReplayFailureResult,
  ReplayModelInputResult,
  ReplayRequest
} from "../contracts/persistence";
import type { ModelMetadata, Provider } from "../contracts/provider";
import type { CapabilityDescriptor } from "../contracts/plugins";
import type {
  AgentSessionIdentity,
  AgentPersistenceCapabilities,
  AgentResumeSessionOptions,
  AgentRunFailure,
  AgentRunOptions,
  AgentRunResult,
  AgentRuntime as AgentRuntimeContract,
  AgentRuntimeOptions,
  AgentRuntimeShutdownResult
} from "../contracts/runtime";
import type { ResumeReportResult } from "../persistence/resume-report";
import type { ToolDefinition } from "../contracts/tools";
import { EventBus } from "../events/event-bus";
import { HookKernel } from "../hooks/hook-kernel";
import { PermissionKernel } from "../permissions/permission-kernel";
import { AgentLoop } from "../loop/agent-loop";
import { PluginHost } from "../plugin-host/plugin-host";
import { CapabilityRegistry } from "../registry/capability-registry";
import { ProviderRouter } from "../router/provider-router";
import { resumeSessionFromStores } from "../persistence/session-replay";
import { forkSessionBranch } from "../persistence/session-tree";
import { ResultPolicy } from "../tools/result-policy";
import type { ToolAvailabilityContext } from "../contracts/tool-runtime";
import { createDefaultCoreCapabilities, registerBuiltInCoreCapabilities } from "../builtins/default-core-capabilities";

export class AgentRuntime implements AgentRuntimeContract {
  private readonly registry = new CapabilityRegistry();
  private readonly eventBus: EventBus;
  private readonly hookKernel: HookKernel;
  private readonly permissionKernel: PermissionKernel;
  private readonly resultPolicy: ResultPolicy;
  private readonly pluginHost: PluginHost;
  private readonly router: ProviderRouter | undefined;
  private readonly availabilityContext: ToolAvailabilityContext;
  private readonly configuredPersistence: AgentPersistenceCapabilities;
  private readonly configuredSession: AgentSessionIdentity;
  private activeSession: Required<Pick<AgentSessionIdentity, "sessionId" | "branchId">>;
  private disposed = false;

  constructor(options: AgentRuntimeOptions = {}) {
    const plugins = options.model ? [options.model, ...(options.plugins ?? [])] : (options.plugins ?? []);
    const routerPolicy = options.routerPolicy ?? (options.model ? { primary: options.model.model } : undefined);
    this.availabilityContext = options.permissions?.profile ? { profile: options.permissions.profile } : {};
    this.configuredSession = options.session ?? {};
    this.activeSession = {
      sessionId: this.configuredSession.sessionId ?? "default",
      branchId: this.configuredSession.branchId ?? "main"
    };
    this.configuredPersistence = {
      eventStore: options.stores?.events,
      sessionStore: options.stores?.sessions,
      artifactStore: options.stores?.artifacts,
      replay: options.replay
    };

    this.eventBus = new EventBus({
      durableContext: () => ({
        eventStore: this.getPersistenceCapabilities().eventStore,
        session: this.activeSession,
        actor: runtimeActor(),
        source: runtimeSource()
      })
    });
    this.hookKernel = new HookKernel({ eventBus: this.eventBus });
    this.permissionKernel = new PermissionKernel({ ...options.permissions, eventBus: this.eventBus });
    this.resultPolicy = new ResultPolicy({ eventBus: this.eventBus });
    if (options.builtIns !== false) {
      registerBuiltInCoreCapabilities(
        this.registry,
        options.builtIns?.capabilities ?? createDefaultCoreCapabilities()
      );
    }
    this.pluginHost = new PluginHost({
      plugins,
      registry: this.registry,
      hookKernel: this.hookKernel,
      eventBus: this.eventBus,
      persistence: this.configuredPersistence
    });
    this.router = routerPolicy
      ? new ProviderRouter({ registry: this.registry, policy: routerPolicy })
      : undefined;
  }

  registerProvider(provider: Provider): void {
    this.assertNotDisposed();
    this.registry.registerProvider(provider);
  }

  registerModel(model: ModelMetadata): void {
    this.assertNotDisposed();
    this.registry.registerModel(model);
  }

  listModels(): ModelMetadata[] {
    return this.registry.listModels();
  }

  listCapabilityDescriptors(): CapabilityDescriptor[] {
    return this.registry.listCapabilityDescriptors();
  }

  registerTool(tool: ToolDefinition): void {
    this.assertNotDisposed();
    this.registry.registerTool(tool);
  }

  onEvent(listener: (event: AgentEvent) => void): () => void {
    return this.eventBus.subscribe(listener);
  }

  getPersistenceCapabilities(): AgentPersistenceCapabilities {
    return {
      eventStore: this.configuredPersistence.eventStore ?? this.registry.getEventStore(),
      sessionStore: this.configuredPersistence.sessionStore ?? this.registry.getSessionStore(),
      artifactStore: this.configuredPersistence.artifactStore ?? this.registry.getArtifactStore(),
      replay: this.configuredPersistence.replay ?? this.registry.getReplayCapability()
    };
  }

  async resumeSession(options: AgentResumeSessionOptions): Promise<ResumeReportResult> {
    const { eventStore, sessionStore } = this.getPersistenceCapabilities();
    if (!sessionStore || !eventStore) {
      return {
        ok: false,
        status: "unavailable",
        diagnostics: [{
          severity: "warning",
          code: !sessionStore ? "SESSION_STORE_UNAVAILABLE" : "EVENT_STORE_UNAVAILABLE",
          message: !sessionStore
            ? "No session store is configured for this runtime"
            : "No event store is configured for this runtime"
        }]
      };
    }
    return resumeSessionFromStores({ eventStore, sessionStore }, options);
  }

  async forkSession(options: ForkBranchOptions): Promise<ForkBranchResult> {
    const { eventStore, sessionStore } = this.getPersistenceCapabilities();
    if (!sessionStore || !eventStore) {
      return {
        ok: false,
        diagnostic: {
          status: "unavailable",
          message: !sessionStore
            ? "No session store is configured for this runtime"
            : "No event store is configured for this runtime",
          sessionId: options.sessionId,
          branchId: options.branchId,
          eventId: options.fromEventId
        }
      };
    }
    const stream = await eventStore.readStream(`session/${options.sessionId}`);
    if (!stream.ok) {
      return {
        ok: false,
        diagnostic: {
          status: stream.status === "not_found" ? "source_event_not_found" : "unavailable",
          message: stream.diagnostics[0]?.message ?? `Unable to read event stream for session ${options.sessionId}`,
          sessionId: options.sessionId,
          branchId: options.fromBranchId,
          eventId: options.fromEventId
        }
      };
    }
    const fork = await forkSessionBranch(sessionStore, stream.events, options);
    if (!fork.ok) {
      return fork;
    }

    const forkRunId = `session-fork-${crypto.randomUUID()}`;
    this.activeSession = { sessionId: options.sessionId, branchId: options.branchId };
    this.eventBus.publish({
      type: AgentEventType.SessionForked,
      runId: forkRunId,
      sessionId: options.sessionId,
      branchId: options.branchId,
      fromBranchId: options.fromBranchId,
      fromEventId: options.fromEventId
    });
    this.eventBus.publish({
      type: AgentEventType.SessionLeafMoved,
      runId: forkRunId,
      sessionId: options.sessionId,
      branchId: options.branchId,
      eventId: options.fromEventId,
      reason: "fork-created"
    });

    return fork;
  }

  async replayConversation(request: ReplayRequest): Promise<ReplayConversationResult | ReplayFailureResult> {
    const replay = this.getPersistenceCapabilities().replay;
    if (!replay) {
      return replayUnavailable("REPLAY_UNAVAILABLE", "No replay capability is configured for this runtime");
    }
    return replay.replayConversation(request);
  }

  async replayModelInput(request: ReplayRequest): Promise<ReplayModelInputResult | ReplayFailureResult> {
    const replay = this.getPersistenceCapabilities().replay;
    if (!replay) {
      return replayUnavailable("REPLAY_UNAVAILABLE", "No replay capability is configured for this runtime");
    }
    return replay.replayModelInput(request);
  }

  async replayAudit(request: ReplayRequest): Promise<ReplayAuditResult | ReplayFailureResult> {
    const replay = this.getPersistenceCapabilities().replay;
    if (!replay) {
      return replayUnavailable("REPLAY_UNAVAILABLE", "No replay capability is configured for this runtime");
    }
    return replay.replayAudit(request);
  }

  async run(options: AgentRunOptions): Promise<AgentRunResult> {
    const runId = options.runId ?? crypto.randomUUID();
    const eventStartIndex = this.eventBus.events.length;
    const runSession = this.resolveRunSession(options.session);
    this.activeSession = runSession;

    if (this.disposed) {
      return this.failRuntime(
        runId,
        eventStartIndex,
        new CoreError("RUNTIME_DISPOSED", "Runtime has been disposed"),
        "runtime_disposed"
      );
    }

    const initializeResult = await this.pluginHost.initialize({ runId });
    if (!initializeResult.ok) {
      return this.failRuntime(runId, eventStartIndex, initializeResult.error, "plugin_init_failed");
    }

    const startHooks = await this.hookKernel.runRuntimeStart({ runId });
    if (startHooks.failures.length > 0) {
      const [failure] = startHooks.failures;
      return this.failRuntime(
        runId,
        eventStartIndex,
        new CoreError("HOOK_FAILED", failure?.error.message ?? "Runtime start hook failed", failure),
        "hook_failed"
      );
    }

    const persistenceReady = await this.ensureDurableSession(runSession);
    if (!persistenceReady.ok) {
      return this.failRuntime(
        runId,
        eventStartIndex,
        new CoreError("PERSISTENCE_CAPABILITY_NOT_FOUND", persistenceReady.message, persistenceReady.diagnostic),
        "persistence_unavailable"
      );
    }

    const result = await new AgentLoop({
      registry: this.registry,
      eventBus: this.eventBus,
      eventStartIndex,
      hookKernel: this.hookKernel,
      permissionKernel: this.permissionKernel,
      resultPolicy: this.resultPolicy,
      availabilityContext: this.availabilityContext,
      ...(this.router ? { router: this.router } : {})
    }).run({ ...options, runId });

    const synced = await this.syncActiveLeaf(runSession);
    if (!synced.ok && result.ok) {
      return this.failRuntime(
        runId,
        eventStartIndex,
        new CoreError("PERSISTENCE_CAPABILITY_NOT_FOUND", synced.message, synced.diagnostic),
        "persistence_interrupted"
      );
    }
    return result;
  }

  async dispose(): Promise<AgentRuntimeShutdownResult> {
    if (this.disposed) {
      return {
        ok: true,
        runId: "runtime-dispose",
        failures: [],
        events: []
      };
    }

    const runId = `runtime-shutdown-${crypto.randomUUID()}`;
    const eventStartIndex = this.eventBus.events.length;
    const shutdownResult = await this.pluginHost.shutdown({ runId });
    const events = this.eventBus.events.slice(eventStartIndex);
    this.eventBus.dispose();
    this.disposed = true;

    return {
      ok: shutdownResult.ok,
      runId,
      failures: shutdownResult.failures.map((failure) => failure.error),
      events
    };
  }

  private failRuntime(runId: string, eventStartIndex: number, error: CoreError, reason: string): AgentRunFailure {
    this.eventBus.publish({
      type: AgentEventType.Error,
      runId,
      code: error.code,
      message: error.message,
      details: error.details
    });
    this.eventBus.publish({ type: AgentEventType.RunFinished, runId, status: "failed", reason });

    return {
      ok: false,
      runId,
      error: { code: error.code, message: error.message, details: error.details },
      events: this.eventBus.events.slice(eventStartIndex)
    };
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new CoreError("RUNTIME_DISPOSED", "Runtime has been disposed");
    }
  }

  private resolveRunSession(session: AgentSessionIdentity | undefined): Required<Pick<AgentSessionIdentity, "sessionId" | "branchId">> {
    const sessionId = session?.sessionId ?? this.activeSession.sessionId;
    const branchId = session?.branchId
      ?? (session?.sessionId && session.sessionId !== this.activeSession.sessionId ? "main" : this.activeSession.branchId);
    return { sessionId, branchId };
  }

  private async ensureDurableSession(session: Required<Pick<AgentSessionIdentity, "sessionId" | "branchId">>): Promise<{
    ok: true;
  } | {
    ok: false;
    message: string;
    diagnostic: unknown;
  }> {
    const { sessionStore } = this.getPersistenceCapabilities();
    if (!sessionStore) {
      return { ok: true };
    }

    const existing = await sessionStore.getSessionTree(session.sessionId);
    if (existing.ok) {
      const branch = existing.branches.find((candidate) => candidate.id === session.branchId);
      return branch
        ? { ok: true }
        : {
            ok: false,
            message: `Session branch not found: ${session.branchId}`,
            diagnostic: { sessionId: session.sessionId, branchId: session.branchId }
          };
    }
    if (existing.diagnostic.status !== "session_not_found") {
      return {
        ok: false,
        message: existing.diagnostic.message,
        diagnostic: existing.diagnostic
      };
    }

    const created = await sessionStore.createSession({
      sessionId: session.sessionId,
      branchId: session.branchId
    });
    return created.ok
      ? { ok: true }
      : {
          ok: false,
          message: created.diagnostic.message,
          diagnostic: created.diagnostic
        };
  }

  private async syncActiveLeaf(session: Required<Pick<AgentSessionIdentity, "sessionId" | "branchId">>): Promise<{
    ok: true;
  } | {
    ok: false;
    message: string;
    diagnostic: unknown;
  }> {
    const { eventStore, sessionStore } = this.getPersistenceCapabilities();
    if (!eventStore || !sessionStore) {
      return { ok: true };
    }
    const stream = await eventStore.readStream(`session/${session.sessionId}`, { direction: "backwards" });
    if (!stream.ok) {
      return {
        ok: false,
        message: stream.diagnostics[0]?.message ?? `Unable to read event stream for session ${session.sessionId}`,
        diagnostic: stream
      };
    }
    const branchEvents = stream.events
      .filter((event) => event.branchId === session.branchId)
      .sort((left, right) => left.streamRevision - right.streamRevision);
    if (branchEvents.length === 0) {
      return { ok: true };
    }
    for (const [index, event] of branchEvents.entries()) {
      const leaf = await sessionStore.setActiveLeaf({
        sessionId: session.sessionId,
        branchId: session.branchId,
        eventId: event.eventId,
        reason: index === branchEvents.length - 1 ? "host-selected" : "resume-selected"
      });
      if (!leaf.ok) {
        return {
          ok: false,
          message: leaf.diagnostic.message,
          diagnostic: leaf.diagnostic
        };
      }
    }
    return { ok: true };
  }
}

function replayUnavailable(code: string, message: string): ReplayFailureResult {
  return {
    ok: false,
    status: "unavailable",
    diagnostics: [{ severity: "warning", code, message }]
  };
}

function runtimeActor(): DurableEventActor {
  return { type: "runtime", id: "guga-core" };
}

function runtimeSource(): DurableEventSource {
  return { type: "runtime", id: "guga-core" };
}
