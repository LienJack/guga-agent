import { describe, expect, it } from "vitest";
import { AgentEventType } from "@guga-agent/core";
import { ReplayAuditProjectionCapability } from "./replay-audit-plugin";
import { durableEvent, FakeEventStore, FakeSessionStore, projectionFixture } from "./test-fixtures";

describe("ReplayAuditProjectionCapability", () => {
  it("replays conversation, model input and audit views from public stores", async () => {
    const projection = projectionFixture();
    const events = [
      durableEvent({ type: AgentEventType.RunStarted, runId: "run-1", input: "hello" }, { eventId: "event-1", streamRevision: 0 }),
      durableEvent({ type: AgentEventType.ContextProjectionCreated, runId: "run-1", turn: 0, projection }, { eventId: "event-2", streamRevision: 1 }),
      durableEvent({
        type: AgentEventType.ProviderInputCommitted,
        runId: "run-1",
        turn: 0,
        projectionId: "projection-1",
        projectionHash: projection.hash
      }, { eventId: "event-3", streamRevision: 2 }),
      durableEvent({
        type: AgentEventType.ModelResponded,
        runId: "run-1",
        turn: 0,
        response: { type: "final", content: "hi" }
      }, { eventId: "event-4", streamRevision: 3 })
    ];
    const capability = new ReplayAuditProjectionCapability({
      eventStore: new FakeEventStore(events),
      sessionStore: new FakeSessionStore(events)
    });

    await expect(capability.replayConversation({ sessionId: "session-1", branchId: "main" })).resolves.toMatchObject({
      ok: true,
      messages: [{ role: "user", content: "hello" }, { role: "assistant", content: "hi" }]
    });
    await expect(capability.replayModelInput({ sessionId: "session-1", branchId: "main", turn: 0 })).resolves.toMatchObject({
      ok: true,
      projection: { projectionId: "projection-1", projectionHash: { value: "projection-hash-1" } }
    });
    await expect(capability.replayAudit({ sessionId: "session-1", branchId: "main" })).resolves.toMatchObject({
      ok: true,
      timeline: [
        { eventId: "event-1" },
        { eventId: "event-2" },
        { eventId: "event-3" },
        { eventId: "event-4" }
      ],
      branch: {
        activeLeaf: { branchId: "main", eventId: "event-4" },
        visibleEventIds: ["event-1", "event-2", "event-3", "event-4"]
      }
    });
  });

  it("returns replay failures for corrupt event streams without rerunning side effects", async () => {
    const store = new FakeEventStore();
    store.status = "corrupt";
    store.diagnostics = [{ kind: "middle_corruption", message: "bad line", recoverable: false }];
    const capability = new ReplayAuditProjectionCapability({ eventStore: store });

    await expect(capability.replayConversation({ sessionId: "session-1", branchId: "main" })).resolves.toMatchObject({
      ok: false,
      status: "corrupt",
      diagnostics: [expect.objectContaining({ code: "STORE_MIDDLE_CORRUPTION", severity: "error" })]
    });
  });

  it("falls back to session streams and explains fork lineage in audit views", async () => {
    const events = [
      durableEvent({ type: AgentEventType.RunStarted, runId: "run-1", input: "root" }, { eventId: "event-1", streamId: "session/session-1", streamRevision: 0 }),
      durableEvent({
        type: AgentEventType.ContextCompactCompleted,
        runId: "run-1",
        turn: 0,
        projectionId: "projection-1",
        result: compactResult()
      }, { eventId: "event-2", streamId: "session/session-1", streamRevision: 1 }),
      durableEvent({
        type: AgentEventType.SessionForked,
        runId: "session-fork-1",
        sessionId: "session-1",
        branchId: "branch-before-compact",
        fromBranchId: "main",
        fromEventId: "event-1"
      }, { eventId: "event-3", branchId: "branch-before-compact", streamId: "session/session-1", streamRevision: 2 }),
      durableEvent({
        type: AgentEventType.SessionLeafMoved,
        runId: "session-fork-1",
        sessionId: "session-1",
        branchId: "branch-before-compact",
        eventId: "event-1",
        reason: "fork-created"
      }, { eventId: "event-4", branchId: "branch-before-compact", streamId: "session/session-1", streamRevision: 3 })
    ];
    const capability = new ReplayAuditProjectionCapability({
      eventStore: new FakeEventStore(events, "session/session-1"),
      sessionStore: new FakeSessionStore(events, {
        branchId: "branch-before-compact",
        parentBranchId: "main",
        forkEventId: "event-1",
        branchVisibleEventIds: ["event-1"]
      })
    });

    await expect(capability.replayAudit({ sessionId: "session-1", branchId: "branch-before-compact" })).resolves.toMatchObject({
      ok: true,
      branch: {
        activeLeaf: { branchId: "branch-before-compact", eventId: "event-1" },
        forkSource: { type: "event", branchId: "main", eventId: "event-1" },
        visibleEventIds: ["event-1"]
      },
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "CURATED_MEMORY_WRITE_ABSENT" })
      ])
    });
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
