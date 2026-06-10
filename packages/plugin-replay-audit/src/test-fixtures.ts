import {
  AgentEventType,
  ContextSourceKind,
  ContextSourcePriority,
  createDurableEventEnvelope,
  type AgentEvent,
  type ArtifactReference,
  type CreateSessionOptions,
  type CreateSessionResult,
  type DurableEventEnvelope,
  type EventAppendResult,
  type EventStore,
  type EventStreamReadOptions,
  type EventStreamReadResult,
  type ForkBranchOptions,
  type ForkBranchResult,
  type ModelInputProjection,
  type SessionBranch,
  type SessionLeaf,
  type SessionRecord,
  type SessionStore,
  type SessionTreeResult,
  type SetActiveLeafOptions,
  type SetActiveLeafResult,
  type StoreCorruptionDiagnostic
} from "@guga-agent/core";

export function durableEvent(payload: AgentEvent, options: {
  eventId: string;
  branchId?: string;
  streamId?: string;
  streamRevision?: number;
  artifactRefs?: ArtifactReference[];
}): DurableEventEnvelope {
  const input: Parameters<typeof createDurableEventEnvelope<AgentEvent>>[0] = {
    schemaVersion: 1,
    eventId: options.eventId,
    streamId: options.streamId ?? "session/session-1/main",
    streamRevision: options.streamRevision ?? 0,
    sessionId: "session-1",
    branchId: options.branchId ?? "main",
    runId: payload.runId,
    parentEventId: null,
    previousEventHash: null,
    createdAt: `2026-05-27T00:00:${String(options.streamRevision ?? 0).padStart(2, "0")}.000Z`,
    actor: { type: "runtime", id: "test" },
    source: { type: "runtime", id: "core-test" },
    payload
  };
  if ("turn" in payload) {
    input.turn = payload.turn;
  }
  if (options.artifactRefs) {
    input.artifactRefs = options.artifactRefs;
  }
  return createDurableEventEnvelope(input);
}

export function projectionFixture(options: { attentionSources?: boolean } = {}): ModelInputProjection {
  return {
    id: "projection-1",
    runId: "run-1",
    turn: 0,
    messages: [{ role: "user", content: "hello" }],
    tools: [{
      name: "search",
      description: "Search the workspace",
      inputSchema: { type: "object", properties: { query: { type: "string" } } },
      effect: "read",
      execute() {
        return { ok: true, content: "not used during replay" };
      }
    }],
    sourceDescriptors: [
      {
        id: "source-history",
        kind: ContextSourceKind.History,
        priority: ContextSourcePriority.High,
        provenance: { origin: "core" },
        tokenEstimate: { status: "known", tokens: 3 },
        modelVisible: true,
        messageIndexes: [0],
        references: [{ type: "host-reference", id: "turn-0", label: "turn 0" }]
      },
      ...(options.attentionSources ? attentionSourceFixtures() : [])
    ],
    budget: {
      reservedOutputTokens: 10,
      estimatedInputTokens: 3,
      estimateStatus: "complete",
      warningThreshold: 0.7,
      compactThreshold: 0.85
    },
    pressure: {
      id: "pressure-1",
      level: "none",
      reason: "within budget",
      budget: {
        reservedOutputTokens: 10,
        estimatedInputTokens: 3,
        estimateStatus: "complete",
        warningThreshold: 0.7,
        compactThreshold: 0.85
      },
      sourceIds: ["source-history"]
    },
    policyDecisions: [{
      id: "decision-1",
      kind: "source-contribution",
      phase: "context.assemble",
      sourceIds: ["source-history"],
      reason: "history included"
    }],
    hash: {
      algorithm: "sha256",
      value: "projection-hash-1",
      inputVersion: "projection-v1"
    }
  };
}

function attentionSourceFixtures(): ModelInputProjection["sourceDescriptors"] {
  return [
    {
      id: "source-state",
      kind: ContextSourceKind.StateProjection,
      priority: ContextSourcePriority.High,
      provenance: { origin: "core" },
      tokenEstimate: { status: "estimated", tokens: 4 },
      modelVisible: false,
      references: [{ type: "message", id: "message-0", label: "objective source" }],
      metadata: {
        ontology: ContextSourceKind.StateProjection,
        sensitivity: "internal",
        confidence: "high",
        scope: "run",
        intendedUsage: ["compaction-continuity", "audit"],
        generatedFromSourceIds: ["message-0"],
        items: [{
          kind: "objective",
          label: "current objective",
          sensitivity: "internal",
          confidence: "high",
          scope: "run",
          intendedUsage: ["compaction-continuity"],
          sourceRefs: [{ type: "message", id: "message-0" }]
        }]
      }
    },
    {
      id: "source-trace",
      kind: ContextSourceKind.AccountableTrace,
      priority: ContextSourcePriority.Medium,
      provenance: { origin: "core" },
      tokenEstimate: { status: "estimated", tokens: 3 },
      modelVisible: false,
      metadata: {
        ontology: ContextSourceKind.AccountableTrace,
        sensitivity: "internal",
        confidence: "medium",
        scope: "run",
        intendedUsage: ["audit", "replay"],
        generatedFromDecisionIds: ["decision-1"],
        generatedFromSourceIds: [],
        items: [{
          kind: "decision",
          label: "context decision",
          sensitivity: "internal",
          confidence: "medium",
          scope: "run",
          intendedUsage: ["audit"],
          sourceRefs: [{ type: "host-reference", id: "decision-1" }]
        }]
      }
    },
    {
      id: "source-memory-candidate",
      kind: ContextSourceKind.MemoryCandidate,
      priority: ContextSourcePriority.Low,
      provenance: { origin: "core" },
      tokenEstimate: { status: "estimated", tokens: 1 },
      modelVisible: false,
      metadata: {
        ontology: ContextSourceKind.MemoryCandidate,
        sensitivity: "sensitive",
        confidence: "medium",
        scope: "session",
        intendedUsage: ["memory-review", "audit"],
        rawCandidateText: "raw candidate text must not appear in replay output",
        candidates: [{
          candidateId: "candidate-1",
          rawCandidateTextIncluded: false
        }]
      }
    }
  ];
}

