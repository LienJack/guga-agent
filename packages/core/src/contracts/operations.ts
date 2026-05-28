import type { Usage } from "./provider";

export type OperationalSeverity = "info" | "warning" | "error";

export type OperationalDiagnostic = {
  severity: OperationalSeverity;
  code: string;
  message: string;
  retryable?: boolean;
  details?: unknown;
};

export type ProviderHealthStatus = "unknown" | "healthy" | "degraded" | "unavailable";

export type ProviderHealth = {
  providerId: string;
  modelId?: string;
  status: ProviderHealthStatus;
  checkedAt: string;
  latencyMs?: number;
  diagnostics: OperationalDiagnostic[];
};

export type CredentialConfigSource = "env" | "static" | "profile" | "unknown";

export type CredentialConfigStatus = "configured" | "missing" | "invalid";

export type CredentialConfigView = {
  providerId: string;
  source: CredentialConfigSource;
  status: CredentialConfigStatus;
  redacted: Record<string, string>;
  diagnostics: OperationalDiagnostic[];
};

export type CapabilityTrustLevel =
  | "core"
  | "first-party"
  | "project"
  | "user"
  | "third-party"
  | "untrusted";

export type CapabilityScopeDescriptor = {
  kind: string;
  access?: string;
  value?: string;
};

export type TrustDescriptor = {
  level: CapabilityTrustLevel;
  scopes?: CapabilityScopeDescriptor[];
  reason?: string;
};

export type AuditSummary = {
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
  usage: Usage;
  failures: OperationalDiagnostic[];
};

export type MetricsSnapshot = {
  updatedAt: string;
  counters: Record<string, number>;
};
