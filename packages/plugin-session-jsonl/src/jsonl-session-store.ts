import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  CreateSessionOptions,
  CreateSessionResult,
  ForkBranchOptions,
  ForkBranchResult,
  JsonObject,
  ListSessionsOptions,
  ListSessionsResult,
  SessionBranch,
  SessionConflictDiagnostic,
  SessionLeaf,
  SessionRecord,
  SessionSummary,
  SessionStore,
  SessionTreeResult,
  SetActiveLeafOptions,
  SetActiveLeafResult,
  StoreCorruptionDiagnostic
} from "@guga-agent/core";
import { appendJsonlRecord, readJsonlRecords, safePathSegment } from "./jsonl-corruption";

export type JsonlSessionStoreOptions = {
  rootDir: string;
  now?: () => string;
};

type SessionFact =
  | {
      kind: "session.created";
      session: SessionRecord;
      branch: SessionBranch;
      leaf: SessionLeaf;
    }
  | {
      kind: "branch.forked";
      branch: SessionBranch;
      leaf: SessionLeaf;
    }
  | {
      kind: "leaf.moved";
      leaf: SessionLeaf;
    };

type SessionState = {
  session: SessionRecord;
  branches: Map<string, SessionBranch>;
  activeLeaf: SessionLeaf;
};

export class JsonlSessionStore implements SessionStore {
  private readonly rootDir: string;
  private readonly now: () => string;

