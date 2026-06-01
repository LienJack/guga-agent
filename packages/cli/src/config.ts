import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, resolve } from "node:path";
import { parse as parseToml } from "smol-toml";
import { GugaHomeError, resolveGugaHome } from "./guga-home";

export type CliProviderMode = "gateway" | "openai-compatible" | "openai" | "anthropic";
export type CliWebSearchProvider = "mock" | "brave";
export type CliPermissionAction = "allow" | "ask" | "deny";

export type CliProviderConfig = {
  id: string;
  label?: string;
  mode?: CliProviderMode;
  baseURL?: string;
  apiKey?: string;
  apiKeyEnv?: string;
  credentialRef?: string;
  defaultModel?: string;
  metadata?: Record<string, unknown>;
};

export type CliModelConfig = {
  id: string;
  label?: string;
  providerId?: string;
  providerMode?: CliProviderMode;
  modelId: string;
  apiKey?: string;
  apiKeyEnv?: string;
  baseURL?: string;
  purpose?: string;
  capabilities?: {
    toolCalling?: boolean;
    streaming?: boolean;
    reasoning?: boolean;
    usage?: "required" | "optional" | "unavailable";
  };
};

export type CliConfigDiagnostic = {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  providerId?: string;
  modelId?: string;
};

export type CliWebSearchConfig = {
  enabled?: boolean;
  provider?: CliWebSearchProvider;
  apiKey?: string;
  apiKeyEnv?: string;
  permission?: {
    defaultAction?: CliPermissionAction;
    trustedSessionAction?: CliPermissionAction;
  };
  resultBudgetMaxContentChars?: number;
};

export type CliConfig = {
  providerId?: string;
  modelId?: string;
  providerMode?: CliProviderMode;
  apiKey?: string;
  apiKeyEnv?: string;
  baseURL?: string;
  defaultModel?: string;
  defaultProfile?: string;
  providers?: CliProviderConfig[];
  models?: CliModelConfig[];
  fallbackModels?: string[];
  auxiliaryModels?: Record<string, string[]>;
  webSearch?: CliWebSearchConfig;
  diagnostics?: CliConfigDiagnostic[];
};

export type CliConfigSourceKind = "env" | "guga_config" | "project" | "user" | "default";

export type CliConfigSourceMap = Partial<Record<keyof CliConfig, CliConfigSourceKind>>;

export type CliConfigFileFormat = "toml" | "json";

export type CliConfigSourceEntry = {
  source: Exclude<CliConfigSourceKind, "env" | "default">;
  path: string;
  format: CliConfigFileFormat;
};

export type CliConfigWithSources = {
  config: CliConfig;
  sources: CliConfigSourceMap;
  sourceStack?: CliConfigSourceEntry[];
  filePath?: string;
  fileSource?: Exclude<CliConfigSourceKind, "env" | "default">;
};

export type ReadCliConfigOptions = {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  homeDir?: string;
};

export type InitCliConfigOptions = ReadCliConfigOptions & {
  scope?: "user" | "project";
  force?: boolean;
  providerId?: string;
  providerMode?: CliProviderMode;
  modelId?: string;
  baseURL?: string;
  apiKeyEnv?: string;
};

export type InitCliConfigResult = {
  path: string;
  created: boolean;
  config: CliConfig;
};

export class CliConfigError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`Invalid Guga config at ${path}: ${message}`);
    this.name = "CliConfigError";
    this.path = path;
  }
}

export class CliConfigPathError extends Error {
  readonly source: "env" | "default";
  readonly value: string;

  constructor(error: GugaHomeError) {
    super(error.message);
    this.name = "CliConfigPathError";
    this.source = error.source;
    this.value = error.value;
  }
}

export function readCliConfig(env: NodeJS.ProcessEnv = process.env): CliConfig {
  return readCliConfigWithSources({ env }).config;
}

