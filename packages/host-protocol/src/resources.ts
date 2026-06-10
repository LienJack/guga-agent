import type { HostEvent } from "./events";

export type JsonObjectResource = { [key: string]: unknown };

export type HostProtocolInfoResource = {
  version: "1";
  features: HostProtocolFeature[];
};

export type HostProtocolFeature =
  | "runs"
  | "code-tasks"
  | "run-input-queue"
  | "run-abort"
  | "follow-up-consumption"
  | "steer-deferred"
  | "tool-progress"
  | "retry-events"
  | "permissions"
  | "interactions"
  | "sessions"
  | "operations"
  | "platform-surfaces"
  | "sse-replay";

export const HOST_PROTOCOL_VERSION = "1";

export const HOST_PROTOCOL_FEATURES: HostProtocolFeature[] = [
  "runs",
  "code-tasks",
  "run-input-queue",
  "run-abort",
  "follow-up-consumption",
  "steer-deferred",
  "tool-progress",
  "retry-events",
  "permissions",
  "interactions",
  "sessions",
  "operations",
  "platform-surfaces",
  "sse-replay"
];

export type SessionResource = {
  id: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  activeBranchId?: string;
  lastRunId?: string;
  lastRunStatus?: RunStatus;
  rootBranchId?: string;
  activeLeafEventId?: string | null;
  metadata?: JsonObjectResource;
  branches?: SessionBranchResource[];
};

export type SessionBranchResource = {
  id: string;
  sessionId: string;
  parentBranchId?: string;
  createdFromRunId?: string;
  summary?: string;
  lastRunId?: string;
  lastRunStatus?: RunStatus;
  createdAt: string;
  updatedAt: string;
  metadata?: JsonObjectResource;
};

export type SessionTreeResource = {
  sessionId: string;
  activeBranchId: string;
  branches: SessionBranchResource[];
};

export type RunStatus =
  | "queued"
  | "running"
  | "waiting-for-permission"
  | "waiting-for-interaction"
  | "completed"
  | "failed"
  | "cancelled";

export type CodeTaskStateResource =
  | "created"
  | "scouting"
  | "planning"
  | "executing"
  | "verifying"
  | "repairing"
  | "completed"
  | "blocked"
  | "failed"
  | "cancelled";

export type CodeTaskPlanFileResource = {
  path: string;
  action: "inspect" | "create" | "modify" | "delete" | "test";
  reason?: string;
};

export type CodeTaskPlannedCheckResource = {
  command: string;
  cwd?: string;
  required: boolean;
  reason: string;
};

export type CodeTaskPlanItemStatusResource =
  | "pending"
  | "in-progress"
  | "evidence-submitted"
  | "verified"
  | "done"
  | "blocked";

export type CodeTaskPlanEvidenceKindResource =
  | "event"
  | "tool_result"
  | "artifact"
  | "diff"
  | "verification"
  | "user_confirmation";

export type CodeTaskPlanEvidenceRefResource = {
  kind: CodeTaskPlanEvidenceKindResource;
  id: string;
  summary: string;
  sourceEventId?: string;
  toolCallId?: string;
  artifactId?: string;
  verificationAttemptId?: string;
  changedFiles?: string[];
};

export type CodeTaskPlanLedgerItemResource = {
  id: string;
  title: string;
  status: CodeTaskPlanItemStatusResource;
  evidence: CodeTaskPlanEvidenceRefResource[];
  changedFiles: string[];
  verificationAttemptIds: string[];
  risks: string[];
  blocker?: CodeTaskTerminalReasonResource;
  settledAt?: string;
};

export type CodeTaskPlanResource = {
  summary: string;
  files: CodeTaskPlanFileResource[];
  checks: CodeTaskPlannedCheckResource[];
  assumptions: string[];
  risks: string[];
  userVisibleSummary?: string;
  ledgerItems?: CodeTaskPlanLedgerItemResource[];
};

export type VerificationAttemptStatusResource =
  | "planned"
  | "running"
  | "passed"
  | "failed"
  | "cancelled"
  | "skipped";

export type VerificationAttemptResource = {
  id: string;
  taskId: string;
  sessionId: string;
  runId?: string;
  command: string;
  cwd: string;
  required: boolean;
  status: VerificationAttemptStatusResource;
  reason: string;
  startedAt?: string;
  completedAt?: string;
  exitCode?: number;
  outputSummary?: string;
  artifactRef?: string;
};

