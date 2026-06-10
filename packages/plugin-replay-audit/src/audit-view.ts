import { AgentEventType, ContextSourceKind, summarizeContextSourceMetadata, type AgentEvent, type ArtifactStore, type DurableEventEnvelope, type ReplayAuditResult, type ReplayAuditTimelineItem, type ReplayDiagnostic, type SessionBranch, type SessionLeaf, type SessionRecord, type StoreCorruptionDiagnostic } from "@guga-agent/core";

export type BranchReplayView = {
  session: SessionRecord;
  activeLeaf: SessionLeaf;
  currentBranch: SessionBranch;
  visibleEventIds: string[];
  forkSource?: SessionBranch["createdFrom"];
};

export type AuditViewResult = ReplayAuditResult & {
  branch?: BranchReplayView;
};

export async function buildAuditView(options: {
  events: readonly DurableEventEnvelope[];
  branch?: BranchReplayView;
  artifactStore?: ArtifactStore;
  readDiagnostics?: StoreCorruptionDiagnostic[];
}): Promise<AuditViewResult> {
  const artifactDiagnostics = await inspectArtifacts(options.events, options.artifactStore);
  const diagnostics = [
    ...corruptionDiagnostics(options.readDiagnostics ?? []),
    ...artifactDiagnostics,
    ...interruptedDiagnostics(options.events),
    ...memoryCandidateDiagnostics(options.events),
    ...memoryWriteDiagnostics(options.events)
  ];

  return {
    ok: true,
    timeline: options.events.map((event) => timelineItem(event)),
    diagnostics,
    ...(options.branch ? { branch: options.branch } : {})
  };
}

function timelineItem(envelope: DurableEventEnvelope): ReplayAuditTimelineItem {
  const item: ReplayAuditTimelineItem = {
    eventId: envelope.eventId,
    eventType: envelope.eventType,
    ...(envelope.runId ? { runId: envelope.runId } : {}),
    ...(envelope.turn !== undefined ? { turn: envelope.turn } : {}),
    createdAt: envelope.createdAt
  };
  if (envelope.artifactRefs && envelope.artifactRefs.length > 0) {
    item.artifactRefs = envelope.artifactRefs;
  }
  const diagnostics = eventDiagnostics(envelope);
  if (diagnostics.length > 0) {
    item.diagnostics = diagnostics;
  }
  return item;
}

function eventDiagnostics(envelope: DurableEventEnvelope): ReplayDiagnostic[] {
  const event = envelope.payload as AgentEvent;
  if (event.type === AgentEventType.ToolResultBudgeted && event.result.budget?.reference?.type === "artifact") {
    const evidence = event.result.budget.evidence;
    return [{
      severity: "info",
      code: "TOOL_RESULT_ARTIFACT_REFERENCED",
      message: `Tool result ${event.call.id} was stored as artifact ${event.result.budget.reference.id}`,
      eventId: envelope.eventId,
      artifactId: event.result.budget.reference.id,
      metadata: {
        toolCallId: event.call.id,
        preview: event.result.budget.view?.llmPreview ?? (event.result.ok ? event.result.content : event.result.error.message),
        originalContentChars: event.result.budget.originalContentChars ?? null,
        rawAvailable: evidence?.raw.available ?? true,
        redaction: (event.result.budget.redaction ?? evidence?.audit.redaction ?? { state: "none" }) as unknown as import("@guga-agent/core").JsonObject,
        verifier: (event.result.budget.verifier ?? evidence?.audit.verifier ?? { status: "unverified" }) as unknown as import("@guga-agent/core").JsonObject,
        ...(evidence ? { evidence: evidence as unknown as import("@guga-agent/core").JsonObject } : {}),
        reference: event.result.budget.reference as unknown as import("@guga-agent/core").JsonObject
      }
    }];
  }
  if (event.type === AgentEventType.ContextCompactCompleted || event.type === AgentEventType.ContextCompactFailed) {
    return [{
      severity: event.type === AgentEventType.ContextCompactFailed ? "warning" : "info",
      code: "CONTEXT_COMPACTION_BOUNDARY",
      message: `Compaction ${event.result.id} ${event.type === AgentEventType.ContextCompactFailed ? "failed" : "completed"}`,
      eventId: envelope.eventId,
      metadata: {
        boundary: event.result.boundary as unknown as import("@guga-agent/core").JsonObject,
        trigger: event.result.trigger,
        summary: event.result.summary as unknown as import("@guga-agent/core").JsonObject,
        ...(event.result.quality ? { quality: event.result.quality as unknown as import("@guga-agent/core").JsonObject } : {})
      }
    }];
  }
  if (event.type === AgentEventType.ContextProjectionCreated) {
    const summaries = event.projection.sourceDescriptors
      .map((source) => summarizeContextSourceMetadata(source))
      .filter((summary): summary is NonNullable<typeof summary> => summary !== undefined);
    if (summaries.length > 0) {
      return [{
        severity: "info",
        code: "ATTENTION_CONTEXT_SOURCES_RECORDED",
        message: `Projection ${event.projection.id} recorded ${summaries.length} derived context metadata summaries`,
        eventId: envelope.eventId,
        metadata: {
          summaries: summaries as unknown as import("@guga-agent/core").JsonObject
        }
      }];
    }
  }
  if (event.type === AgentEventType.SessionForked) {
    return [{
      severity: "info",
      code: "SESSION_FORK_RECORDED",
      message: `Branch ${event.branchId} forked from ${event.fromBranchId} at ${event.fromEventId}`,
      eventId: envelope.eventId,
      metadata: {
        sessionId: event.sessionId,
        branchId: event.branchId,
        fromBranchId: event.fromBranchId,
        fromEventId: event.fromEventId
      }
    }];
  }
  if (event.type === AgentEventType.SessionLeafMoved) {
    return [{
      severity: "info",
      code: "SESSION_LEAF_MOVED",
      message: `Active leaf moved to ${event.branchId}`,
      eventId: envelope.eventId,
      metadata: {
        sessionId: event.sessionId,
        branchId: event.branchId,
        eventId: event.eventId ?? null,
        reason: event.reason
      }
    }];
  }
  return [];
}

