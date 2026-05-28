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
  const values = options.source === "env"
    ? valuesFromEnv(options.requiredKeys ?? Object.keys(options.env ?? {}), options.env ?? process.env)
    : options.values ?? {};
  const requiredKeys = options.requiredKeys ?? Object.keys(values);
  const missing = requiredKeys.filter((key) => !values[key]);
  const diagnostics: OperationalDiagnostic[] = missing.map((key) => ({
    severity: "error",
    code: "CREDENTIAL_MISSING",
    message: `Missing credential value for ${key}`
  }));

  return {
    providerId: options.providerId,
    source: options.source,
    status: missing.length > 0 ? "missing" : "configured",
    redacted: redactRecord(values),
    diagnostics
  };
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
