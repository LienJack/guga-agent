import type { CompactionBoundary, ContextPolicyDecision, ModelInputProjection, ProjectionLedgerEntry } from "./context";
import type { AgentEvent } from "./events";
import type { CoreMessage } from "./messages";
import type { ModelIdentifier, ModelPurpose } from "./provider";
import type { ToolEffect } from "./tools";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type HashDescriptor = {
  algorithm: "sha256";
  value: string;
};

export type DurableEventActor = {
  type: "user" | "assistant" | "tool" | "provider" | "plugin" | "runtime" | "host" | "system";
  id?: string;
  label?: string;
  metadata?: JsonObject;
};

export type DurableEventSource = {
  type: "runtime" | "plugin" | "host" | "tool" | "provider" | "replay" | "migration";
  id: string;
  pluginId?: string;
  packageName?: string;
  version?: string;
  metadata?: JsonObject;
};

export type DurableEventIdempotency = {
  key: string;
  scope: "stream" | "session" | "branch" | "global";
};

export type DurableEventProvenance = {
  sourceEventIds?: string[];
  sourceArtifactIds?: string[];
  scope?: "session" | "branch" | "run" | "turn" | "tool" | "context" | "artifact" | "memory-candidate";
  compactionBoundary?: CompactionBoundary;
  projectionDecisionIds?: string[];
  metadata?: JsonObject;
};

export type ArtifactRetention = "session" | "until-deleted" | "ephemeral" | "external-policy";

export type ArtifactRedaction =
  | {
      state: "none";
    }
  | {
      state: "redacted";
      reason?: string;
      redactedAt?: string;
      actor?: DurableEventActor;
    }
  | {
      state: "tombstoned";
      reason?: string;
      tombstonedAt?: string;
      actor?: DurableEventActor;
    };

export type ArtifactManifestTransition = {
  type: "created" | "redacted" | "tombstoned" | "retention-updated";
  createdAt: string;
  actor?: DurableEventActor;
  reason?: string;
  metadata?: JsonObject;
};

export type ArtifactReference = {
  artifactId: string;
  contentHash: HashDescriptor;
  sizeBytes: number;
  mimeType: string;
  createdAt: string;
  label?: string;
  privacyTags?: string[];
  retention?: ArtifactRetention;
  redaction?: ArtifactRedaction;
  transitions?: ArtifactManifestTransition[];
  tombstone?: {
    reason: string;
    createdAt: string;
    actor?: DurableEventActor;
  };
  metadata?: JsonObject;
};

export type DurableEventEnvelope<TPayload = AgentEvent | JsonObject> = {
  schemaVersion: number;
  eventId: string;
  eventType: string;
  streamId: string;
  streamRevision: number;
  sessionId: string;
  branchId: string;
  runId?: string;
  turn?: number;
  attempt?: number;
  parentEventId: string | null;
  previousEventHash: HashDescriptor | null;
  createdAt: string;
  actor: DurableEventActor;
  source: DurableEventSource;
  idempotency?: DurableEventIdempotency;
  causationId?: string;
  correlationId?: string;
  provenance?: DurableEventProvenance;
  privacyTags?: string[];
  artifactRefs?: ArtifactReference[];
  payload: TPayload;
  payloadHash: HashDescriptor;
};

export type ExpectedRevision = "any" | "no-stream" | number;

export type EventAppendOptions = {
  expectedRevision?: ExpectedRevision;
  idempotencyKey?: string;
};

export type EventAppendSuccess = {
  ok: true;
  status: "appended" | "idempotent_replay";
  event: DurableEventEnvelope;
  streamRevision: number;
};

export type EventAppendConflict =
  | {
      ok: false;
      status: "expected_revision_conflict";
      expectedRevision: ExpectedRevision | undefined;
      actualRevision: number | "no-stream";
    }
  | {
      ok: false;
      status: "idempotency_conflict";
      key: string;
      existingEventId: string;
      existingPayloadHash: HashDescriptor;
      attemptedEventId: string;
      attemptedPayloadHash: HashDescriptor;
    };

export type StoreUnavailable = {
  ok: false;
  status: "unavailable";
  reason: string;
};

export type EventAppendResult = EventAppendSuccess | EventAppendConflict | StoreUnavailable;

export type EventStreamReadOptions = {
  fromRevision?: number;
  limit?: number;
  direction?: "forwards" | "backwards";
  targetSchemaVersion?: number;
};

export type StoreCorruptionKind =
  | "partial_tail"
  | "middle_corruption"
  | "hash_chain_mismatch"
  | "schema_invalid"
  | "artifact_missing"
  | "unknown";

export type StoreCorruptionDiagnostic = {
  kind: StoreCorruptionKind;
  streamId?: string;
  eventId?: string;
  revision?: number;
  message: string;
  recoverable: boolean;
  quarantineRef?: string;
  metadata?: JsonObject;
};