export function readCliConfigWithSources(options: ReadCliConfigOptions = {}): CliConfigWithSources {
  const env = options.env ?? process.env;
  const fileConfig = readCliConfigFile({
    env,
    cwd: options.cwd ?? process.cwd(),
    homeDir: options.homeDir ?? homedir()
  });
  const apiKey = env.GUGA_API_KEY ?? env.OPENAI_API_KEY ?? env.ANTHROPIC_API_KEY;
  const envWebSearch = webSearchFromEnv(env);
  const config: CliConfig = {
    ...fileConfig.config,
    ...(env.GUGA_PROVIDER ? { providerId: env.GUGA_PROVIDER } : {}),
    ...(env.GUGA_MODEL ? { modelId: env.GUGA_MODEL, defaultModel: env.GUGA_MODEL } : {}),
    ...(isProviderMode(env.GUGA_PROVIDER_MODE) ? { providerMode: env.GUGA_PROVIDER_MODE } : {}),
    ...(apiKey ? { apiKey } : {}),
    ...(env.GUGA_BASE_URL ? { baseURL: env.GUGA_BASE_URL } : {}),
    ...(envWebSearch ? { webSearch: mergeWebSearchConfig(fileConfig.config.webSearch, envWebSearch) } : {})
  };
  const sources: CliConfigSourceMap = { ...fileConfig.sources };
  for (const key of ["providerId", "modelId", "defaultModel", "providerMode", "apiKey", "baseURL"] as const) {
    if (config[key] !== fileConfig.config[key] && config[key] !== undefined) {
      sources[key] = "env";
    }
  }
  if (envWebSearch) {
    sources.webSearch = "env";
  }
  return {
    config,
    sources,
    ...(fileConfig.sourceStack ? { sourceStack: fileConfig.sourceStack } : {}),
    ...(fileConfig.filePath ? { filePath: fileConfig.filePath } : {}),
    ...(fileConfig.fileSource ? { fileSource: fileConfig.fileSource } : {})
  };
}

export type SelectedCliModel = {
  id: string;
  label?: string;
  providerId?: string;
  providerMode?: CliProviderMode;
  modelId?: string;
  apiKey?: string;
  accessToken?: string;
  tokenType?: string;
  sessionKind?: "bearer" | "codex-app-server";
  authMode?: "chatgpt" | "apiKey";
  planType?: string;
  baseURL?: string;
};

export function selectCliModel(
  config: CliConfig,
  selector: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): SelectedCliModel | undefined {
  const requested = selector ?? config.defaultModel ?? config.modelId;
  if (config.models?.length) {
    const model = requested
      ? config.models.find((candidate) => candidate.id === requested || candidate.modelId === requested)
      : config.models[0];
    if (!model) {
      return undefined;
    }
    const apiKey = resolveApiKey(model, config, env);
    return {
      id: model.id,
      ...(model.label ? { label: model.label } : {}),
      ...(model.providerId ?? config.providerId ? { providerId: model.providerId ?? config.providerId } : {}),
      ...(model.providerMode ?? config.providerMode ? { providerMode: model.providerMode ?? config.providerMode } : {}),
      modelId: model.modelId,
      ...(apiKey ? { apiKey } : {}),
      ...(model.baseURL ?? config.baseURL ? { baseURL: model.baseURL ?? config.baseURL } : {})
    };
  }
  const modelId = requested ?? config.modelId;
  if (!modelId) {
    return undefined;
  }
  const apiKey = config.apiKeyEnv ? env[config.apiKeyEnv] : config.apiKey;
  return {
    id: modelId,
    ...(config.providerId ? { providerId: config.providerId } : {}),
    ...(config.providerMode ? { providerMode: config.providerMode } : {}),
    modelId,
    ...(apiKey ? { apiKey } : {}),
    ...(config.baseURL ? { baseURL: config.baseURL } : {})
  };
}

export function listCliModels(config: CliConfig): SelectedCliModel[] {
  if (config.models?.length) {
    return config.models.map((model) => ({
      id: model.id,
      ...(model.label ? { label: model.label } : {}),
      ...(model.providerId ?? config.providerId ? { providerId: model.providerId ?? config.providerId } : {}),
      ...(model.providerMode ?? config.providerMode ? { providerMode: model.providerMode ?? config.providerMode } : {}),
      modelId: model.modelId,
      ...(model.baseURL ?? config.baseURL ? { baseURL: model.baseURL ?? config.baseURL } : {})
    }));
  }
  if (!config.modelId) {
    return [];
  }
  return [{
    id: config.modelId,
    ...(config.providerId ? { providerId: config.providerId } : {}),
    ...(config.providerMode ? { providerMode: config.providerMode } : {}),
    modelId: config.modelId,
    ...(config.baseURL ? { baseURL: config.baseURL } : {})
  }];
}

