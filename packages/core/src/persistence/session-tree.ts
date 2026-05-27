import { AgentEventType, type AgentEvent } from "../contracts/events";
import type {
  DurableEventEnvelope,
  ForkBranchOptions,
  ForkBranchResult,
  JsonObject,
  ReplayDiagnostic,
  SessionBranch,
  SessionConflictDiagnostic,
  SessionLeaf,
  SessionRecord,
  SessionStore
} from "../contracts/persistence";

export type SessionTreeProjection = {
  session: SessionRecord;
  branches: SessionBranch[];
  activeLeaf: SessionLeaf;
  visibleEvents: DurableEventEnvelope[];
  diagnostics: ReplayDiagnostic[];
};

export type BuildSessionTreeOptions = {
  sessionId: string;
  branchId?: string;
  throughEventId?: string;
  now?: string;
};

export type BuildSessionTreeResult =
  | {
      ok: true;
      projection: SessionTreeProjection;
    }
  | {
      ok: false;
      status: "not_found" | "repair_required";
      diagnostics: ReplayDiagnostic[];
    };

export async function buildSessionTree(
  sessionStore: SessionStore,
  events: readonly DurableEventEnvelope[],
  options: BuildSessionTreeOptions
): Promise<BuildSessionTreeResult> {
  const tree = await sessionStore.getSessionTree(options.sessionId);
  if (!tree.ok) {
    return {
      ok: false,
      status: tree.diagnostic.status === "session_not_found" ? "not_found" : "repair_required",
      diagnostics: [sessionConflictDiagnostic(tree.diagnostic)]
    };
  }

  const diagnostics = (tree.diagnostics ?? []).map(sessionConflictDiagnostic);
  const branchId = options.branchId ?? tree.activeLeaf.branchId;
  const branch = tree.branches.find((candidate) => candidate.id === branchId);
  if (!branch) {
    return {
      ok: false,
      status: "not_found",
      diagnostics: [{
        severity: "error",
        code: "BRANCH_NOT_FOUND",
        message: `Branch not found: ${branchId}`,
        metadata: { sessionId: options.sessionId, branchId }
      }]
    };
  }

  const activeLeafOptions: Parameters<typeof selectActiveLeaf>[0] = {
    session: tree.session,
    treeLeaf: tree.activeLeaf,
    branch,
    requestedBranchId: branchId
  };
  if (options.throughEventId !== undefined) {
    activeLeafOptions.requestedThroughEventId = options.throughEventId;
  }
  if (options.now !== undefined) {
    activeLeafOptions.now = options.now;
  }
  const activeLeaf = selectActiveLeaf(activeLeafOptions);
  const path = resolveVisiblePath(tree.branches, branch);
  if (path.status === "cycle") {
    return {
      ok: false,
      status: "repair_required",
      diagnostics: [{
        severity: "error",
        code: "SESSION_BRANCH_CYCLE",
        message: `Session branch lineage contains a cycle at ${path.branchId}`,
        metadata: { sessionId: options.sessionId, branchId: path.branchId }
      }]
    };
  }

  const eventById = new Map(events.map((event) => [event.eventId, event]));
  const orderedIds = truncateAtEvent(unique(path.branches.flatMap((item) => item.visibleEventIds)), activeLeaf.eventId);
  const missingIds = orderedIds.filter((eventId) => !eventById.has(eventId));
  if (missingIds.length > 0) {
    diagnostics.push({
      severity: "error",
      code: "VISIBLE_EVENT_MISSING",
      message: `Branch ${branchId} references events that are not present in the event stream`,
      metadata: { sessionId: options.sessionId, branchId, missingEventIds: missingIds }
    });
  }

  if (activeLeaf.eventId && !orderedIds.includes(activeLeaf.eventId)) {
    diagnostics.push({
      severity: "error",
      code: "ACTIVE_LEAF_NOT_VISIBLE",
      message: `Active leaf ${activeLeaf.eventId} is not visible on branch ${branchId}`,
      eventId: activeLeaf.eventId,
      metadata: { sessionId: options.sessionId, branchId }
    });
  }

  const visibleEvents = orderedIds
    .map((eventId) => eventById.get(eventId))
    .filter((event): event is DurableEventEnvelope => Boolean(event));

  return {
    ok: true,
    projection: {
      session: tree.session,
      branches: tree.branches,
      activeLeaf,
      visibleEvents,
      diagnostics
    }
  };
}

