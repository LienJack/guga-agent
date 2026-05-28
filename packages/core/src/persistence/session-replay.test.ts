import { describe, expect, it } from "vitest";
import { ContextSourceKind, ContextSourcePriority, type ModelInputProjection } from "../contracts/context";
import { AgentEventType } from "../contracts/events";
import type { AgentEvent } from "../contracts/events";
import type {
  CreateSessionOptions,
  CreateSessionResult,
  DurableEventEnvelope,
  EventAppendResult,
  EventStore,
  ForkBranchOptions,
  ForkBranchResult,
  SessionBranch,
  SessionLeaf,
  SessionRecord,
  SessionStore,
  SessionTreeResult,
  SetActiveLeafOptions,
  SetActiveLeafResult,
  StoreCorruptionDiagnostic
} from "../contracts/persistence";
import { ensureToolPairingSafety, toolPairingDecisionCode } from "../context/tool-pairing-safety";
import { createDurableEventEnvelope } from "./durable-event-envelope";
import { replayVisibleSession, resumeSessionFromStores } from "./session-replay";

describe("session replay", () => {
  it("characterizes pairing safety decisions before resume diagnostics consume them", () => {
    const result = ensureToolPairingSafety([
      { role: "assistant", toolCalls: [{ id: "call-1", name: "echo", input: {} }] }
    ]);

    expect(result.decisions.map(toolPairingDecisionCode)).toEqual([
      "TOOL_PAIRING_VALID",
      "TOOL_PAIRING_REPAIRED"
    ]);
  });

  it("restores a completed conversation and projection ledger from durable events", async () => {
    const projection = projectionFixture();
    const events = [
      ...completedRunEvents(),
      durableEvent({ type: AgentEventType.ContextProjectionCreated, runId: "run-1", turn: 0, projection }, { eventId: "event-4", streamRevision: 3, turn: 0 })
    ];
    const sessionStore = new FakeSessionStore({
      branches: [{
        id: "main",
        sessionId: "session-1",
        createdAt: "2026-05-27T00:00:00.000Z",
        createdFrom: { type: "root" },
        visibleEventIds: events.map((event) => event.eventId)
      }],
      activeLeaf: {
        sessionId: "session-1",
        branchId: "main",
        eventId: "event-4",
        updatedAt: "2026-05-27T00:00:00.000Z",
        reason: "resume-selected"
      }
    });

    const report = await resumeSessionFromStores({ eventStore: new FakeEventStore(events), sessionStore }, { sessionId: "session-1" });

    expect(report).toMatchObject({
      ok: true,
      conversation: [{ role: "user", content: "hello" }, { role: "assistant", content: "hi there" }],
      projectionLedger: [expect.objectContaining({ projectionId: "projection-1", runId: "run-1" })],
      interrupted: []
    });
  });

  it("repairs dangling assistant tool calls with synthetic tool observations", () => {
    const result = replayVisibleSession([
      durableEvent({ type: AgentEventType.RunStarted, runId: "run-1", input: "use tool" }, { eventId: "event-1" }),
      durableEvent({
        type: AgentEventType.ModelResponded,
        runId: "run-1",
        turn: 0,
        response: {
          type: "tool_calls",
          toolCalls: [{ id: "call-1", name: "echo", input: {} }]
        }
      }, { eventId: "event-2", turn: 0 })
    ]);

    expect(result.conversation.at(-1)).toMatchObject({
      role: "tool",
      toolCallId: "call-1",
      isError: true,
      content: expect.stringContaining("TOOL_RESULT_SNIPPED")
    });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "TOOL_PAIRING_REPAIRED", severity: "warning" })
    ]);
  });

  it("blocks automatic continuation when the event store reports non-recoverable corruption", async () => {
    const eventStore = new FakeEventStore(completedRunEvents());
    eventStore.diagnostics = [{
      kind: "hash_chain_mismatch",
      streamId: "session/session-1",
      message: "hash chain broke",
      recoverable: false
    }];
    const sessionStore = new FakeSessionStore();

    const report = await resumeSessionFromStores({ eventStore, sessionStore }, { sessionId: "session-1" });

    expect(report).toMatchObject({
      ok: false,
      status: "repair_required",
      diagnostics: [expect.objectContaining({ kind: "hash_chain_mismatch" })]
    });
  });

  it("surfaces interrupted operations and host-facing recovery actions without rerunning side effects", async () => {
    const events = [
      durableEvent({ type: AgentEventType.RunStarted, runId: "run-open", input: "hello" }, { eventId: "event-1" })
    ];
    const sessionStore = new FakeSessionStore({
      branches: [{
        id: "main",
        sessionId: "session-1",
        createdAt: "2026-05-27T00:00:00.000Z",
        createdFrom: { type: "root" },
        visibleEventIds: ["event-1"]
      }],
      activeLeaf: {
        sessionId: "session-1",
        branchId: "main",
        eventId: "event-1",
        updatedAt: "2026-05-27T00:00:00.000Z",
        reason: "resume-selected"
      }
    });

    const report = await resumeSessionFromStores({ eventStore: new FakeEventStore(events), sessionStore }, { sessionId: "session-1" });

    expect(report).toMatchObject({
      ok: true,
      interrupted: [
        expect.objectContaining({
          kind: "run",
          status: "interrupted",
          allowedActions: expect.arrayContaining(["resume", "fork", "mark_abandoned"])
        })
      ]
    });
  });
});