export function initCliConfig(options: InitCliConfigOptions = {}): InitCliConfigResult {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const homeDir = options.homeDir ?? homedir();
  let home;
  try {
    home = resolveGugaHome({ env, cwd, homeDir });
  } catch (error) {
    if (error instanceof GugaHomeError) {
      throw new CliConfigPathError(error);
    }
    throw error;
  }

  const providerMode = options.providerMode ?? providerModeFromEnv(env) ?? "openai";
  const modelId = options.modelId ?? env.GUGA_MODEL ?? defaultModelForProviderMode(providerMode);
  const apiKeyEnv = options.apiKeyEnv ?? apiKeyEnvForProviderMode(providerMode);
  const baseURL = options.baseURL ?? env.GUGA_BASE_URL;
  const config: CliConfig = {
    providerId: options.providerId ?? env.GUGA_PROVIDER ?? "ai-sdk",
    providerMode,
    defaultModel: "default",
    ...(apiKeyEnv ? { apiKeyEnv } : {}),
    ...(baseURL ? { baseURL } : {}),
    models: [{
      id: "default",
      modelId
    }]
  };
  const target = options.scope === "project"
    ? { toml: home.config.projectToml, json: home.config.projectJson }
    : { toml: home.config.userToml, json: home.config.userJson };
  const existing = firstExistingConfig([
    { path: target.toml, format: "toml" },
    { path: target.json, format: "json" }
  ], options.scope ?? "user");
  if (existing && options.force !== true) {
    return { path: existing.path, created: false, config: parseConfigFile(existing.path, existing.format) };
  }
  mkdirSync(dirname(target.toml), { recursive: true });
  writeFileSync(target.toml, formatCliConfigToml(config));
  return { path: target.toml, created: true, config };
}

function readCliConfigFile(options: {
  env: NodeJS.ProcessEnv;
  cwd: string;
  homeDir: string;
}): CliConfigWithSources {
  let home;
  try {
    home = resolveGugaHome(options);
  } catch (error) {
    if (error instanceof GugaHomeError) {
      throw new CliConfigPathError(error);
    }
    throw error;
  }
  const layers = [
    firstExistingConfig([
      { path: home.config.userToml, format: "toml" },
      { path: home.config.userJson, format: "json" }
    ], "user"),
    firstExistingConfig([
      { path: home.config.projectToml, format: "toml" },
      { path: home.config.projectJson, format: "json" }
    ], "project"),
    explicitConfig(options.env.GUGA_CONFIG, options.cwd)
  ].filter((layer): layer is ConfigLayer => Boolean(layer));

  let merged: CliConfig = {};
  let sources: CliConfigSourceMap = {};
  const sourceStack: CliConfigSourceEntry[] = [];
  for (const layer of layers) {
    const parsed = parseConfigFile(layer.path, layer.format);
    const config = normalizeCliConfig(parsed);
    merged = mergeCliConfig(merged, config);
    sources = { ...sources, ...sourcesForConfig(config, layer.source) };
    sourceStack.push({ source: layer.source, path: layer.path, format: layer.format });
  }
  const last = sourceStack.at(-1);
  return {
    config: merged,
    sources,
    ...(sourceStack.length > 0 ? { sourceStack } : {}),
    ...(last ? { filePath: last.path, fileSource: last.source } : {})
  };
}

type ConfigLayer = {
  source: Exclude<CliConfigSourceKind, "env" | "default">;
  path: string;
  format: CliConfigFileFormat;
};

function firstExistingConfig(
  candidates: Array<{ path: string; format: CliConfigFileFormat }>,
  source: Exclude<CliConfigSourceKind, "env" | "default">
): ConfigLayer | undefined {
  const existing = candidates.find((candidate) => existsSync(candidate.path));
  return existing ? { source, ...existing } : undefined;
}