  constructor(options: JsonlSessionStoreOptions) {
    this.rootDir = options.rootDir;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async createSession(options: CreateSessionOptions): Promise<CreateSessionResult> {
    const sessionId = options.sessionId ?? crypto.randomUUID();
    const branchId = options.branchId ?? "main";
    const existing = await this.loadState(sessionId);
    if (existing.ok && existing.state) {
      return {
        ok: false,
        diagnostic: {
          status: "branch_id_conflict",
          message: `Session already exists: ${sessionId}`,
          sessionId,
          branchId
        }
      };
    }
    if (!existing.ok) {
      return { ok: false, diagnostic: corruptionDiagnostic(sessionId, undefined, existing.diagnostics[0]) };
    }

    const timestamp = this.now();
    const session: SessionRecord = {
      id: sessionId,
      createdAt: timestamp,
      updatedAt: timestamp,
      activeBranchId: branchId,
      rootBranchId: branchId,
      ...(options.title ? { title: options.title } : {}),
      ...(options.metadata ? { metadata: options.metadata } : {})
    };
    const branch: SessionBranch = {
      id: branchId,
      sessionId,
      createdAt: timestamp,
      createdFrom: { type: "root" },
      visibleEventIds: []
    };
    const leaf: SessionLeaf = {
      sessionId,
      branchId,
      eventId: null,
      updatedAt: timestamp,
      reason: "session-created"
    };
    await this.appendFact(sessionId, { kind: "session.created", session, branch, leaf });
    return { ok: true, session, branch };
  }

  async getSessionTree(sessionId: string): Promise<SessionTreeResult> {
    const loaded = await this.loadState(sessionId);
    if (!loaded.ok) {
      return { ok: false, diagnostic: corruptionDiagnostic(sessionId, undefined, loaded.diagnostics[0]) };
    }
    if (!loaded.state) {
      return {
        ok: false,
        diagnostic: {
          status: "session_not_found",
          message: `Session not found: ${sessionId}`,
          sessionId
        }
      };
    }
    return {
      ok: true,
      session: loaded.state.session,
      branches: [...loaded.state.branches.values()],
      activeLeaf: loaded.state.activeLeaf,
      ...(loaded.diagnostics.length > 0 ? {
        diagnostics: loaded.diagnostics.map((diagnostic) => corruptionDiagnostic(sessionId, undefined, diagnostic))
      } : {})
    };
  }

  async listSessions(options: ListSessionsOptions = {}): Promise<ListSessionsResult> {
    let names: string[];
    try {
      names = await readdir(join(this.rootDir, "sessions"));
    } catch (error) {
      if (isNotFound(error)) {
        return { ok: true, sessions: [] };
      }
      return {
        ok: false,
        diagnostic: {
          status: "unavailable",
          message: error instanceof Error ? error.message : "Unable to list session facts"
        }
      };
    }

    const sessions: SessionSummary[] = [];
    const diagnostics: SessionConflictDiagnostic[] = [];
    for (const name of names.filter((candidate) => candidate.endsWith(".jsonl"))) {
      const fallbackId = name.slice(0, -".jsonl".length);
      const loaded = await this.loadState(fallbackId);
      if (!loaded.ok) {
        diagnostics.push(corruptionDiagnostic(fallbackId, undefined, loaded.diagnostics[0]));
        continue;
      }
      if (!loaded.state) {
        continue;
      }
      sessions.push(summaryFromState(loaded.state, loaded.diagnostics));
    }

    const sorted = sessions.sort((left, right) => {
      const field = options.order === "created_desc" ? "createdAt" : "updatedAt";
      return right.session[field].localeCompare(left.session[field]);
    });
    const start = options.cursor ? Math.max(0, Number.parseInt(options.cursor, 10) || 0) : 0;
    const end = options.limit === undefined ? sorted.length : start + options.limit;
    return {
      ok: true,
      sessions: sorted.slice(start, end),
      ...(end < sorted.length ? { nextCursor: String(end) } : {}),
      ...(diagnostics.length > 0 ? { diagnostics } : {})
    };
  }

  async forkBranch(options: ForkBranchOptions): Promise<ForkBranchResult> {
    const loaded = await this.loadState(options.sessionId);
    if (!loaded.ok) {
      return { ok: false, diagnostic: corruptionDiagnostic(options.sessionId, options.branchId, loaded.diagnostics[0]) };
    }
    if (!loaded.state) {
      return { ok: false, diagnostic: sessionNotFound(options.sessionId, options.branchId) };
    }
    const state = loaded.state;
    if (state.branches.has(options.branchId)) {
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
    if (options.branchId === options.fromBranchId) {
      return {
        ok: false,
        diagnostic: {
          status: "cycle_detected",
          message: "Fork branch id cannot equal its source branch id",
          sessionId: options.sessionId,
          branchId: options.branchId,
          eventId: options.fromEventId
        }
      };
    }
    const source = state.branches.get(options.fromBranchId);
    if (!source) {
      return {
        ok: false,
        diagnostic: {
          status: "source_event_not_found",
          message: `Source branch not found: ${options.fromBranchId}`,
          sessionId: options.sessionId,
          branchId: options.fromBranchId,
          eventId: options.fromEventId
        }
      };
    }
    const visibleIndex = source.visibleEventIds.indexOf(options.fromEventId);
    if (visibleIndex === -1) {
      return {
        ok: false,
        diagnostic: {
          status: "source_event_not_visible",
          message: `Source event is not visible on branch ${options.fromBranchId}: ${options.fromEventId}`,
          sessionId: options.sessionId,
          branchId: options.fromBranchId,
          eventId: options.fromEventId
        }
      };
    }

    const timestamp = this.now();
    const branch: SessionBranch = {
      id: options.branchId,
      sessionId: options.sessionId,
      parentBranchId: options.fromBranchId,
      createdAt: timestamp,
      createdFrom: {
        type: "event",
        branchId: options.fromBranchId,
        eventId: options.fromEventId,
        visibility: "visible"
      },
      visibleEventIds: source.visibleEventIds.slice(0, visibleIndex + 1),
      ...(options.metadata ? { metadata: options.metadata } : {})
    };
    const leaf: SessionLeaf = {
      sessionId: options.sessionId,
      branchId: options.branchId,
      eventId: options.fromEventId,
      updatedAt: timestamp,
      reason: "fork-created"
    };
    await this.appendFact(options.sessionId, { kind: "branch.forked", branch, leaf });
    return { ok: true, branch };
  }

  async setActiveLeaf(options: SetActiveLeafOptions): Promise<SetActiveLeafResult> {
    const loaded = await this.loadState(options.sessionId);
    if (!loaded.ok) {
      return { ok: false, diagnostic: corruptionDiagnostic(options.sessionId, options.branchId, loaded.diagnostics[0]) };
    }
    if (!loaded.state) {
      return { ok: false, diagnostic: sessionNotFound(options.sessionId, options.branchId) };
    }
    const branch = loaded.state.branches.get(options.branchId);
    if (!branch) {
      return {
        ok: false,
        diagnostic: {
          status: "active_leaf_not_found",
          message: `Active leaf branch not found: ${options.branchId}`,
          sessionId: options.sessionId,
          branchId: options.branchId,
          ...(options.eventId ? { eventId: options.eventId } : {})
        }
      };
    }
    const leaf: SessionLeaf = {
      sessionId: options.sessionId,
      branchId: options.branchId,
      eventId: options.eventId,
      updatedAt: this.now(),
      reason: options.reason
    };
    await this.appendFact(options.sessionId, { kind: "leaf.moved", leaf });
    return { ok: true, leaf };
  }

  async appendRawFactForTest(sessionId: string, line: string): Promise<void> {
    const { appendFile, mkdir } = await import("node:fs/promises");
    await mkdir(join(this.rootDir, "sessions"), { recursive: true });
    await appendFile(this.pathForSession(sessionId), line, "utf8");
  }

  private async appendFact(sessionId: string, fact: SessionFact): Promise<void> {
    await appendJsonlRecord(this.pathForSession(sessionId), fact);
  }

  private async loadState(sessionId: string): Promise<{
    ok: true;
    state: SessionState | undefined;
    diagnostics: StoreCorruptionDiagnostic[];
  } | {
    ok: false;
    diagnostics: StoreCorruptionDiagnostic[];
  }> {
    const parsed = await readJsonlRecords<SessionFact>(this.pathForSession(sessionId), {
      describeRecord(record) {
        return isSessionFact(record) ? record : undefined;
      }
    });
    if (!parsed.ok) {
      return { ok: false, diagnostics: parsed.diagnostics };
    }
    if (parsed.records.length === 0) {
      return { ok: true, state: undefined, diagnostics: parsed.diagnostics };
    }

    let state: SessionState | undefined;
    for (const fact of parsed.records) {
      if (fact.kind === "session.created") {
        if (state) {
          return {
            ok: false,
            diagnostics: [{
              kind: "schema_invalid",
              message: `Duplicate session.created fact for ${sessionId}`,
              recoverable: false
            }]
          };
        }
        state = {
          session: fact.session,
          branches: new Map([[fact.branch.id, fact.branch]]),
          activeLeaf: fact.leaf
        };
        continue;
      }
      if (!state) {
        return {
          ok: false,
          diagnostics: [{
            kind: "schema_invalid",
            message: `Session fact appeared before session.created for ${sessionId}`,
            recoverable: false
          }]
        };
      }
      if (fact.kind === "branch.forked") {
        state.branches.set(fact.branch.id, fact.branch);
        state.activeLeaf = fact.leaf;
        state.session = updateSessionLeaf(state.session, fact.leaf);
      } else {
        const branch = state.branches.get(fact.leaf.branchId);
        if (branch && fact.leaf.eventId !== null && !branch.visibleEventIds.includes(fact.leaf.eventId)) {
          state.branches.set(branch.id, { ...branch, visibleEventIds: [...branch.visibleEventIds, fact.leaf.eventId] });
        }
        state.activeLeaf = fact.leaf;
        state.session = updateSessionLeaf(state.session, fact.leaf);
      }
    }

    return { ok: true, state, diagnostics: parsed.diagnostics };
  }

  private pathForSession(sessionId: string): string {
    return join(this.rootDir, "sessions", `${safePathSegment(sessionId)}.jsonl`);
  }
}

function updateSessionLeaf(session: SessionRecord, leaf: SessionLeaf): SessionRecord {
  return {
    ...session,
    activeBranchId: leaf.branchId,
    updatedAt: leaf.updatedAt
  };
}

function summaryFromState(state: SessionState, diagnostics: StoreCorruptionDiagnostic[]): SessionSummary {
  return {
    session: state.session,
    activeLeaf: state.activeLeaf,
    branchCount: state.branches.size,
    ...(diagnostics.length > 0 ? {
      diagnostics: diagnostics.map((diagnostic) => corruptionDiagnostic(state.session.id, undefined, diagnostic))
    } : {})
  };
}

function isSessionFact(record: unknown): record is SessionFact {
  if (!record || typeof record !== "object") {
    return false;
  }
  const kind = (record as { kind?: unknown }).kind;
  return kind === "session.created" || kind === "branch.forked" || kind === "leaf.moved";
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

function sessionNotFound(sessionId: string, branchId: string): SessionConflictDiagnostic {
  return {
    status: "session_not_found",
    message: `Session not found: ${sessionId}`,
    sessionId,
    branchId
  };
}

function corruptionDiagnostic(
  sessionId: string,
  branchId: string | undefined,
  corruption: StoreCorruptionDiagnostic | undefined
): SessionConflictDiagnostic {
  return {
    status: "unavailable",
    message: corruption?.message ?? "Session store unavailable",
    sessionId,
    ...(branchId ? { branchId } : {}),
    metadata: {
      corruption: corruption as unknown as JsonObject
    }
  };
}
