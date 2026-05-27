import { describe, expect, it } from "vitest";
import { AgentEventType } from "../contracts/events";
import type { AgentEvent } from "../contracts/events";
import type {
  CreateSessionOptions,
  CreateSessionResult,
  DurableEventEnvelope,
  ForkBranchOptions,
  ForkBranchResult,
  SessionBranch,
  SessionLeaf,
  SessionRecord,
  SessionStore,
  SessionTreeResult,
  SetActiveLeafOptions,
  SetActiveLeafResult
} from "../contracts/persistence";
import { createDurableEventEnvelope } from "./durable-event-envelope";
import { buildSessionTree, forkSessionBranch, sessionFactBranches } from "./session-tree";

describe("session tree reducers", () => {
  it("rebuilds the visible branch path and active leaf from SessionStore tree facts", async () => {
    const events = [
      durableEvent({ type: AgentEventType.RunStarted, runId: "run-1", input: "root" }, { eventId: "event-root-1" }),
      durableEvent({ type: AgentEventType.RunFinished, runId: "run-1", status: "completed" }, { eventId: "event-root-2" }),
      durableEvent({ type: AgentEventType.RunStarted, runId: "run-2", input: "branch" }, { eventId: "event-branch-1", branchId: "branch-a" })
    ];
    const sessionStore = new FakeSessionStore({
      branches: [
        {
          id: "main",
          sessionId: "session-1",
          createdAt: "2026-05-27T00:00:00.000Z",
          createdFrom: { type: "root" },
          visibleEventIds: ["event-root-1", "event-root-2"]
        },
        {
          id: "branch-a",
          sessionId: "session-1",
          parentBranchId: "main",
          createdAt: "2026-05-27T00:00:00.000Z",
          createdFrom: { type: "event", branchId: "main", eventId: "event-root-1" },
          visibleEventIds: ["event-branch-1"]
        }
      ],
      activeLeaf: {
        sessionId: "session-1",
        branchId: "branch-a",
        eventId: "event-branch-1",
        updatedAt: "2026-05-27T00:00:00.000Z",
        reason: "resume-selected"
      }
    });

    const result = await buildSessionTree(sessionStore, events, { sessionId: "session-1" });

    expect(result).toMatchObject({ ok: true });
    expect(result.ok ? result.projection.visibleEvents.map((event) => event.eventId) : []).toEqual([
      "event-root-1",
      "event-root-2",
      "event-branch-1"
    ]);
    expect(result.ok ? result.projection.activeLeaf : undefined).toMatchObject({ branchId: "branch-a", eventId: "event-branch-1" });
  });

  it("forks from a historical event by appending branch lineage and moving the active leaf", async () => {
    const events = [
      durableEvent({ type: AgentEventType.RunStarted, runId: "run-1", input: "root" }, { eventId: "event-1" }),
      durableEvent({ type: AgentEventType.ContextCompactCompleted, runId: "run-1", turn: 0, projectionId: "projection-1", result: compactResult() }, { eventId: "event-2" }),
      durableEvent({ type: AgentEventType.RunFinished, runId: "run-1", status: "completed" }, { eventId: "event-3" })
    ];
    const sessionStore = new FakeSessionStore({
      branches: [{
        id: "main",
        sessionId: "session-1",
        createdAt: "2026-05-27T00:00:00.000Z",
        createdFrom: { type: "root" },
        visibleEventIds: ["event-1", "event-2", "event-3"]
      }],
      activeLeaf: {
        sessionId: "session-1",
        branchId: "main",
        eventId: "event-3",
        updatedAt: "2026-05-27T00:00:00.000Z",
        reason: "resume-selected"
      }
    });

    const result = await forkSessionBranch(sessionStore, events, {
      sessionId: "session-1",
      branchId: "branch-before-compact",
      fromBranchId: "main",
      fromEventId: "event-1"
    });

    expect(result).toMatchObject({
      ok: true,
      branch: {
        id: "branch-before-compact",
        parentBranchId: "main",
        visibleEventIds: ["event-1"]
      }
    });
    expect(sessionStore.branches.find((branch) => branch.id === "main")?.visibleEventIds).toEqual(["event-1", "event-2", "event-3"]);
    expect(sessionStore.activeLeaf).toMatchObject({ branchId: "branch-before-compact", eventId: "event-1", reason: "fork-created" });
  });

  it("rejects non-visible fork sources without mutating history", async () => {
    const sessionStore = new FakeSessionStore({
      branches: [{
        id: "main",
        sessionId: "session-1",
        createdAt: "2026-05-27T00:00:00.000Z",
        createdFrom: { type: "root" },
        visibleEventIds: ["event-1"]
      }]
    });

    const result = await forkSessionBranch(sessionStore, [], {
      sessionId: "session-1",
      branchId: "branch-bad",
      fromBranchId: "main",
      fromEventId: "missing"
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostic: { status: "source_event_not_visible" }
    });
    expect(sessionStore.branches.map((branch) => branch.id)).toEqual(["main"]);
  });

  it("can derive branch facts from durable session fork and leaf movement events", () => {
    const facts = sessionFactBranches([
      durableEvent({
        type: AgentEventType.SessionForked,
        runId: "run-1",
        sessionId: "session-1",
        branchId: "branch-a",
        fromBranchId: "main",
        fromEventId: "event-1"
      }, { eventId: "event-fork", branchId: "branch-a" }),
      durableEvent({
        type: AgentEventType.SessionLeafMoved,
        runId: "run-1",
        sessionId: "session-1",
        branchId: "branch-a",
        eventId: "event-1",
        reason: "fork-created"
      }, { eventId: "event-leaf", branchId: "branch-a" })
    ], "session-1");

    expect(facts.branches).toEqual([
      expect.objectContaining({ id: "branch-a", parentBranchId: "main" })
    ]);
    expect(facts.activeLeaf).toMatchObject({ branchId: "branch-a", eventId: "event-1" });
  });
});