export async function forkSessionBranch(
  sessionStore: SessionStore,
  events: readonly DurableEventEnvelope[],
  options: ForkBranchOptions
): Promise<ForkBranchResult> {
  const tree = await sessionStore.getSessionTree(options.sessionId);
  if (!tree.ok) {
    return { ok: false, diagnostic: tree.diagnostic };
  }

  if (tree.branches.some((branch) => branch.id === options.branchId)) {
    return {
      ok: false,
      diagnostic: {
        status: "branch_id_conflict",
        message: `Branch already exists: ${options.branchId}`,
        sessionId: options.sessionId,
        branchId: options.branchId
      }
    };
  }

  const sourceBranch = tree.branches.find((branch) => branch.id === options.fromBranchId);
  if (!sourceBranch) {
    return {
      ok: false,
      diagnostic: {
        status: "source_event_not_visible",
        message: `Source branch not found: ${options.fromBranchId}`,
        sessionId: options.sessionId,
        branchId: options.fromBranchId,
        eventId: options.fromEventId
      }
    };
  }

  const path = resolveVisiblePath(tree.branches, sourceBranch);
  if (path.status === "cycle") {
    return {
      ok: false,
      diagnostic: {
        status: "cycle_detected",
        message: `Session branch lineage contains a cycle at ${path.branchId}`,
        sessionId: options.sessionId,
        branchId: path.branchId,
        eventId: options.fromEventId
      }
    };
  }

  const visibleIds = unique(path.branches.flatMap((branch) => branch.visibleEventIds));
  if (!visibleIds.includes(options.fromEventId)) {
    return {
      ok: false,
      diagnostic: {
        status: "source_event_not_visible",
        message: `Source event ${options.fromEventId} is not visible on branch ${options.fromBranchId}`,
        sessionId: options.sessionId,
        branchId: options.fromBranchId,
        eventId: options.fromEventId
      }
    };
  }

  if (!events.some((event) => event.eventId === options.fromEventId)) {
    return {
      ok: false,
      diagnostic: {
        status: "source_event_not_found",
        message: `Source event not found: ${options.fromEventId}`,
        sessionId: options.sessionId,
        branchId: options.fromBranchId,
        eventId: options.fromEventId
      }
    };
  }

  const fork = await sessionStore.forkBranch(options);
  if (!fork.ok) {
    return fork;
  }

  const leaf = await sessionStore.setActiveLeaf({
    sessionId: options.sessionId,
    branchId: options.branchId,
    eventId: options.fromEventId,
    reason: "fork-created"
  });
  if (!leaf.ok) {
    return { ok: false, diagnostic: leaf.diagnostic };
  }

  return fork;
}

export function sessionFactBranches(
  events: readonly DurableEventEnvelope[],
  sessionId: string
): { branches: SessionBranch[]; activeLeaf?: SessionLeaf } {
  const branches = new Map<string, SessionBranch>();
  let activeLeaf: SessionLeaf | undefined;

  for (const event of events) {
    if (event.sessionId !== sessionId) {
      continue;
    }
    const payload = event.payload as AgentEvent;
    if (payload.type === AgentEventType.SessionForked) {
      branches.set(payload.branchId, {
        id: payload.branchId,
        sessionId: payload.sessionId,
        parentBranchId: payload.fromBranchId,
        createdAt: event.createdAt,
        createdFrom: { type: "event", branchId: payload.fromBranchId, eventId: payload.fromEventId },
        visibleEventIds: truncateAtEvent(
          events.filter((candidate) => candidate.branchId === payload.fromBranchId).map((candidate) => candidate.eventId),
          payload.fromEventId
        )
      });
    }
    if (payload.type === AgentEventType.SessionLeafMoved) {
      activeLeaf = {
        sessionId: payload.sessionId,
        branchId: payload.branchId,
        eventId: payload.eventId,
        updatedAt: event.createdAt,
        reason: payload.reason
      };
    }
  }

  return { branches: [...branches.values()], ...(activeLeaf ? { activeLeaf } : {}) };
}

function selectActiveLeaf(options: {
  session: SessionRecord;
  treeLeaf: SessionLeaf;
  branch: SessionBranch;
  requestedBranchId: string;
  requestedThroughEventId?: string;
  now?: string;
}): SessionLeaf {
  if (options.requestedThroughEventId) {
    return {
      sessionId: options.session.id,
      branchId: options.requestedBranchId,
      eventId: options.requestedThroughEventId,
      updatedAt: options.now ?? options.session.updatedAt,
      reason: "resume-selected"
    };
  }
  if (options.treeLeaf.branchId === options.requestedBranchId) {
    return options.treeLeaf;
  }
  return {
    sessionId: options.session.id,
    branchId: options.requestedBranchId,
    eventId: options.branch.visibleEventIds.at(-1) ?? null,
    updatedAt: options.now ?? options.session.updatedAt,
    reason: "resume-selected"
  };
}

function resolveVisiblePath(branches: readonly SessionBranch[], leaf: SessionBranch): { status: "ok"; branches: SessionBranch[] } | { status: "cycle"; branchId: string } {
  const byId = new Map(branches.map((branch) => [branch.id, branch]));
  const path: SessionBranch[] = [];
  const seen = new Set<string>();
  let current: SessionBranch | undefined = leaf;

  while (current) {
    if (seen.has(current.id)) {
      return { status: "cycle", branchId: current.id };
    }
    seen.add(current.id);
    path.push(current);
    current = current.parentBranchId ? byId.get(current.parentBranchId) : undefined;
  }

  return { status: "ok", branches: path.reverse() };
}

function truncateAtEvent(eventIds: readonly string[], throughEventId: string | null | undefined): string[] {
  const ids = unique(eventIds);
  if (!throughEventId) {
    return ids;
  }
  const index = ids.indexOf(throughEventId);
  return index === -1 ? ids : ids.slice(0, index + 1);
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

function sessionConflictDiagnostic(diagnostic: SessionConflictDiagnostic): ReplayDiagnostic {
  const metadata: JsonObject = {};
  if (diagnostic.sessionId) {
    metadata.sessionId = diagnostic.sessionId;
  }
  if (diagnostic.branchId) {
    metadata.branchId = diagnostic.branchId;
  }
  if (diagnostic.metadata) {
    Object.assign(metadata, diagnostic.metadata);
  }

  return {
    severity: "error",
    code: diagnostic.status.toUpperCase(),
    message: diagnostic.message,
    ...(diagnostic.eventId ? { eventId: diagnostic.eventId } : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {})
  };
}
