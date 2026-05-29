import type {
  CodeTaskCompletionEvidenceResource,
  CodeTaskStateResource,
  HostErrorPayload,
  InteractionRequest,
  QueuedRunInputSummaryResource,
  VerificationAttemptResource
} from "@guga-agent/host-protocol";

export type WorkbenchStartupMetadata = {
  projectPath: string;
  sessionId?: string;
  branchId?: string;
  profileId: string;
  providerId?: string;
  modelId?: string;
  configSource?: string;
  slashCommands: string[];
};

export type WorkbenchRunStatus =
  | "idle"
  | "running"
  | "waiting-for-permission"
  | "waiting-for-interaction"
  | "completed"
  | "failed"
  | "cancelled";

export type WorkbenchUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd?: number;
};

export type QueueSummary = {
  pending: QueuedRunInputSummaryResource[];
  pendingCount: number;
  deferredCount: number;
  followUpCount: number;
  steerCount: number;
};

export type WorkbenchDisconnectedReason = "stream-error" | "seq-discontinuity" | "replay-unavailable";

export type WorkbenchDisconnectedState = {
  reason: WorkbenchDisconnectedReason;
  message: string;
  lockHint: string;
  expectedSeq?: number;
  actualSeq?: number;
};

export type PendingPermissionProjection = {
  sessionId: string;
  runId: string;
  requestId: string;
  callId: string;
  toolName: string;
  input?: unknown;
  reason?: string;
  firstSeq: number;
  lastSeq: number;
  occurredAt: string;
};

export type PendingInteractionProjection = {
  sessionId: string;
  runId: string;
  requestId: string;
  request: InteractionRequest;
  firstSeq: number;
  lastSeq: number;
  occurredAt: string;
};

export type ActiveTaskProjection = {
  sessionId: string;
  taskId: string;
  objective: string;
  state: CodeTaskStateResource;
  phase: CodeTaskStateResource;
  attempt: number;
  activeRunId?: string;
  lastVerification?: VerificationAttemptResource;
  completionEvidence?: CodeTaskCompletionEvidenceResource;
  firstSeq: number;
  lastSeq: number;
  occurredAt: string;
};

type TranscriptBlockBase<Kind extends string> = {
  id: string;
  kind: Kind;
  sessionId: string;
  runId: string;
  firstSeq: number;
  lastSeq: number;
  occurredAt: string;
};

export type AssistantTranscriptBlock = TranscriptBlockBase<"assistant"> & {
  messageId: string;
  text: string;
  status: "streaming" | "completed";
};

export type UserTranscriptBlock = TranscriptBlockBase<"user"> & {
  text: string;
};

export type ReasoningTranscriptBlock = TranscriptBlockBase<"reasoning"> & {
  messageId: string;
  text: string;
  status: "streaming" | "completed";
};

export type ToolTranscriptBlock = TranscriptBlockBase<"tool"> & {
  callId: string;
  name: string;
  status: "running" | "completed" | "failed";
  input?: unknown;
  output?: unknown;
  progress?: number;
  progressMessage?: string;
  artifactIds: string[];
  error?: HostErrorPayload;
};

export type PermissionTranscriptBlock = TranscriptBlockBase<"permission"> & {
  requestId: string;
  callId: string;
  toolName: string;
  status: "pending" | "allowed" | "denied" | "cancelled";
  input?: unknown;
  reason?: string;
  remember?: "once" | "session" | "always";
  resolutionReason?: string;
};

export type InteractionTranscriptBlock = TranscriptBlockBase<"interaction"> & {
  requestId: string;
  request: InteractionRequest;
  status: "pending" | "resolved" | "cancelled";
  response?: unknown;
};

export type QueueTranscriptBlock = TranscriptBlockBase<"queue"> & QueueSummary;

export type AbortTranscriptBlock = TranscriptBlockBase<"abort"> & {
  error: HostErrorPayload;
};

export type ErrorTranscriptBlock = TranscriptBlockBase<"error"> & {
  error: HostErrorPayload;
};

export type ArtifactTranscriptBlock = TranscriptBlockBase<"artifact"> & {
  artifactId: string;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
};

export type ContextTranscriptBlock = TranscriptBlockBase<"context"> & {
  boundaryId: string;
  trigger: string;
  summary?: string;
};

export type RetryTranscriptBlock = TranscriptBlockBase<"retry"> & {
  attempt: number;
  status: "started" | "completed";
  reason?: string;
};

export type TranscriptBlock =
  | AssistantTranscriptBlock
  | UserTranscriptBlock
  | ReasoningTranscriptBlock
  | ToolTranscriptBlock
  | PermissionTranscriptBlock
  | InteractionTranscriptBlock
  | QueueTranscriptBlock
  | AbortTranscriptBlock
  | ErrorTranscriptBlock
  | ArtifactTranscriptBlock
  | ContextTranscriptBlock
  | RetryTranscriptBlock;

export type WorkbenchState = {
  startup: WorkbenchStartupMetadata;
  transcriptBlocks: TranscriptBlock[];
  activeSessionId?: string;
  activeRunId?: string;
  runStatus: WorkbenchRunStatus;
  statusText: string;
  disconnected?: WorkbenchDisconnectedState;
  pendingPermission?: PendingPermissionProjection;
  pendingInteraction?: PendingInteractionProjection;
  activeTask?: ActiveTaskProjection;
  queue: QueueSummary;
  usage: WorkbenchUsage;
  lastSeq: number;
  clearedThroughSeq: number;
};

export type WorkbenchAction =
  | {
      type: "ui.clear";
    }
  | {
      type: "stream.error";
      message: string;
    }
  | {
      type: "stream.seq_discontinuity";
      expectedSeq: number;
      actualSeq: number;
    }
  | {
      type: "stream.replay_unavailable";
      message?: string;
      afterSeq?: number;
    }
  | {
      type: "stream.reconnected";
    };

export function createInitialWorkbenchState(startup: WorkbenchStartupMetadata): WorkbenchState {
  const state: WorkbenchState = {
    startup,
    transcriptBlocks: [],
    runStatus: "idle",
    statusText: "Idle",
    queue: {
      pending: [],
      pendingCount: 0,
      deferredCount: 0,
      followUpCount: 0,
      steerCount: 0
    },
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0
    },
    lastSeq: 0,
    clearedThroughSeq: 0
  };
  if (startup.sessionId) {
    state.activeSessionId = startup.sessionId;
  }
  return state;
}
