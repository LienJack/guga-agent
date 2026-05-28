import type { CredentialConfigSource, CredentialConfigView, OperationalDiagnostic } from "@guga-agent/core";

export type CredentialConfigInput = {
  providerId: string;
  source: Exclude<CredentialConfigSource, "unknown">;
  values?: Record<string, string | undefined>;
  requiredKeys?: string[];
};

export type ResolveCredentialConfigOptions = CredentialConfigInput & {
  env?: NodeJS.ProcessEnv;
};

export function resolveCredentialConfig(options: ResolveCredentialConfigOptions): CredentialConfigView {
  const requiredKeys = options.requiredKeys ?? Object.keys(options.values ?? {});
  const values = options.source === "env"
    ? valuesFromEnv(requiredKeys, options.env ?? process.env)
    : options.values ?? {};
  const missing = requiredKeys.filter((key) => !values[key]);
  const diagnostics: OperationalDiagnostic[] = [
    ...missing.map((key) => ({
      severity: "error",
      code: "CREDENTIAL_MISSING",
      message: `Missing credential value for ${key}`
    }) satisfies OperationalDiagnostic),
    ...staticCredentialDiagnostics(options.source, values)
  ];

  return {
    providerId: options.providerId,
    source: options.source,
    status: missing.length > 0 ? "missing" : "configured",
    redacted: redactRecord(values),
    diagnostics
  };
}

function staticCredentialDiagnostics(
  source: CredentialConfigInput["source"],
  values: Record<string, string | undefined>
): OperationalDiagnostic[] {
  if (source !== "static" || Object.values(values).every((value) => !value)) {
    return [];
  }
  return [{
    severity: "warning",
    code: "CREDENTIAL_STATIC_SECRET",
    message: "Credential values are stored directly in config; prefer env or managed local credentials."
  }];
}

export function redactSecret(value: string | undefined): string {
  if (!value) {
    return "<missing>";
  }
  if (value.length <= 8) {
    return "<redacted>";
  }
  return `${value.slice(0, 3)}...${value.slice(-4)}`;
}

function valuesFromEnv(keys: string[], env: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const values: Record<string, string | undefined> = {};
  for (const key of keys) {
    values[key] = env[key];
  }
  return values;
}

function redactRecord(values: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, redactSecret(value)])
  );
}
