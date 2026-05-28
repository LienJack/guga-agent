import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

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

export type CliConfigWithSources = {
  config: CliConfig;
  sources: CliConfigSourceMap;
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
  const candidates: Array<{ path: string | undefined; source: Exclude<CliConfigSourceKind, "env" | "default"> }> = [
    { path: options.env.GUGA_CONFIG, source: "guga_config" },
    { path: resolve(options.cwd, ".guga/config.json"), source: "project" },
    { path: resolve(options.homeDir, ".guga/config.json"), source: "user" }
  ];
  for (const candidate of candidates) {
    if (!candidate.path) {
      continue;
    }
    if (!existsSync(candidate.path)) {
      if (candidate.source === "guga_config") {
        throw new CliConfigError(candidate.path, "file does not exist");
      }
      continue;
    }
    const parsed = parseConfigFile(candidate.path);
    const config = normalizeCliConfig(parsed);
    return {
      config,
      sources: sourcesForConfig(config, candidate.source),
      filePath: candidate.path,
      fileSource: candidate.source
    };
  }
  return { config: {}, sources: {} };
}

function parseConfigFile(path: string): CliConfig {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as CliConfig;
  } catch (error) {
    throw new CliConfigError(path, error instanceof Error ? error.message : "Unable to parse config JSON");
  }
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
