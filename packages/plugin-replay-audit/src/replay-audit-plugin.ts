import type {
  ArtifactStore,
  DurableEventEnvelope,
  EventStore,
  EventStreamReadResult,
  LocalPlugin,
  ReplayAuditResult,
  ReplayCapability,
  ReplayConversationResult,
  ReplayFailureResult,
  ReplayModelInputResult,
  ReplayRequest,
  SessionBranch,
  SessionLeaf,
  SessionRecord,
  SessionStore,
  StoreCorruptionDiagnostic
} from "@guga-agent/core";
import { buildAuditView, type BranchReplayView } from "./audit-view";
import { buildConversationView } from "./conversation-view";
import { buildModelInputView } from "./model-input-view";

export type ReplayAuditStores = {
  eventStore: EventStore;
  sessionStore?: SessionStore;
  artifactStore?: ArtifactStore;
};

export type ReplayAuditPluginOptions = Partial<ReplayAuditStores> & {
  pluginId?: string;
};

type ReplayEventPath =
  | {
      ok: true;
      events: DurableEventEnvelope[];
      diagnostics: StoreCorruptionDiagnostic[];
      branch?: BranchReplayView;
    }
  | ReplayFailureResult;

export function createReplayAuditPlugin(options: ReplayAuditPluginOptions = {}): LocalPlugin {
  const pluginId = options.pluginId ?? "guga-replay-audit";
  return {
    id: pluginId,
    name: "Guga Replay Audit Projection",
    init(context) {
      const stores: Partial<ReplayAuditStores> = {};
      const eventStore = options.eventStore ?? context.getEventStore?.();
      const sessionStore = options.sessionStore ?? context.getSessionStore?.();
      const artifactStore = options.artifactStore ?? context.getArtifactStore?.();
      if (eventStore) {
        stores.eventStore = eventStore;
      }
      if (sessionStore) {
        stores.sessionStore = sessionStore;
      }
      if (artifactStore) {
        stores.artifactStore = artifactStore;
      }
      const capability = new ReplayAuditProjectionCapability(stores);
      if (!context.registerReplayCapability) {
        throw new Error("Plugin context does not support replay capability registration");
      }
      context.registerReplayCapability(capability);
    }
  };
}

export class ReplayAuditProjectionCapability implements ReplayCapability {
  private readonly eventStore: EventStore | undefined;
  private readonly sessionStore: SessionStore | undefined;
  private readonly artifactStore: ArtifactStore | undefined;

  constructor(stores: Partial<ReplayAuditStores>) {
    this.eventStore = stores.eventStore;
    this.sessionStore = stores.sessionStore;
    this.artifactStore = stores.artifactStore;
  }

  async replayConversation(request: ReplayRequest): Promise<ReplayConversationResult | ReplayFailureResult> {
    const path = await this.loadReplayPath(request);
    if (!path.ok) {
      return path;
    }
    const view = buildConversationView(path.events);
    return {
      ...view,
      diagnostics: [...pathDiagnostics(path), ...view.diagnostics]
    };
  }

  async replayModelInput(request: ReplayRequest): Promise<ReplayModelInputResult | ReplayFailureResult> {
    const path = await this.loadReplayPath(request);
    if (!path.ok) {
      return path;
    }
    const view = buildModelInputView(path.events, request);
    return {
      ...view,
      diagnostics: [...pathDiagnostics(path), ...view.diagnostics]
    };
  }

  async replayAudit(request: ReplayRequest): Promise<ReplayAuditResult | ReplayFailureResult> {
    const path = await this.loadReplayPath(request);
    if (!path.ok) {
      return path;
    }
    const auditOptions: Parameters<typeof buildAuditView>[0] = {
      events: path.events,
      readDiagnostics: path.diagnostics
    };
    if (path.branch) {
      auditOptions.branch = path.branch;
    }
    if (this.artifactStore) {
      auditOptions.artifactStore = this.artifactStore;
    }
    return buildAuditView(auditOptions);
  }

  private async loadReplayPath(request: ReplayRequest): Promise<ReplayEventPath> {
    if (!this.eventStore) {
      return unavailable("EVENT_STORE_UNAVAILABLE", "No event store is configured for replay");
    }

    const branchId = request.branchId ?? await this.resolveBranchId(request.sessionId);
    const read = await readReplayStream(this.eventStore, request.sessionId, branchId, request);
    if (!read.ok) {
      return failureFromRead(read);
    }

    const branch = this.sessionStore
      ? await resolveBranchView(this.sessionStore, read.events, request, branchId)
      : undefined;
    const visibleEvents = branch
      ? read.events.filter((event) => branch.visibleEventIds.includes(event.eventId))
      : truncateAtEvent(read.events, request.throughEventId);

    return {
      ok: true,
      events: visibleEvents,
      diagnostics: read.diagnostics ?? [],
      ...(branch ? { branch } : {})
    };
  }

  private async resolveBranchId(sessionId: string): Promise<string> {
    if (!this.sessionStore) {
      return "main";
    }
    const tree = await this.sessionStore.getSessionTree(sessionId);
    return tree.ok ? tree.activeLeaf.branchId : "main";
  }
}