function explicitConfig(path: string | undefined, cwd: string): ConfigLayer | undefined {
  if (!path) {
    return undefined;
  }
  const resolved = resolve(cwd, path);
  if (!existsSync(resolved)) {
    throw new CliConfigError(resolved, "file does not exist");
  }
  return {
    source: "guga_config",
    path: resolved,
    format: formatForPath(resolved)
  };
}

function parseConfigFile(path: string, format: CliConfigFileFormat): CliConfig {
  try {
    const text = readFileSync(path, "utf8");
    return (format === "toml" ? parseToml(text) : JSON.parse(text)) as CliConfig;
  } catch (error) {
    throw new CliConfigError(path, error instanceof Error ? error.message : `Unable to parse config ${format.toUpperCase()}`);
  }
}

function formatForPath(path: string): CliConfigFileFormat {
  return extname(path).toLowerCase() === ".toml" ? "toml" : "json";
}

function normalizeCliConfig(config: CliConfig): CliConfig {
  const { providerMode, providers, models, webSearch, diagnostics, ...rest } = config;
  const normalizedDiagnostics = [...(diagnostics ?? [])];
  const normalizedProviderMode = normalizeProviderMode(providerMode, (value) => {
    normalizedDiagnostics.push({
      severity: "error",
      code: "INVALID_PROVIDER_MODE",
      message: `Unknown provider mode: ${value}`
    });
  });
  return {
    ...rest,
    ...(normalizedProviderMode ? { providerMode: normalizedProviderMode } : {}),
    ...(providers ? { providers: normalizeProviders(providers, normalizedDiagnostics) } : {}),
    ...(webSearch ? { webSearch: normalizeWebSearch(webSearch, normalizedDiagnostics) } : {}),
    ...(models ? {
      models: models
        .filter((model) => typeof model.id === "string" && typeof model.modelId === "string")
        .map((model) => {
          const { providerMode: modelProviderMode, ...modelRest } = model;
          const normalizedModelProviderMode = normalizeProviderMode(modelProviderMode, (value) => {
            normalizedDiagnostics.push({
              severity: "error",
              code: "INVALID_PROVIDER_MODE",
              message: `Unknown provider mode for model ${model.id}: ${value}`,
              modelId: model.id
            });
          });
          return {
            ...modelRest,
            ...(normalizedModelProviderMode ? { providerMode: normalizedModelProviderMode } : {})
          };
        })
    } : {}),
    ...(normalizedDiagnostics.length > 0 ? { diagnostics: normalizedDiagnostics } : {})
  };
}

function sourcesForConfig(config: CliConfig, source: CliConfigSourceKind): CliConfigSourceMap {
  const sources: CliConfigSourceMap = {};
  for (const key of Object.keys(config) as Array<keyof CliConfig>) {
    if (config[key] !== undefined) {
      sources[key] = source;
    }
  }
  return sources;
}

function mergeCliConfig(base: CliConfig, override: CliConfig): CliConfig {
  const { models: baseModels, providers: baseProviders, webSearch: baseWebSearch, diagnostics: baseDiagnostics, ...baseRest } = base;
  const { models: overrideModels, providers: overrideProviders, webSearch: overrideWebSearch, diagnostics: overrideDiagnostics, ...overrideRest } = override;
  return {
    ...baseRest,
    ...definedEntries(overrideRest),
    ...mergeProviders(baseProviders, overrideProviders),
    ...mergeModels(baseModels, overrideModels),
    ...(baseWebSearch || overrideWebSearch ? { webSearch: mergeWebSearchConfig(baseWebSearch, overrideWebSearch) } : {}),
    ...mergeDiagnostics(baseDiagnostics, overrideDiagnostics)
  };
}

function mergeProviders(
  baseProviders: CliProviderConfig[] | undefined,
  overrideProviders: CliProviderConfig[] | undefined
): Pick<CliConfig, "providers"> {
  if (!overrideProviders) {
    return baseProviders ? { providers: baseProviders } : {};
  }
  const byId = new Map<string, CliProviderConfig>();
  for (const provider of baseProviders ?? []) {
    byId.set(provider.id, provider);
  }
  for (const provider of overrideProviders) {
    byId.set(provider.id, { ...byId.get(provider.id), ...provider });
  }
  return { providers: [...byId.values()] };
}