function compactResult() {
  return {
    id: "compaction-1",
    trigger: "manual" as const,
    summary: {
      objective: "test",
      completedWork: [],
      currentBlockers: [],
      nextSteps: [],
      keyFilesAndSymbols: [],
      toolResultReferences: [],
      unresolvedQuestions: [],
      userConstraints: []
    },
    boundary: { id: "boundary-1", retainedSourceIds: ["event-1"], compactedSourceIds: ["event-0"] },
    preTokenEstimate: 10,
    postTokenEstimate: 5,
    iterationNo: 1,
    preprocessingApplied: { dedup: false, smartCollapse: false, parameterTruncation: false },
    strippedRoundIds: [],
    degradedTo: "local-skeleton" as const
  };
}

function durableEvent(payload: AgentEvent | Record<string, unknown>, options: {
  eventId: string;
  branchId?: string;
}): DurableEventEnvelope {
  const runId = typeof payload.runId === "string" ? payload.runId : undefined;
  const turn = typeof payload.turn === "number" ? payload.turn : undefined;
  return createDurableEventEnvelope({
    schemaVersion: 1,
    eventId: options.eventId,
    streamId: "session/session-1",
    streamRevision: 0,
    sessionId: "session-1",
    branchId: options.branchId ?? "main",
    ...(runId ? { runId } : {}),
    ...(turn !== undefined ? { turn } : {}),
    parentEventId: null,
    previousEventHash: null,
    createdAt: "2026-05-27T00:00:00.000Z",
    actor: { type: "runtime", id: "test" },
    source: { type: "runtime", id: "core-test" },
    payload
  });
}

class FakeSessionStore implements SessionStore {
  session: SessionRecord;
  branches: SessionBranch[];
  activeLeaf: SessionLeaf;

  constructor(options: {
    branches?: SessionBranch[];
    activeLeaf?: SessionLeaf;
  } = {}) {
    this.session = {
      id: "session-1",
      createdAt: "2026-05-27T00:00:00.000Z",
      updatedAt: "2026-05-27T00:00:00.000Z",
      activeBranchId: options.activeLeaf?.branchId ?? "main",
      rootBranchId: "main"
    };
    this.branches = options.branches ?? [{
      id: "main",
      sessionId: "session-1",
      createdAt: "2026-05-27T00:00:00.000Z",
      createdFrom: { type: "root" },
      visibleEventIds: []
    }];
    this.activeLeaf = options.activeLeaf ?? {
      sessionId: "session-1",
      branchId: "main",
      eventId: null,
      updatedAt: "2026-05-27T00:00:00.000Z",
      reason: "resume-selected"
    };
  }

  createSession(options: CreateSessionOptions): CreateSessionResult {
    const branch: SessionBranch = {
      id: options.branchId ?? "main",
      sessionId: options.sessionId ?? "session-1",
      createdAt: "2026-05-27T00:00:00.000Z",
      createdFrom: { type: "root" },
      visibleEventIds: []
    };
    return { ok: true, session: this.session, branch };
  }

  getSessionTree(): SessionTreeResult {
    return { ok: true, session: this.session, branches: this.branches, activeLeaf: this.activeLeaf };
  }

  forkBranch(options: ForkBranchOptions): ForkBranchResult {
    const source = this.branches.find((branch) => branch.id === options.fromBranchId);
    if (!source) {
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
    const through = source.visibleEventIds.indexOf(options.fromEventId);
    const branch: SessionBranch = {
      id: options.branchId,
      sessionId: options.sessionId,
      parentBranchId: options.fromBranchId,
      createdAt: "2026-05-27T00:00:00.000Z",
      createdFrom: { type: "event", branchId: options.fromBranchId, eventId: options.fromEventId },
      visibleEventIds: through === -1 ? [] : source.visibleEventIds.slice(0, through + 1)
    };
    this.branches.push(branch);
    return { ok: true, branch };
  }

  setActiveLeaf(options: SetActiveLeafOptions): SetActiveLeafResult {
    this.activeLeaf = {
      sessionId: options.sessionId,
      branchId: options.branchId,
      eventId: options.eventId,
      updatedAt: "2026-05-27T00:00:00.000Z",
      reason: options.reason
    };
    return { ok: true, leaf: this.activeLeaf };
  }
}