export function artifactReferenceFixture(): ArtifactReference {
  return {
    artifactId: "artifact-large-output",
    contentHash: { algorithm: "sha256", value: "a".repeat(64) },
    sizeBytes: 1024,
    mimeType: "text/plain",
    createdAt: "2026-05-27T00:00:00.000Z",
    label: "large tool output",
    privacyTags: ["tool-result"],
    redaction: { state: "none" }
  };
}

export class FakeEventStore implements EventStore {
  diagnostics: StoreCorruptionDiagnostic[] = [];
  status: "ok" | "not_found" | "corrupt" | "upcaster_failed" | "unavailable" = "ok";
  readonly streams = new Map<string, DurableEventEnvelope[]>();

  constructor(events: DurableEventEnvelope[] = [], streamId = "session/session-1/main") {
    this.streams.set(streamId, events);
  }

  append(event: DurableEventEnvelope): EventAppendResult {
    const events = this.streams.get(event.streamId) ?? [];
    events.push(event);
    this.streams.set(event.streamId, events);
    return { ok: true, status: "appended", event, streamRevision: event.streamRevision };
  }

  readStream(streamId: string, _options?: EventStreamReadOptions): EventStreamReadResult {
    if (this.status !== "ok") {
      return { ok: false, status: this.status, diagnostics: this.diagnostics };
    }
    const events = this.streams.get(streamId);
    if (!events) {
      return {
        ok: false,
        status: "not_found",
        diagnostics: [{
          kind: "unknown",
          streamId,
          message: `Stream not found: ${streamId}`,
          recoverable: true
        }]
      };
    }
    return { ok: true, events, nextRevision: events.length, diagnostics: this.diagnostics };
  }
}

export class FakeSessionStore implements SessionStore {
  session: SessionRecord;
  branches: SessionBranch[];
  activeLeaf: SessionLeaf;

  constructor(events: DurableEventEnvelope[], options: { branchId?: string; parentBranchId?: string; forkEventId?: string; branchVisibleEventIds?: string[] } = {}) {
    const branchId = options.branchId ?? "main";
    this.session = {
      id: "session-1",
      createdAt: "2026-05-27T00:00:00.000Z",
      updatedAt: "2026-05-27T00:00:00.000Z",
      activeBranchId: branchId,
      rootBranchId: "main"
    };
    this.branches = [{
      id: "main",
      sessionId: "session-1",
      createdAt: "2026-05-27T00:00:00.000Z",
      createdFrom: { type: "root" },
      visibleEventIds: events.filter((event) => event.branchId === "main").map((event) => event.eventId)
    }];
    if (branchId !== "main") {
      this.branches.push({
        id: branchId,
        sessionId: "session-1",
        parentBranchId: options.parentBranchId ?? "main",
        createdAt: "2026-05-27T00:00:00.000Z",
        createdFrom: { type: "event", branchId: options.parentBranchId ?? "main", eventId: options.forkEventId ?? events[0]?.eventId ?? "event-1" },
        visibleEventIds: options.branchVisibleEventIds ?? events.filter((event) => event.branchId === branchId).map((event) => event.eventId)
      });
    }
    this.activeLeaf = {
      sessionId: "session-1",
      branchId,
      eventId: options.branchVisibleEventIds?.at(-1) ?? events.at(-1)?.eventId ?? null,
      updatedAt: "2026-05-27T00:00:00.000Z",
      reason: "resume-selected"
    };
  }

  createSession(_options: CreateSessionOptions): CreateSessionResult {
    const [branch] = this.branches;
    if (!branch) {
      throw new Error("FakeSessionStore requires at least one branch");
    }
    return { ok: true, session: this.session, branch };
  }

  getSessionTree(): SessionTreeResult {
    return { ok: true, session: this.session, branches: this.branches, activeLeaf: this.activeLeaf };
  }

  forkBranch(options: ForkBranchOptions): ForkBranchResult {
    const branch: SessionBranch = {
      id: options.branchId,
      sessionId: options.sessionId,
      parentBranchId: options.fromBranchId,
      createdAt: "2026-05-27T00:00:00.000Z",
      createdFrom: { type: "event", branchId: options.fromBranchId, eventId: options.fromEventId },
      visibleEventIds: [options.fromEventId]
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