async function inspectArtifacts(events: readonly DurableEventEnvelope[], artifactStore: ArtifactStore | undefined): Promise<ReplayDiagnostic[]> {
  const refs = events.flatMap((event) => event.artifactRefs ?? []);
  if (refs.length === 0) {
    return [];
  }
  if (!artifactStore) {
    return refs.map((ref) => ({
      severity: "warning",
      code: "ARTIFACT_STORE_UNAVAILABLE",
      message: `Artifact ${ref.artifactId} cannot be verified because no artifact store is configured`,
      artifactId: ref.artifactId
    }));
  }

  const diagnostics: ReplayDiagnostic[] = [];
  for (const ref of refs) {
    const read = await artifactStore.readArtifact(ref.artifactId);
    if (!read.ok) {
      diagnostics.push({
        severity: read.status === "hash_mismatch" ? "error" : "warning",
        code: `ARTIFACT_${read.status.toUpperCase()}`,
        message: read.diagnostic.message,
        artifactId: ref.artifactId,
        metadata: {
          diagnostic: read.diagnostic as unknown as import("@guga-agent/core").JsonObject
        }
      });
    }
  }
  return diagnostics;
}

function corruptionDiagnostics(diagnostics: StoreCorruptionDiagnostic[]): ReplayDiagnostic[] {
  return diagnostics.map((diagnostic) => ({
    severity: diagnostic.recoverable ? "warning" : "error",
    code: `STORE_${diagnostic.kind.toUpperCase()}`,
    message: diagnostic.message,
    ...(diagnostic.eventId ? { eventId: diagnostic.eventId } : {}),
    metadata: {
      recoverable: diagnostic.recoverable,
      ...(diagnostic.metadata ? diagnostic.metadata : {})
    }
  }));
}