export type CodeTaskTerminalReasonResource = {
  code: string;
  message: string;
  recoverable?: boolean;
  details?: unknown;
};

export type CodeTaskCompletionEvidenceResource = {
  completedAt: string;
  passingVerificationAttemptIds: string[];
  summary?: string;
};

export type RecoveryPolicyOutcomeCategoryResource =
  | "auto-retry"
  | "compact-and-retry"
  | "wait-for-user"
  | "repair"
  | "fork"
  | "truncate"
  | "blocked"
  | "read-only-diagnostics";

export type RecoveryPolicyOutcomeResource = {
  category: RecoveryPolicyOutcomeCategoryResource;
  message: string;
  recoverable: boolean;
  source: {
    kind: "interrupted_operation" | "store_diagnostic" | "replay_diagnostic";
    eventId?: string;
    diagnosticKind?: string;
    diagnosticCode?: string;
  };
  allowedActions: Array<"resume" | "fork" | "mark_abandoned" | "repair" | "truncate">;
  metadata?: JsonObjectResource;
};

export type CodeTaskResource = {
  id: string;
  sessionId: string;
  rootRunId: string;
  activeRunId?: string;
  cwd: string;
  objective: string;
  state: CodeTaskStateResource;
  phase: CodeTaskStateResource;
  attempt: number;
  maxRepairAttempts: number;
  createdAt: string;
  updatedAt: string;
  plan?: CodeTaskPlanResource;
  ledgerSummary?: {
    total: number;
    pending: number;
    inProgress: number;
    evidenceSubmitted: number;
    verified: number;
    done: number;
    blocked: number;
    currentItemId?: string;
    blockedItemId?: string;
  };
  verificationAttempts: VerificationAttemptResource[];
  completionEvidence?: CodeTaskCompletionEvidenceResource;
  terminalReason?: CodeTaskTerminalReasonResource;
  recoveryOutcome?: RecoveryPolicyOutcomeResource;
  durability?: {
    status: "durable" | "memory_only" | "unavailable";
    reason?: string;
    latestEventId?: string;
  };
};

export type RunResource = {
  id: string;
  sessionId: string;
  status: RunStatus;
  input: string;
  createdAt: string;
  updatedAt: string;
  lastSeq: number;
  finalAnswer?: string;
  error?: HostErrorPayload;
  queuedInputs?: QueuedRunInputResource[];
  events?: HostEvent[];
};

export type RunInputMode = "steer" | "follow_up";

export type QueuedRunInputStatus = "pending" | "deferred" | "consumed" | "cancelled";

export type QueuedRunInputResource = {
  id: string;
  mode: RunInputMode;
  status: QueuedRunInputStatus;
  text: string;
  textPreview: string;
  createdAt: string;
  resolvedAt?: string;
};

export type QueuedRunInputSummaryResource = Omit<QueuedRunInputResource, "text">;

export type InteractionStatus = "pending" | "resolved" | "cancelled";

export type InteractionRequest =
  | {
      kind: "select";
      title?: string;
      options: Array<{ id: string; label: string; description?: string }>;
      multi?: boolean;
    }
  | {
      kind: "confirm";
      title?: string;
      message: string;
      defaultValue?: boolean;
    }
  | {
      kind: "input";
      title?: string;
      placeholder?: string;
      defaultValue?: string;
      secret?: boolean;
    }
  | {
      kind: "editor";
      title?: string;
      language?: string;
      initialText?: string;
    }
  | {
      kind: "notify";
      level: "info" | "warning" | "error";
      message: string;
    }
  | {
      kind: "setStatus";
      text: string;
    }
  | {
      kind: "setWidget";
      widgetId: string;
      payload: unknown;
    }
  | {
      kind: "setTitle";
      title: string;
    }
  | {
      kind: "set_editor_text";
      text: string;
    };

export type InteractionResource = {
  id: string;
  sessionId: string;
  runId?: string;
  status: InteractionStatus;
  request: InteractionRequest;
  response?: unknown;
  createdAt: string;
  resolvedAt?: string;
};

export type HostErrorPayload = {
  code: string;
  message: string;
  details?: unknown;
};

export type PermissionStatus = "pending" | "allowed" | "denied" | "cancelled" | "expired";