async function readReplayStream(
  eventStore: EventStore,
  sessionId: string,
  branchId: string,
  request: ReplayRequest
): Promise<EventStreamReadResult> {
  const primary = await eventStore.readStream(`session/${sessionId}/${branchId}`, {
    ...(request.targetSchemaVersion ? { targetSchemaVersion: request.targetSchemaVersion } : {})
  });
  if (primary.ok && primary.events.length > 0) {
    return primary;
  }
  if (!primary.ok && primary.status !== "not_found") {
    return primary;
  }
  const fallback = await eventStore.readStream(`session/${sessionId}`, {
    ...(request.targetSchemaVersion ? { targetSchemaVersion: request.targetSchemaVersion } : {})
  });
  return fallback.ok || fallback.status !== "not_found" ? fallback : primary;
}

async function resolveBranchView(
  sessionStore: SessionStore,
  events: readonly DurableEventEnvelope[],
  request: ReplayRequest,
  fallbackBranchId: string
): Promise<BranchReplayView | undefined> {
  const tree = await sessionStore.getSessionTree(request.sessionId);
  if (!tree.ok) {
    return undefined;
  }
  const currentBranch = tree.branches.find((branch) => branch.id === (request.branchId ?? tree.activeLeaf.branchId))
    ?? tree.branches.find((branch) => branch.id === fallbackBranchId);
  if (!currentBranch) {
    return undefined;
  }
  const path = visiblePath(tree.branches, currentBranch);
  const activeLeaf = selectActiveLeaf(tree.session, tree.activeLeaf, currentBranch, request.throughEventId);
  const visibleEventIds = truncateIds(unique(path.flatMap((branch) => branch.visibleEventIds)), activeLeaf.eventId);
  const existingIds = new Set(events.map((event) => event.eventId));
  return {
    session: tree.session,
    activeLeaf,
    currentBranch,
    visibleEventIds: visibleEventIds.filter((eventId) => existingIds.has(eventId)),
    forkSource: currentBranch.createdFrom
  };
}

function failureFromRead(read: Extract<EventStreamReadResult, { ok: false }>): ReplayFailureResult {
  return {
    ok: false,
    status: read.status,
    diagnostics: read.diagnostics.map((diagnostic) => ({
      severity: diagnostic.recoverable ? "warning" : "error",
      code: `STORE_${diagnostic.kind.toUpperCase()}`,
      message: diagnostic.message,
      ...(diagnostic.eventId ? { eventId: diagnostic.eventId } : {}),
      metadata: {
        recoverable: diagnostic.recoverable,
        ...(diagnostic.metadata ? diagnostic.metadata : {})
      }
    }))
  };
}

function unavailable(code: string, message: string): ReplayFailureResult {
  return {
    ok: false,
    status: "unavailable",
    diagnostics: [{ severity: "warning", code, message }]
  };
}

function pathDiagnostics(path: Extract<ReplayEventPath, { ok: true }>) {
  return path.diagnostics.map((diagnostic) => ({
    severity: diagnostic.recoverable ? "warning" as const : "error" as const,
    code: `STORE_${diagnostic.kind.toUpperCase()}`,
    message: diagnostic.message,
    ...(diagnostic.eventId ? { eventId: diagnostic.eventId } : {}),
    metadata: {
      recoverable: diagnostic.recoverable,
      ...(diagnostic.metadata ? diagnostic.metadata : {})
    }
  }));
}

function visiblePath(branches: readonly SessionBranch[], leaf: SessionBranch): SessionBranch[] {
  const byId = new Map(branches.map((branch) => [branch.id, branch]));
  const path: SessionBranch[] = [];
  const seen = new Set<string>();
  let current: SessionBranch | undefined = leaf;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.push(current);
    current = current.parentBranchId ? byId.get(current.parentBranchId) : undefined;
  }
  return path.reverse();
}

function selectActiveLeaf(
  session: SessionRecord,
  activeLeaf: SessionLeaf,
  branch: SessionBranch,
  throughEventId: string | undefined
): SessionLeaf {
  if (throughEventId) {
    return {
      sessionId: session.id,
      branchId: branch.id,
      eventId: throughEventId,
      updatedAt: session.updatedAt,
      reason: "resume-selected"
    };
  }
  if (activeLeaf.branchId === branch.id) {
    return activeLeaf;
  }
  return {
    sessionId: session.id,
    branchId: branch.id,
    eventId: branch.visibleEventIds.at(-1) ?? null,
    updatedAt: session.updatedAt,
    reason: "resume-selected"
  };
}

function truncateAtEvent(events: readonly DurableEventEnvelope[], throughEventId: string | undefined): DurableEventEnvelope[] {
  if (!throughEventId) {
    return [...events];
  }
  const index = events.findIndex((event) => event.eventId === throughEventId);
  return index === -1 ? [...events] : events.slice(0, index + 1);
}

function truncateIds(eventIds: readonly string[], throughEventId: string | null): string[] {
  if (!throughEventId) {
    return [...eventIds];
  }
  const index = eventIds.indexOf(throughEventId);
  return index === -1 ? [...eventIds] : eventIds.slice(0, index + 1);
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}