function projectionFixture(): ModelInputProjection {
  return {
    id: "projection-1",
    runId: "run-1",
    turn: 0,
    messages: [{ role: "user", content: "hello" }, { role: "assistant", content: "hi there" }],
    tools: [],
    sourceDescriptors: [{
      id: "source-1",
      kind: ContextSourceKind.History,
      priority: ContextSourcePriority.High,
      provenance: { origin: "core" },
      tokenEstimate: { status: "estimated", tokens: 5 },
      modelVisible: true,
      messageIndexes: [0, 1]
    }],
    budget: {
      reservedOutputTokens: 10,
      estimatedInputTokens: 5,
      estimateStatus: "complete",
      warningThreshold: 0.7,
      compactThreshold: 0.85
    },
    pressure: {
      id: "pressure-1",
      level: "none",
      reason: "ok",
      budget: {
        reservedOutputTokens: 10,
        estimatedInputTokens: 5,
        estimateStatus: "complete",
        warningThreshold: 0.7,
        compactThreshold: 0.85
      },
      sourceIds: ["source-1"]
    },
    policyDecisions: []
  };
}

function durableEvent(payload: AgentEvent | Record<string, unknown>, options: {
  eventId: string;
  streamRevision?: number;
  parentEventId?: string | null;
  turn?: number;
}): DurableEventEnvelope {
  const runId = typeof payload.runId === "string" ? payload.runId : undefined;
  const turn = options.turn ?? (typeof payload.turn === "number" ? payload.turn : undefined);
  return createDurableEventEnvelope({
    schemaVersion: 1,
    eventId: options.eventId,
    streamId: "session/session-1",
    streamRevision: options.streamRevision ?? 0,
    sessionId: "session-1",
    branchId: "main",
    ...(runId ? { runId } : {}),
    ...(turn !== undefined ? { turn } : {}),
    parentEventId: options.parentEventId ?? null,
    previousEventHash: null,
    createdAt: "2026-05-27T00:00:00.000Z",
    actor: { type: "runtime", id: "test" },
    source: { type: "runtime", id: "core-test" },
    payload
  });
}

function completedRunEvents(): DurableEventEnvelope[] {
  return [
    durableEvent({ type: AgentEventType.RunStarted, runId: "run-1", input: "hello" }, { eventId: "event-1", streamRevision: 0 }),
    durableEvent({
      type: AgentEventType.ModelResponded,
      runId: "run-1",
      turn: 0,
      response: { type: "final", content: "hi there" }
    }, { eventId: "event-2", streamRevision: 1, parentEventId: "event-1", turn: 0 }),
    durableEvent({
      type: AgentEventType.RunFinished,
      runId: "run-1",
      status: "completed"
    }, { eventId: "event-3", streamRevision: 2, parentEventId: "event-2" })
  ];
}

class FakeEventStore implements EventStore {
  diagnostics: StoreCorruptionDiagnostic[] = [];
  status: "ok" | "not_found" | "corrupt" | "upcaster_failed" | "unavailable" = "ok";

  constructor(readonly events: DurableEventEnvelope[] = []) {}

  append(event: DurableEventEnvelope): EventAppendResult {
    this.events.push(event);
    return { ok: true, status: "appended", event, streamRevision: event.streamRevision };
  }

  readStream() {
    if (this.status === "ok") {
      return { ok: true as const, events: this.events, nextRevision: this.events.length, diagnostics: this.diagnostics };
    }
    return { ok: false as const, status: this.status, diagnostics: this.diagnostics };
  }
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
    return {
      ok: true,
      branch: {
        id: options.branchId,
        sessionId: options.sessionId,
        parentBranchId: options.fromBranchId,
        createdAt: "2026-05-27T00:00:00.000Z",
        createdFrom: { type: "event", branchId: options.fromBranchId, eventId: options.fromEventId },
        visibleEventIds: [options.fromEventId]
      }
    };
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
