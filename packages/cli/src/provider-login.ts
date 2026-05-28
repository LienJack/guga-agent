import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stringify as stringifyToml } from "smol-toml";
import {
  readCliConfigWithSources,
  type CliConfig,
  type CliProviderConfig,
  type CliProviderMode
} from "./config";
import { resolveGugaHome } from "./guga-home";
import {
  createProviderCredentialStore,
  credentialRefForProvider,
  type ProviderCredentialStore,
  type RedactedProviderCredentialView
} from "./provider-credential-store";
import { resolveProviderAuth, type ProviderAuthView } from "./provider-auth";

export type ProviderLoginOptions = {
  providerId: string;
  mode?: CliProviderMode;
  apiKey?: string;
  apiKeyEnv?: string;
  staticSecret?: boolean;
  modelId?: string;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  homeDir?: string;
};

export type ProviderLoginResult = {
  providerId: string;
  configPath: string;
  credentialPath?: string;
  warnings: string[];
};

export type ProviderOAuthLoginRunner = (context: {
  providerId: "copilot" | "codex";
  store: ProviderCredentialStore;
}) => Promise<
  | { ok: true; credential: RedactedProviderCredentialView }
  | { ok: false; error: { code: string; message: string } }
>;

export type ProviderOAuthLoginOptions = Omit<ProviderLoginOptions, "apiKey" | "apiKeyEnv" | "staticSecret"> & {
  providerId: "copilot" | "codex";
  runner: ProviderOAuthLoginRunner;
};

export type ProviderOAuthLoginResult = {
  providerId: "copilot" | "codex";
  configPath: string;
  credential: RedactedProviderCredentialView;
};

export type ProviderLogoutOptions = {
  providerId: string;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  homeDir?: string;
};

export type ProviderLogoutResult = {
  providerId: string;
  credential: RedactedProviderCredentialView;
};

export type ProviderAuthStatusOptions = {
  providerId?: string;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  homeDir?: string;
};

export function loginProvider(options: ProviderLoginOptions): ProviderLoginResult {
  if (!options.apiKey && !options.apiKeyEnv) {
    throw new Error("login requires --api-key or --api-key-env; interactive secret prompts are not available in this environment");
  }

  const home = resolveGugaHome({
    ...(options.env ? { env: options.env } : {}),
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...(options.homeDir ? { homeDir: options.homeDir } : {})
  });
  const configPath = existsSync(home.config.userToml) || !existsSync(home.config.userJson)
    ? home.config.userToml
    : home.config.userJson;
  const existing = readCliConfigWithSources({
    ...(options.env ? { env: options.env } : {}),
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...(options.homeDir ? { homeDir: options.homeDir } : {})
  }).config;
  const warnings: string[] = [];
  let credentialRef: string | undefined;
  let credentialPath: string | undefined;

  if (options.apiKey && options.staticSecret) {
    warnings.push("Static provider secrets are stored directly in config; prefer --api-key-env or managed local credentials.");
  } else if (options.apiKey) {
    credentialRef = credentialRefForProvider(options.providerId);
    credentialPath = join(home.home, credentialRef);
    mkdirSync(dirname(credentialPath), { recursive: true });
    writeFileSync(credentialPath, `${JSON.stringify({ apiKey: options.apiKey }, null, 2)}\n`, { mode: 0o600 });
  }

  const provider: CliProviderConfig = {
    id: options.providerId,
    mode: options.mode ?? defaultModeForProvider(options.providerId),
    ...(options.apiKeyEnv ? { apiKeyEnv: options.apiKeyEnv } : {}),
    ...(options.apiKey && options.staticSecret ? { apiKey: options.apiKey } : {}),
    ...(credentialRef ? { credentialRef } : {}),
    ...(options.modelId ? { defaultModel: options.modelId } : {})
  };
  const nextConfig = upsertProviderConfig(existing, provider, options);
  writeConfig(configPath, nextConfig);

  return {
    providerId: options.providerId,
    configPath,
    ...(credentialPath ? { credentialPath } : {}),
    warnings
  };
}

export async function loginOAuthProvider(options: ProviderOAuthLoginOptions): Promise<ProviderOAuthLoginResult> {
  const home = resolveGugaHome({
    ...(options.env ? { env: options.env } : {}),
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...(options.homeDir ? { homeDir: options.homeDir } : {})
  });
  const store = createProviderCredentialStore({ credentialsRoot: home.credentialsRoot });
  return store.withProviderLock(options.providerId, async () => {
    const login = await options.runner({ providerId: options.providerId, store });
    if (!login.ok) {
      throw new Error(login.error.message);
    }
    const configPath = existsSync(home.config.userToml) || !existsSync(home.config.userJson)
      ? home.config.userToml
      : home.config.userJson;
    const existing = readCliConfigWithSources({
      ...(options.env ? { env: options.env } : {}),
      ...(options.cwd ? { cwd: options.cwd } : {}),
      ...(options.homeDir ? { homeDir: options.homeDir } : {})
    }).config;
    const provider: CliProviderConfig = {
      id: options.providerId,
      mode: options.mode ?? defaultModeForProvider(options.providerId),
      metadata: { authType: "oauth" },
      ...(options.modelId ? { defaultModel: options.modelId } : {})
    };
    writeConfig(configPath, upsertProviderConfig(existing, provider, options));
    return {
      providerId: options.providerId,
      configPath,
      credential: login.credential
    };
  });
}