function mergeModels(
  baseModels: CliModelConfig[] | undefined,
  overrideModels: CliModelConfig[] | undefined
): Pick<CliConfig, "models"> {
  if (!overrideModels) {
    return baseModels ? { models: baseModels } : {};
  }
  const byId = new Map<string, CliModelConfig>();
  for (const model of baseModels ?? []) {
    byId.set(model.id, model);
  }
  for (const model of overrideModels) {
    byId.set(model.id, { ...byId.get(model.id), ...model });
  }
  return { models: [...byId.values()] };
}

function definedEntries<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}

function mergeDiagnostics(
  baseDiagnostics: CliConfigDiagnostic[] | undefined,
  overrideDiagnostics: CliConfigDiagnostic[] | undefined
): Pick<CliConfig, "diagnostics"> {
  const merged = [...(baseDiagnostics ?? []), ...(overrideDiagnostics ?? [])];
  return merged.length > 0 ? { diagnostics: merged } : {};
}

function resolveApiKey(model: CliModelConfig, config: CliConfig, env: NodeJS.ProcessEnv): string | undefined {
  if (model.apiKeyEnv) {
    return env[model.apiKeyEnv];
  }
  if (model.apiKey) {
    return model.apiKey;
  }
  if (config.apiKeyEnv) {
    return env[config.apiKeyEnv];
  }
  return config.apiKey;
}

function isProviderMode(value: string | undefined): value is CliProviderMode {
  return value === "gateway"
    || value === "openai-compatible"
    || value === "openai"
    || value === "anthropic";
}

function normalizeProviders(
  providers: CliProviderConfig[],
  diagnostics: CliConfigDiagnostic[]
): CliProviderConfig[] {
  return providers
    .filter((provider) => typeof provider.id === "string")
    .map((provider) => {
      const { mode, ...rest } = provider;
      const normalizedMode = normalizeProviderMode(mode, (value) => {
        diagnostics.push({
          severity: "error",
          code: "INVALID_PROVIDER_MODE",
          message: `Unknown provider mode for provider ${provider.id}: ${value}`,
          providerId: provider.id
        });
      });
      return {
        ...rest,
        ...(normalizedMode ? { mode: normalizedMode } : {})
      };
    });
}

function normalizeWebSearch(
  value: CliWebSearchConfig,
  diagnostics: CliConfigDiagnostic[]
): CliWebSearchConfig {
  const { provider, permission, ...rest } = value;
  const normalizedProvider = normalizeWebSearchProvider(provider, (invalid) => {
    diagnostics.push({
      severity: "error",
      code: "INVALID_WEB_SEARCH_PROVIDER",
      message: `Unknown web search provider: ${invalid}`
    });
  });
  return {
    ...rest,
    ...(normalizedProvider ? { provider: normalizedProvider } : {}),
    ...(permission ? { permission: normalizeWebSearchPermission(permission, diagnostics) } : {})
  };
}

function normalizeWebSearchPermission(
  value: NonNullable<CliWebSearchConfig["permission"]>,
  diagnostics: CliConfigDiagnostic[]
): NonNullable<CliWebSearchConfig["permission"]> {
  const defaultAction = normalizePermissionAction(value.defaultAction, (invalid) => {
    diagnostics.push({
      severity: "error",
      code: "INVALID_WEB_SEARCH_PERMISSION",
      message: `Unknown web search permission action: ${invalid}`
    });
  });
  const trustedSessionAction = normalizePermissionAction(value.trustedSessionAction, (invalid) => {
    diagnostics.push({
      severity: "error",
      code: "INVALID_WEB_SEARCH_PERMISSION",
      message: `Unknown web search trusted-session permission action: ${invalid}`
    });
  });
  return {
    ...(defaultAction ? { defaultAction } : {}),
    ...(trustedSessionAction ? { trustedSessionAction } : {})
  };
}

function mergeWebSearchConfig(
  base: CliWebSearchConfig | undefined,
  override: CliWebSearchConfig | undefined
): CliWebSearchConfig {
  if (!override) {
    return base ?? {};
  }
  return {
    ...(base ?? {}),
    ...definedEntries(override),
    permission: {
      ...(base?.permission ?? {}),
      ...(override.permission ?? {})
    }
  };
}

