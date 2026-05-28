import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { extname, resolve } from "node:path";
import { parse as parseToml } from "smol-toml";
import { GugaHomeError, resolveGugaHome } from "./guga-home";

export type CliProviderMode = "gateway" | "openai-compatible" | "openai" | "anthropic";

export type CliModelConfig = {
  id: string;
  label?: string;
  providerId?: string;
  providerMode?: CliProviderMode;
  modelId: string;
  apiKey?: string;
  apiKeyEnv?: string;
  baseURL?: string;
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
  models?: CliModelConfig[];
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
  const config: CliConfig = {
    ...fileConfig.config,
    ...(env.GUGA_PROVIDER ? { providerId: env.GUGA_PROVIDER } : {}),
    ...(env.GUGA_MODEL ? { modelId: env.GUGA_MODEL, defaultModel: env.GUGA_MODEL } : {}),
    ...(isProviderMode(env.GUGA_PROVIDER_MODE) ? { providerMode: env.GUGA_PROVIDER_MODE } : {}),
    ...(apiKey ? { apiKey } : {}),
    ...(env.GUGA_BASE_URL ? { baseURL: env.GUGA_BASE_URL } : {})
  };
  const sources: CliConfigSourceMap = { ...fileConfig.sources };
  for (const key of ["providerId", "modelId", "defaultModel", "providerMode", "apiKey", "baseURL"] as const) {
    if (config[key] !== fileConfig.config[key] && config[key] !== undefined) {
      sources[key] = "env";
    }
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
  const { providerMode, models, ...rest } = config;
  return {
    ...rest,
    ...(isProviderMode(providerMode) ? { providerMode } : {}),
    ...(models ? {
      models: models
        .filter((model) => typeof model.id === "string" && typeof model.modelId === "string")
        .map((model) => {
          const { providerMode: modelProviderMode, ...modelRest } = model;
          return {
            ...modelRest,
            ...(isProviderMode(modelProviderMode) ? { providerMode: modelProviderMode } : {})
          };
        })
    } : {})
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
  const { models: baseModels, ...baseRest } = base;
  const { models: overrideModels, ...overrideRest } = override;
  return {
    ...baseRest,
    ...definedEntries(overrideRest),
    ...mergeModels(baseModels, overrideModels)
  };
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
