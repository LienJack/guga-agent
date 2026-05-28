import type { HostEvent } from "./events";

export type JsonObjectResource = { [key: string]: unknown };

export type HostProtocolInfoResource = {
  version: "1";
  features: HostProtocolFeature[];
};

export type HostProtocolFeature =
  | "runs"
  | "run-input-queue"
  | "run-abort"
  | "follow-up-consumption"
  | "steer-deferred"
  | "permissions"
  | "interactions"
  | "sessions"
  | "operations"
  | "sse-replay";

export const HOST_PROTOCOL_VERSION = "1";

export const HOST_PROTOCOL_FEATURES: HostProtocolFeature[] = [
  "runs",
  "run-input-queue",
  "run-abort",
  "follow-up-consumption",
  "steer-deferred",
  "permissions",
  "interactions",
  "sessions",
  "operations",
  "sse-replay"
];

export type SessionResource = {
  id: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  activeBranchId?: string;
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
  health: ProviderHealthResource[];
  audit: AuditSummaryResource[];
  metrics: MetricsSnapshotResource;
  diagnostics: OperationalDiagnosticResource[];
};