export type EventStreamReadResult =
  | {
      ok: true;
      events: DurableEventEnvelope[];
      nextRevision: number;
      diagnostics?: StoreCorruptionDiagnostic[];
    }
  | {
      ok: false;
      status: "not_found" | "corrupt" | "upcaster_failed" | "unavailable";
      diagnostics: StoreCorruptionDiagnostic[];
    };

export type EventStore = {
  append(event: DurableEventEnvelope, options?: EventAppendOptions): Promise<EventAppendResult> | EventAppendResult;
  readStream(streamId: string, options?: EventStreamReadOptions): Promise<EventStreamReadResult> | EventStreamReadResult;
};

export type SessionRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  activeBranchId: string;
  rootBranchId: string;
  title?: string;
  metadata?: JsonObject;
};

export type SessionBranchSource =
  | {
      type: "root";
    }
  | {
      type: "event";
      branchId: string;
      eventId: string;
      visibility?: "visible" | "not_visible" | "unknown";
    }
  | {
      type: "session";
      sessionId: string;
      branchId: string;
      eventId?: string;
    };

export type SessionBranch = {
  id: string;
  sessionId: string;
  parentBranchId?: string;
  createdAt: string;
  createdFrom: SessionBranchSource;
  visibleEventIds: string[];
  metadata?: JsonObject;
};

export type SessionLeaf = {
  sessionId: string;
  branchId: string;
  eventId: string | null;
  updatedAt: string;
  reason: "session-created" | "host-selected" | "fork-created" | "resume-selected" | "repair-selected";
};

export type SessionConflictDiagnostic = {
  status:
    | "branch_id_conflict"
    | "source_event_not_found"
    | "source_event_not_visible"
    | "active_leaf_not_found"
    | "cycle_detected"
    | "session_not_found"
    | "unavailable";
  message: string;
  sessionId?: string;
  branchId?: string;
  eventId?: string;
  metadata?: JsonObject;
};

export type CreateSessionOptions = {
  sessionId?: string;
  branchId?: string;
  title?: string;
  metadata?: JsonObject;
};

export type CreateSessionResult =
  | {
      ok: true;
      session: SessionRecord;
      branch: SessionBranch;
    }
  | {
      ok: false;
      diagnostic: SessionConflictDiagnostic;
    };

export type SessionTreeResult =
  | {
      ok: true;
      session: SessionRecord;
      branches: SessionBranch[];
      activeLeaf: SessionLeaf;
      diagnostics?: SessionConflictDiagnostic[];
    }
  | {
      ok: false;
      diagnostic: SessionConflictDiagnostic;
    };

export type SessionSummary = {
  session: SessionRecord;
  activeLeaf?: SessionLeaf;
  branchCount?: number;
  diagnostics?: SessionConflictDiagnostic[];
};

export type ListSessionsOptions = {
  limit?: number;
  cursor?: string;
  order?: "updated_desc" | "created_desc";
};

export type ListSessionsResult =
  | {
      ok: true;
      sessions: SessionSummary[];
      nextCursor?: string;
      diagnostics?: SessionConflictDiagnostic[];
    }
  | {
      ok: false;
      diagnostic: SessionConflictDiagnostic;
    };

export type ForkBranchOptions = {
  sessionId: string;
  branchId: string;
  fromBranchId: string;
  fromEventId: string;
  metadata?: JsonObject;
};

export type ForkBranchResult =
  | {
      ok: true;
      branch: SessionBranch;
    }
  | {
      ok: false;
      diagnostic: SessionConflictDiagnostic;
    };

export type SetActiveLeafOptions = {
  sessionId: string;
  branchId: string;
  eventId: string | null;
  reason: SessionLeaf["reason"];
};

export type SetActiveLeafResult =
  | {
      ok: true;
      leaf: SessionLeaf;
    }
  | {
      ok: false;
      diagnostic: SessionConflictDiagnostic;
    };

export type SessionStore = {
  createSession(options: CreateSessionOptions): Promise<CreateSessionResult> | CreateSessionResult;
  getSessionTree(sessionId: string): Promise<SessionTreeResult> | SessionTreeResult;
  listSessions?(options?: ListSessionsOptions): Promise<ListSessionsResult> | ListSessionsResult;
  forkBranch(options: ForkBranchOptions): Promise<ForkBranchResult> | ForkBranchResult;
  setActiveLeaf(options: SetActiveLeafOptions): Promise<SetActiveLeafResult> | SetActiveLeafResult;
};