function interruptedDiagnostics(events: readonly DurableEventEnvelope[]): ReplayDiagnostic[] {
  const openRuns = new Map<string, DurableEventEnvelope>();
  const openModels = new Map<string, DurableEventEnvelope>();
  const openTools = new Map<string, DurableEventEnvelope>();
  const openPermissions = new Map<string, DurableEventEnvelope>();
  const openCompactions = new Map<string, DurableEventEnvelope>();

  for (const envelope of events) {
    const event = envelope.payload as AgentEvent;
    if (event.type === AgentEventType.RunStarted) {
      openRuns.set(event.runId, envelope);
    } else if (event.type === AgentEventType.RunFinished) {
      openRuns.delete(event.runId);
    } else if (event.type === AgentEventType.ModelRequested) {
      openModels.set(key(event.runId, event.turn), envelope);
    } else if (event.type === AgentEventType.ModelResponded) {
      openModels.delete(key(event.runId, event.turn));
    } else if (isProviderTerminal(event)) {
      openModels.delete(key(event.runId, event.turn));
    } else if (event.type === AgentEventType.ToolStarted) {
      openTools.set(key(event.runId, event.turn, event.call.id), envelope);
    } else if (isToolTerminal(event)) {
      openTools.delete(key(event.runId, event.turn, event.call.id));
    } else if (event.type === AgentEventType.PermissionRequested) {
      openPermissions.set(key(event.runId, event.turn, event.request.toolCallId), envelope);
    } else if (event.type === AgentEventType.PermissionResolved) {
      openPermissions.delete(key(event.runId, event.turn, event.request.toolCallId));
    } else if (event.type === AgentEventType.ContextCompactStarted) {
      openCompactions.set(key(event.runId, event.turn, event.projectionId), envelope);
    } else if (event.type === AgentEventType.ContextCompactCompleted || event.type === AgentEventType.ContextCompactFailed) {
      openCompactions.delete(key(event.runId, event.turn, event.projectionId));
    }
  }

  return [
    ...[...openRuns.values()].map((event) => interrupted("RUN_INTERRUPTED", event, "Run started without a terminal marker")),
    ...[...openModels.values()].map((event) => interrupted("MODEL_INTERRUPTED", event, "Model request started without a terminal marker")),
    ...[...openTools.values()].map((event) => interrupted("TOOL_INTERRUPTED", event, "Tool execution started without a terminal marker")),
    ...[...openPermissions.values()].map((event) => interrupted("PERMISSION_INTERRUPTED", event, "Permission request started without a terminal marker")),
    ...[...openCompactions.values()].map((event) => interrupted("COMPACTION_INTERRUPTED", event, "Compaction started without a terminal marker"))
  ];
}

function memoryCandidateDiagnostics(events: readonly DurableEventEnvelope[]): ReplayDiagnostic[] {
  const candidates = events.flatMap((envelope) => {
    const event = envelope.payload as AgentEvent;
    if (event.type !== AgentEventType.ContextProjectionCreated) {
      return [];
    }
    return event.projection.sourceDescriptors
      .filter((source) => source.kind === ContextSourceKind.MemoryCandidate)
      .map((source) => ({ envelope, source }));
  });
  if (candidates.length === 0) {
    return [{
      severity: "info",
      code: "MEMORY_CANDIDATE_CONTEXT_ABSENT",
      message: "Replay path contains no memory-candidate context sources"
    }];
  }
  return [{
    severity: "info",
    code: "MEMORY_CANDIDATE_CONTEXT_RECORDED",
    message: `Replay path contains ${candidates.length} memory-candidate context source(s); these are candidate context, not curated memory writes`,
    metadata: {
      sourceIds: candidates.map((candidate) => candidate.source.id)
    }
  }];
}

function memoryWriteDiagnostics(events: readonly DurableEventEnvelope[]): ReplayDiagnostic[] {
  const writes = events.filter((envelope) => {
    const payload = JSON.stringify(envelope.payload).toLowerCase();
    return payload.includes("memory.md") || payload.includes("user.md");
  });
  if (writes.length === 0) {
    return [{
      severity: "info",
      code: "CURATED_MEMORY_WRITE_ABSENT",
      message: "Replay path contains no automatic curated memory writes to MEMORY.md or USER.md"
    }];
  }
  return writes.map((event) => ({
    severity: "error",
    code: "CURATED_MEMORY_WRITE_DETECTED",
    message: "Replay path contains an automatic curated memory write",
    eventId: event.eventId
  }));
}

function interrupted(code: string, event: DurableEventEnvelope, message: string): ReplayDiagnostic {
  return {
    severity: "warning",
    code,
    message,
    eventId: event.eventId,
    metadata: {
      eventType: event.eventType,
      runId: event.runId ?? null,
      turn: typeof event.turn === "number" ? event.turn : null
    }
  };
}

function isToolTerminal(event: AgentEvent): event is Extract<AgentEvent, { type:
  | typeof AgentEventType.ToolResult
  | typeof AgentEventType.ToolCompleted
  | typeof AgentEventType.ToolFailed
  | typeof AgentEventType.ToolDenied
  | typeof AgentEventType.ToolCancelled
  | typeof AgentEventType.ToolTimeout
}> {
  return event.type === AgentEventType.ToolResult
    || event.type === AgentEventType.ToolCompleted
    || event.type === AgentEventType.ToolFailed
    || event.type === AgentEventType.ToolDenied
    || event.type === AgentEventType.ToolCancelled
    || event.type === AgentEventType.ToolTimeout;
}

function isProviderTerminal(event: AgentEvent): event is Extract<AgentEvent, { type: typeof AgentEventType.ModelEvent }> {
  return event.type === AgentEventType.ModelEvent
    && (event.event.type === "model.finished" || event.event.type === "model.provider_error");
}

function key(...parts: Array<string | number>): string {
  return parts.join(":");
}
