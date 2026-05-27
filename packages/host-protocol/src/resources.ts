import type { HostEvent } from "./events";

export type SessionResource = {
  id: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  activeBranchId?: string;
};

export type RunStatus = "queued" | "running" | "waiting-for-permission" | "completed" | "failed" | "cancelled";

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
  events?: HostEvent[];
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