export type PutArtifactOptions = {
  data: string | Uint8Array | JsonValue;
  mimeType: string;
  artifactId?: string;
  label?: string;
  privacyTags?: string[];
  retention?: ArtifactRetention;
  actor?: DurableEventActor;
  metadata?: JsonObject;
};

export type PutArtifactResult =
  | {
      ok: true;
      reference: ArtifactReference;
    }
  | StoreUnavailable;

export type ReadArtifactResult =
  | {
      ok: true;
      data: string | Uint8Array | JsonValue;
      reference?: ArtifactReference;
    }
  | {
      ok: false;
      status: "not_found" | "tombstoned" | "hash_mismatch" | "unavailable";
      diagnostic: StoreCorruptionDiagnostic;
    };

export type TombstoneArtifactResult =
  | {
      ok: true;
      reference: ArtifactReference;
    }
  | {
      ok: false;
      status: "not_found" | "unavailable";
      diagnostic: StoreCorruptionDiagnostic;
    };

export type ArtifactStore = {
  putArtifact(options: PutArtifactOptions): Promise<PutArtifactResult> | PutArtifactResult;
  readArtifact(artifactId: string): Promise<ReadArtifactResult> | ReadArtifactResult;
  tombstoneArtifact(
    artifactId: string,
    options: { reason: string; createdAt?: string; actor?: DurableEventActor }
  ): Promise<TombstoneArtifactResult> | TombstoneArtifactResult;
};

export type ProviderToolDescriptorRecord = {
  name: string;
  description: string;
  inputSchema: JsonValue;
  effect: ToolEffect;
  metadata?: JsonObject;
};

export type ProviderInputRecord = {
  projectionId: string;
  runId: string;
  turn: number;
  provider?: Partial<ModelIdentifier> & {
    purpose?: ModelPurpose;
  };
  messages: CoreMessage[];
  tools: ProviderToolDescriptorRecord[];
  sourceDescriptors: ProjectionLedgerEntry["sourceDescriptors"];
  sourceMetadataSummaries?: ProjectionLedgerEntry["sourceMetadataSummaries"];
  policyDecisions: ContextPolicyDecision[];
  projectionHash?: ModelInputProjection["hash"];
  artifactRefs?: ArtifactReference[];
  metadata?: JsonObject;
};

export type ReplayDiagnostic = {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  eventId?: string;
  artifactId?: string;
  metadata?: JsonObject;
};

export type ReplayRequest = {
  sessionId: string;
  branchId?: string;
  throughEventId?: string;
  turn?: number;
  targetSchemaVersion?: number;
};

export type ReplayConversationResult = {
  ok: true;
  messages: CoreMessage[];
  diagnostics: ReplayDiagnostic[];
};

export type ReplayModelInputResult = {
  ok: true;
  projection: ProviderInputRecord | undefined;
  diagnostics: ReplayDiagnostic[];
};

export type ReplayAuditTimelineItem = {
  eventId: string;
  eventType: string;
  runId?: string;
  turn?: number;
  createdAt?: string;
  artifactRefs?: ArtifactReference[];
  diagnostics?: ReplayDiagnostic[];
};

export type ReplayAuditResult = {
  ok: true;
  timeline: ReplayAuditTimelineItem[];
  diagnostics: ReplayDiagnostic[];
};

export type ReplayFailureResult = {
  ok: false;
  status: "not_found" | "corrupt" | "interrupted" | "unavailable" | "upcaster_failed";
  diagnostics: ReplayDiagnostic[];
};

export type ReplayCapability = {
  replayConversation(
    request: ReplayRequest
  ): Promise<ReplayConversationResult | ReplayFailureResult> | ReplayConversationResult | ReplayFailureResult;
  replayModelInput(
    request: ReplayRequest
  ): Promise<ReplayModelInputResult | ReplayFailureResult> | ReplayModelInputResult | ReplayFailureResult;
  replayAudit(request: ReplayRequest): Promise<ReplayAuditResult | ReplayFailureResult> | ReplayAuditResult | ReplayFailureResult;
};

export type DurableEventUpcastDiagnostic = {
  fromSchemaVersion: number;
  toSchemaVersion: number;
  eventId: string;
  message?: string;
};

export type DurableEventUpcaster = {
  fromSchemaVersion: number;
  toSchemaVersion: number;
  upcast(event: DurableEventEnvelope): DurableEventEnvelope;
};

export type DurableEventUpcastResult =
  | {
      ok: true;
      status: "current" | "upcasted";
      envelope: DurableEventEnvelope;
      diagnostics: DurableEventUpcastDiagnostic[];
    }
  | {
      ok: false;
      status: "unknown_schema" | "upcaster_missing" | "upcaster_failed";
      fromSchemaVersion: number;
      toSchemaVersion: number;
      eventId: string;
      message: string;
      diagnostics: DurableEventUpcastDiagnostic[];
    };