function normalizeWebSearchProvider(
  value: string | undefined,
  onInvalid: (value: string) => void
): CliWebSearchProvider | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "mock" || value === "brave") {
    return value;
  }
  onInvalid(value);
  return undefined;
}

function normalizePermissionAction(
  value: string | undefined,
  onInvalid: (value: string) => void
): CliPermissionAction | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "allow" || value === "ask" || value === "deny") {
    return value;
  }
  onInvalid(value);
  return undefined;
}

function normalizeProviderMode(
  value: string | undefined,
  onInvalid: (value: string) => void
): CliProviderMode | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (isProviderMode(value)) {
    return value;
  }
  onInvalid(value);
  return undefined;
}

function providerModeFromEnv(env: NodeJS.ProcessEnv): CliProviderMode | undefined {
  if (isProviderMode(env.GUGA_PROVIDER_MODE)) {
    return env.GUGA_PROVIDER_MODE;
  }
  if (env.ANTHROPIC_API_KEY) {
    return "anthropic";
  }
  return undefined;
}

function webSearchFromEnv(env: NodeJS.ProcessEnv): CliWebSearchConfig | undefined {
  const enabled = parseEnvBoolean(env.GUGA_WEB_SEARCH);
  const provider = normalizeWebSearchProvider(env.GUGA_WEB_SEARCH_PROVIDER, () => undefined);
  const defaultAction = normalizePermissionAction(env.GUGA_WEB_SEARCH_PERMISSION, () => undefined);
  const trustedSessionAction = normalizePermissionAction(env.GUGA_WEB_SEARCH_TRUSTED_SESSION, () => undefined);
  const config: CliWebSearchConfig = {
    ...(enabled !== undefined ? { enabled } : {}),
    ...(provider ? { provider } : {}),
    ...(env.GUGA_WEB_SEARCH_API_KEY ? { apiKey: env.GUGA_WEB_SEARCH_API_KEY } : {}),
    ...(env.GUGA_WEB_SEARCH_API_KEY_ENV ? { apiKeyEnv: env.GUGA_WEB_SEARCH_API_KEY_ENV } : {}),
    ...((defaultAction || trustedSessionAction) ? {
      permission: {
        ...(defaultAction ? { defaultAction } : {}),
        ...(trustedSessionAction ? { trustedSessionAction } : {})
      }
    } : {})
  };
  return Object.keys(config).length > 0 ? config : undefined;
}

function parseEnvBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on", "allow", "enabled"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off", "deny", "disabled"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function defaultModelForProviderMode(providerMode: CliProviderMode): string {
  if (providerMode === "anthropic") {
    return "claude-sonnet-4-5";
  }
  return "gpt-4o-mini";
}

function apiKeyEnvForProviderMode(providerMode: CliProviderMode): string | undefined {
  if (providerMode === "anthropic") {
    return "ANTHROPIC_API_KEY";
  }
  if (providerMode === "openai" || providerMode === "openai-compatible") {
    return "OPENAI_API_KEY";
  }
  return undefined;
}

function formatCliConfigToml(config: CliConfig): string {
  const lines: string[] = [];
  appendTomlString(lines, "defaultModel", config.defaultModel);
  appendTomlString(lines, "providerId", config.providerId);
  appendTomlString(lines, "providerMode", config.providerMode);
  appendTomlString(lines, "apiKeyEnv", config.apiKeyEnv);
  appendTomlString(lines, "baseURL", config.baseURL);
  for (const model of config.models ?? []) {
    lines.push("");
    lines.push("[[models]]");
    appendTomlString(lines, "id", model.id);
    appendTomlString(lines, "modelId", model.modelId);
    appendTomlString(lines, "label", model.label);
    appendTomlString(lines, "providerId", model.providerId);
    appendTomlString(lines, "providerMode", model.providerMode);
    appendTomlString(lines, "apiKeyEnv", model.apiKeyEnv);
    appendTomlString(lines, "baseURL", model.baseURL);
  }
  return `${lines.join("\n")}\n`;
}

function appendTomlString(lines: string[], key: string, value: string | undefined): void {
  if (value !== undefined) {
    lines.push(`${key} = ${JSON.stringify(value)}`);
  }
}
