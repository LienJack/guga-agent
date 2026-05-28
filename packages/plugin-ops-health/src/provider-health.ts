import type { OperationalDiagnostic, ProviderHealth, ProviderHealthStatus } from "@guga-agent/core";

export type ProviderHealthTarget = {
  providerId: string;
  modelId?: string;
};

export type ProviderHealthCheckResult = {
  status: Exclude<ProviderHealthStatus, "unknown">;
  diagnostics?: OperationalDiagnostic[];
};

export type ProviderHealthCheck = (
  target: ProviderHealthTarget
) => Promise<ProviderHealthCheckResult> | ProviderHealthCheckResult;

export async function checkProviderHealth(options: {
  target: ProviderHealthTarget;
  now?: () => Date;
  check?: ProviderHealthCheck;
}): Promise<ProviderHealth> {
  const now = options.now ?? (() => new Date());
  const startedAt = Date.now();
  if (!options.check) {
    return {
      ...options.target,
      status: "unknown",
      checkedAt: now().toISOString(),
      diagnostics: [{
        severity: "info",
        code: "HEALTH_CHECK_NOT_CONFIGURED",
        message: "No provider health check is configured"
      }]
    };
  }

  try {
    const result = await options.check(options.target);
    return {
      ...options.target,
      status: result.status,
      checkedAt: now().toISOString(),
      latencyMs: Math.max(0, Date.now() - startedAt),
      diagnostics: result.diagnostics ?? []
    };
  } catch (error) {
    return {
      ...options.target,
      status: "unavailable",
      checkedAt: now().toISOString(),
      latencyMs: Math.max(0, Date.now() - startedAt),
      diagnostics: [{
        severity: "error",
        code: "HEALTH_CHECK_FAILED",
        message: error instanceof Error ? error.message : "Provider health check failed",
        retryable: true
      }]
    };
  }
}