export type PermissionRequestResource = {
  id: string;
  runId: string;
  sessionId: string;
  callId: string;
  toolName: string;
  status: PermissionStatus;
  input?: unknown;
  reason?: string;
  createdAt: string;
  resolvedAt?: string;
};

export type PermissionResolution = {
  decision: "allow" | "deny";
  remember?: "once" | "session" | "always";
  reason?: string;
  updatedInput?: unknown;
};

export type ArtifactResource = {
  id: string;
  runId: string;
  sessionId: string;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt: string;
  href?: string;
};

export type CapabilityResource = {
  type: string;
  name: string;
  source: string;
  status: string;
  namespace?: string;
  ownerPluginId?: string;
  reason?: string;
  trust?: TrustDescriptorResource;
};

export type PlatformSurfaceKindResource =
  | "model"
  | "profile"
  | "session"
  | "tool"
  | "mcp"
  | "skill"
  | "permission"
  | "memory"
  | "agent"
  | "status"
  | "compact"
  | "abort"
  | "resume"
  | "fork"
  | "task";

export type PlatformSurfaceStatusResource =
  | "available"
  | "unavailable"
  | "restricted"
  | "degraded";

export type PlatformSurfaceActionResource =
  | "inspect"
  | "select"
  | "execute"
  | "resume"
  | "fork"
  | "abort"
  | "compact";

export type PlatformSurfaceResource = {
  kind: PlatformSurfaceKindResource;
  name: string;
  status: PlatformSurfaceStatusResource;
  source: "host" | "runtime" | "profile" | "plugin" | "mcp" | "adapter";
  reason?: string;
  capabilityNames?: string[];
  actions: PlatformSurfaceActionResource[];
  trust?: TrustDescriptorResource;
};

export type MemoryInjectionStateResource =
  | "unavailable"
  | "available"
  | "retrieved"
  | "injected"
  | "blocked";

export type MemoryStatusResource = {
  state: MemoryInjectionStateResource;
  source: "host" | "plugin" | "policy";
  reason?: string;
  capabilityNames: string[];
  policy?: {
    autoInject: boolean;
    autoWrite: boolean;
    reason?: string;
  };
};

export type AgentDelegationStatusResource = {
  state: "unavailable" | "available" | "running" | "blocked";
  source: "host" | "plugin";
  reason?: string;
  capabilityNames: string[];
  coordinatorReady: boolean;
};

export type CompactStatusResource = {
  state: "unavailable" | "available" | "requested" | "running" | "completed" | "failed" | "degraded";
  source: "host" | "runtime";
  reason?: string;
  allowedActions: Array<"compact" | "retry" | "resume" | "reload">;
};

export type PlatformStatusResource = {
  surfaces: PlatformSurfaceResource[];
  memory: MemoryStatusResource;
  agents: AgentDelegationStatusResource;
  compact: CompactStatusResource;
};

export type CapabilityScopeResource = {
  kind: string;
  access?: string;
  value?: string;
};

export type TrustDescriptorResource = {
  level: string;
  scopes?: CapabilityScopeResource[];
  reason?: string;
};

export type OperationalDiagnosticResource = {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  retryable?: boolean;
  details?: unknown;
};

export type ProviderHealthResource = {
  providerId: string;
  modelId?: string;
  status: "unknown" | "healthy" | "degraded" | "unavailable";
  checkedAt: string;
  latencyMs?: number;
  diagnostics: OperationalDiagnosticResource[];
};

export type UsageCostResource =
  | {
      status: "unknown";
      reason?: string;
    }
  | {
      status: "known";
      amount: number;
      currency: string;
    };

export type UsageResource = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  cost?: UsageCostResource;
};

export type AuditSummaryResource = {
  runId: string;
  startedAt?: string;
  completedAt?: string;
  toolCalls: {
    started: number;
    completed: number;
    failed: number;
  };
  permissions: {
    requested: number;
    allowed: number;
    denied: number;
  };
  usage: UsageResource;
  failures: OperationalDiagnosticResource[];
};

export type MetricsSnapshotResource = {
  updatedAt: string;
  counters: Record<string, number>;
};

export type OperationalStatusResource = {
  updatedAt: string;
  capabilities: CapabilityResource[];
  platform: PlatformStatusResource;
  health: ProviderHealthResource[];
  audit: AuditSummaryResource[];
  metrics: MetricsSnapshotResource;
  diagnostics: OperationalDiagnosticResource[];
};