export async function logoutProvider(options: ProviderLogoutOptions): Promise<ProviderLogoutResult> {
  const home = resolveGugaHome({
    ...(options.env ? { env: options.env } : {}),
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...(options.homeDir ? { homeDir: options.homeDir } : {})
  });
  const store = createProviderCredentialStore({ credentialsRoot: home.credentialsRoot });
  return store.withProviderLock(options.providerId, () => {
    const credential = store.deleteCredential(options.providerId);
    const legacyCredentialPath = join(home.home, credentialRefForProvider(options.providerId));
    if (existsSync(legacyCredentialPath)) {
      rmSync(legacyCredentialPath);
    }
    return {
      providerId: options.providerId,
      credential
    };
  });
}

export function listProviderAuthStatus(options: ProviderAuthStatusOptions = {}): ProviderAuthView[] {
  const home = resolveGugaHome({
    ...(options.env ? { env: options.env } : {}),
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...(options.homeDir ? { homeDir: options.homeDir } : {})
  });
  const config = readCliConfigWithSources({
    ...(options.env ? { env: options.env } : {}),
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...(options.homeDir ? { homeDir: options.homeDir } : {})
  }).config;
  const providerIds = new Set([
    ...(config.providers ?? []).map((provider) => provider.id),
    "copilot",
    "codex"
  ]);
  const selected = options.providerId ? [options.providerId] : [...providerIds];
  return selected.map((providerId) => {
    const provider = config.providers?.find((candidate) => candidate.id === providerId) ?? {
      id: providerId,
      mode: defaultModeForProvider(providerId),
      ...(providerId === "copilot" || providerId === "codex" ? { metadata: { authType: "oauth" } } : {})
    };
    return resolveProviderAuth({
      provider,
      env: options.env ?? process.env,
      credentialRoot: home.home
    }).view;
  });
}

export function loginGuidance(providerId: string): string {
  const mode = defaultModeForProvider(providerId);
  const envName = defaultApiKeyEnvForProvider(providerId);
  return [
    `login target: ${providerId}`,
    `mode: ${mode}`,
    envName
      ? `recommended: guga login ${providerId} --api-key-env ${envName}`
      : `recommended: guga login ${providerId} --api-key-env <ENV_VAR> --mode ${mode}`,
    "local credential: guga login <provider> --api-key <key>",
    "static config secrets are supported only with --static and should not be committed"
  ].join("\n");
}

function upsertProviderConfig(
  config: CliConfig,
  provider: CliProviderConfig,
  options: ProviderLoginOptions
): CliConfig {
  const providers = new Map((config.providers ?? []).map((candidate) => [candidate.id, candidate]));
  providers.set(provider.id, {
    ...providers.get(provider.id),
    ...provider
  });
  const models = [...(config.models ?? [])];
  if (options.modelId && !models.some((model) => model.providerId === provider.id && model.modelId === options.modelId)) {
    models.push({
      id: provider.id,
      providerId: provider.id,
      ...(provider.mode ? { providerMode: provider.mode } : {}),
      modelId: options.modelId
    });
  }
  return {
    ...configWithoutRuntimeDiagnostics(config),
    providers: [...providers.values()],
    ...(models.length > 0 ? { models } : {}),
    ...(options.modelId && !config.defaultModel ? { defaultModel: provider.id } : {})
  };
}

function configWithoutRuntimeDiagnostics(config: CliConfig): CliConfig {
  const { diagnostics: _diagnostics, ...rest } = config;
  return rest;
}

function writeConfig(path: string, config: CliConfig): void {
  mkdirSync(dirname(path), { recursive: true });
  if (path.endsWith(".json")) {
    const existingMode = readMode(path);
    writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, existingMode ? { mode: existingMode } : undefined);
    return;
  }
  const existingMode = readMode(path);
  writeFileSync(path, stringifyToml(config as never), existingMode ? { mode: existingMode } : undefined);
}

function readMode(path: string): number | undefined {
  if (!existsSync(path)) {
    return undefined;
  }
  return statSync(path).mode & 0o777;
}

function defaultModeForProvider(providerId: string): CliProviderMode {
  if (providerId === "copilot") {
    return "openai-compatible";
  }
  if (providerId === "codex") {
    return "openai";
  }
  if (providerId === "anthropic") {
    return "anthropic";
  }
  if (providerId === "gateway" || providerId === "ai-gateway") {
    return "gateway";
  }
  if (providerId.includes("compatible") || providerId === "ollama" || providerId === "local") {
    return "openai-compatible";
  }
  return "openai";
}

function defaultApiKeyEnvForProvider(providerId: string): string | undefined {
  if (providerId === "openai") {
    return "OPENAI_API_KEY";
  }
  if (providerId === "anthropic") {
    return "ANTHROPIC_API_KEY";
  }
  if (providerId === "gateway" || providerId === "ai-gateway") {
    return "AI_GATEWAY_API_KEY";
  }
  return undefined;
}
