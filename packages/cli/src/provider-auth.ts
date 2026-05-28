import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type { CliProviderConfig } from "./config";
import { createProviderCredentialStore } from "./provider-credential-store";

export type ProviderAuthStatus =
  | "configured"
  | "missing"
  | "invalid"
  | "unknown"
  | "login-pending"
  | "expired"
  | "refresh-failed"
  | "logged-out";

export type ProviderAuthSource = "env" | "static" | "local" | "oauth" | "none";

export type ProviderAuthDiagnostic = {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
};

export type ProviderAuthView = {
  providerId: string;
  status: ProviderAuthStatus;
  source: ProviderAuthSource;
  redacted: Record<string, string>;
  diagnostics: ProviderAuthDiagnostic[];
};

export type ProviderCredentialMaterial = {
  providerId: string;
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
};

export type ResolvedProviderAuth = {
  view: ProviderAuthView;
  material: ProviderCredentialMaterial;
};

export type ResolveProviderAuthOptions = {
  provider: CliProviderConfig;
  env?: NodeJS.ProcessEnv;
  credentialRoot?: string;
};

export function resolveProviderAuth(options: ResolveProviderAuthOptions): ResolvedProviderAuth {
  const env = options.env ?? process.env;
  const diagnostics: ProviderAuthDiagnostic[] = [];
  const base = {
    providerId: options.provider.id,
    diagnostics
  };

  if (options.provider.apiKeyEnv) {
    const apiKey = env[options.provider.apiKeyEnv];
    if (!apiKey) {
      diagnostics.push({
        severity: "error",
        code: "PROVIDER_AUTH_MISSING_ENV",
        message: `Missing provider API key env var ${options.provider.apiKeyEnv}`
      });
      return {
        view: {
          ...base,
          status: "missing",
          source: "env",
          redacted: { [options.provider.apiKeyEnv]: "<missing>" }
        },
        material: { providerId: options.provider.id }
      };
    }
    return {
      view: {
        ...base,
        status: "configured",
        source: "env",
        redacted: { [options.provider.apiKeyEnv]: redactSecret(apiKey) }
      },
      material: { providerId: options.provider.id, apiKey }
    };
  }

  if (options.provider.apiKey) {
    diagnostics.push({
      severity: "warning",
      code: "PROVIDER_AUTH_STATIC_SECRET",
      message: "Provider API key is stored directly in config; prefer env or local credential references."
    });
    return {
      view: {
        ...base,
        status: "configured",
        source: "static",
        redacted: { apiKey: redactSecret(options.provider.apiKey) }
      },
      material: { providerId: options.provider.id, apiKey: options.provider.apiKey }
    };
  }

  if (options.provider.credentialRef) {
    return resolveLocalCredential({
      providerId: options.provider.id,
      credentialRef: options.provider.credentialRef,
      ...(options.credentialRoot ? { credentialRoot: options.credentialRoot } : {}),
      diagnostics
    });
  }

  if (isOAuthProvider(options.provider)) {
    return resolveOAuthCredential({
      providerId: options.provider.id,
      ...(options.credentialRoot ? { credentialRoot: options.credentialRoot } : {}),
      diagnostics
    });
  }

  diagnostics.push({
    severity: "info",
    code: "PROVIDER_AUTH_UNKNOWN",
    message: "No provider auth source configured; provider SDK or gateway defaults may still apply."
  });
  return {
    view: {
      ...base,
      status: "unknown",
      source: "none",
      redacted: {}
    },
    material: { providerId: options.provider.id }
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

function resolveLocalCredential(options: {
  providerId: string;
  credentialRef: string;
  credentialRoot?: string;
  diagnostics: ProviderAuthDiagnostic[];
}): ResolvedProviderAuth {
  const path = resolveCredentialPath(options.credentialRef, options.credentialRoot);
  const base = {
    providerId: options.providerId,
    diagnostics: options.diagnostics
  };

  if (!existsSync(path)) {
    options.diagnostics.push({
      severity: "error",
      code: "PROVIDER_AUTH_MISSING_LOCAL",
      message: `Missing provider credential reference ${options.credentialRef}`
    });
    return {
      view: {
        ...base,
        status: "missing",
        source: "local",
        redacted: { credentialRef: options.credentialRef }
      },
      material: { providerId: options.providerId }
    };
  }

  try {
    const apiKey = readCredentialApiKey(path);
    if (!apiKey) {
      options.diagnostics.push({
        severity: "error",
        code: "PROVIDER_AUTH_INVALID_LOCAL",
        message: `Provider credential reference ${options.credentialRef} does not contain an apiKey`
      });
      return {
        view: {
          ...base,
          status: "invalid",
          source: "local",
          redacted: { credentialRef: options.credentialRef }
        },
        material: { providerId: options.providerId }
      };
    }
    return {
      view: {
        ...base,
        status: "configured",
        source: "local",
        redacted: {
          credentialRef: options.credentialRef,
          apiKey: redactSecret(apiKey)
        }
      },
      material: { providerId: options.providerId, apiKey }
    };
  } catch (error) {
    options.diagnostics.push({
      severity: "error",
      code: "PROVIDER_AUTH_INVALID_LOCAL",
      message: error instanceof Error ? error.message : "Unable to read provider credential"
    });
    return {
      view: {
        ...base,
        status: "invalid",
        source: "local",
        redacted: { credentialRef: options.credentialRef }
      },
      material: { providerId: options.providerId }
    };
  }
}

function resolveCredentialPath(credentialRef: string, credentialRoot: string | undefined): string {
  if (isAbsolute(credentialRef)) {
    return credentialRef;
  }
  return credentialRoot ? join(credentialRoot, credentialRef) : resolve(credentialRef);
}

function resolveOAuthCredential(options: {
  providerId: string;
  credentialRoot?: string;
  diagnostics: ProviderAuthDiagnostic[];
}): ResolvedProviderAuth {
  const base = {
    providerId: options.providerId,
    diagnostics: options.diagnostics
  };
  if (!options.credentialRoot) {
    options.diagnostics.push({
      severity: "error",
      code: "PROVIDER_AUTH_MISSING_OAUTH",
      message: `Missing OAuth credential for provider ${options.providerId}; run guga login ${options.providerId}.`
    });
    return {
      view: {
        ...base,
        status: "missing",
        source: "oauth",
        redacted: {}
      },
      material: { providerId: options.providerId }
    };
  }

  const store = createProviderCredentialStore({ credentialsRoot: join(options.credentialRoot, "credentials") });
  const stored = store.readCredential(options.providerId);
  if (stored.status === "missing") {
    options.diagnostics.push({
      severity: "error",
      code: "PROVIDER_AUTH_MISSING_OAUTH",
      message: `Missing OAuth credential for provider ${options.providerId}; run guga login ${options.providerId}.`
    });
    return {
      view: {
        ...base,
        status: "missing",
        source: "oauth",
        redacted: {}
      },
      material: { providerId: options.providerId }
    };
  }
  if (stored.status === "invalid") {
    options.diagnostics.push({
      severity: "error",
      code: "PROVIDER_AUTH_INVALID_OAUTH",
      message: `OAuth credential for provider ${options.providerId} is invalid; run guga login ${options.providerId} again.`
    });
  }
  if (stored.status === "expired" || stored.status === "refresh-failed") {
    options.diagnostics.push({
      severity: "error",
      code: stored.status === "expired" ? "PROVIDER_AUTH_EXPIRED_OAUTH" : "PROVIDER_AUTH_REFRESH_FAILED",
      message: `OAuth credential for provider ${options.providerId} needs refresh or re-login.`
    });
  }
  const credential = stored.credential;
  return {
    view: {
      ...base,
      status: stored.status,
      source: "oauth",
      redacted: stored.view.redacted
    },
    material: {
      providerId: options.providerId,
      ...(stored.status === "configured" && credential?.accessToken ? { accessToken: credential.accessToken } : {}),
      ...(stored.status === "configured" && credential?.refreshToken ? { refreshToken: credential.refreshToken } : {}),
      ...(stored.status === "configured" && credential?.tokenType ? { tokenType: credential.tokenType } : {})
    }
  };
}

function isOAuthProvider(provider: CliProviderConfig): boolean {
  return provider.id === "copilot"
    || provider.id === "codex"
    || provider.metadata?.authType === "oauth";
}

function readCredentialApiKey(path: string): string | undefined {
  const text = readFileSync(path, "utf8").trim();
  if (text.length === 0) {
    return undefined;
  }
  if (!path.endsWith(".json")) {
    return text;
  }
  const parsed = JSON.parse(text) as { apiKey?: unknown };
  return typeof parsed.apiKey === "string" ? parsed.apiKey : undefined;
}
