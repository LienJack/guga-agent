import type { ModelCapability, ModelMetadata, ModelPurpose } from "@guga-agent/core";
import type { CliConfig, CliModelConfig, CliProviderConfig, CliProviderMode, SelectedCliModel } from "./config";
import { resolveProviderAuth, type ProviderAuthStatus, type ProviderAuthView } from "./provider-auth";

export type ModelHealthStatus = "unknown" | "healthy" | "degraded" | "unavailable";

export type ModelAvailabilityReason =
  | "missing-auth"
  | "invalid-auth"
  | "expired-auth"
  | "refresh-failed-auth"
  | "logged-out-auth"
  | "invalid-config"
  | "provider-unhealthy"
  | "unsupported-capability";

export type ResolvedModelView = {
  id: string;
  label?: string;
  providerId: string;
  providerMode?: CliProviderMode;
  modelId: string;
  purpose?: ModelPurpose;
  capabilities?: ModelCapability;
  source: "config" | "legacy" | "registered" | "built-in";
  authStatus: ProviderAuthStatus;
  auth: ProviderAuthView;
  healthStatus: ModelHealthStatus;
  available: boolean;
  unavailableReasons: ModelAvailabilityReason[];
  isDefault: boolean;
  displayName: string;
  baseURL?: string;
};

export type ResolvedModelSelection = SelectedCliModel & {
  availability: ResolvedModelView;
};

export type ResolveModelRegistryOptions = {
  config: CliConfig;
  selector?: string;
  providerId?: string;
  env?: NodeJS.ProcessEnv;
  credentialRoot?: string;
  registeredModels?: ModelMetadata[];
  requiredCapabilities?: ModelCapability;
  health?: Record<string, ModelHealthStatus>;
};

export function resolveModelRegistry(options: ResolveModelRegistryOptions): ResolvedModelView[] {
  const env = options.env ?? process.env;
  const providers = providersById(options.config);
  const configuredModels = configuredModelSpecs(options.config, providers);
  const builtInModels = builtInOAuthModelSpecs(options.config, providers);
  const registeredModels = (options.registeredModels ?? []).map((model) => ({
    id: `${model.providerId}/${model.modelId}`,
    model,
    source: "registered" as const
  }));

  const models = [
    ...configuredModels.map((model) => modelViewFromConfig({
      config: options.config,
      model: model.model,
      provider: providers.get(model.model.providerId ?? options.config.providerId ?? "ai-sdk"),
      source: model.source,
      env,
      ...(options.credentialRoot ? { credentialRoot: options.credentialRoot } : {}),
      ...(options.requiredCapabilities ? { requiredCapabilities: options.requiredCapabilities } : {}),
      ...(options.health ? { health: options.health } : {})
    })),
    ...builtInModels.map((model) => modelViewFromConfig({
      config: options.config,
      model: model.model,
      provider: providers.get(model.model.providerId),
      source: "built-in",
      env,
      ...(options.credentialRoot ? { credentialRoot: options.credentialRoot } : {}),
      ...(options.requiredCapabilities ? { requiredCapabilities: options.requiredCapabilities } : {}),
      ...(options.health ? { health: options.health } : {})
    })),
    ...registeredModels.map((entry) => modelViewFromRegistered({
      config: options.config,
      metadata: entry.model,
      provider: providers.get(entry.model.providerId),
      env,
      ...(options.credentialRoot ? { credentialRoot: options.credentialRoot } : {}),
      ...(options.requiredCapabilities ? { requiredCapabilities: options.requiredCapabilities } : {}),
      ...(options.health ? { health: options.health } : {})
    }))
  ];
  return options.providerId
    ? models.filter((model) => model.providerId === options.providerId)
    : models;
}

export function selectResolvedModel(
  options: ResolveModelRegistryOptions
): ResolvedModelSelection | undefined {
  const models = resolveModelRegistry(options);
  const requested = options.selector ?? (options.providerId ? undefined : options.config.defaultModel ?? options.config.modelId);
  const selected = requested
    ? models.find((model) => model.id === requested || model.modelId === requested)
    : models.find((model) => model.source !== "built-in") ?? (options.providerId ? models[0] : undefined);
  if (!selected || !selected.available) {
    return undefined;
  }
  const provider = providerForSelection(options.config, selected);
  const auth = resolveProviderAuth({
    provider,
    ...(options.env ? { env: options.env } : {}),
    ...(options.credentialRoot ? { credentialRoot: options.credentialRoot } : {})
  });
  return {
    id: selected.id,
    ...(selected.label ? { label: selected.label } : {}),
    providerId: selected.providerId,
    ...(selected.providerMode ? { providerMode: selected.providerMode } : {}),
    modelId: selected.modelId,
    ...(auth.material.apiKey ? { apiKey: auth.material.apiKey } : {}),
    ...(auth.material.accessToken ? { accessToken: auth.material.accessToken } : {}),
    ...(auth.material.tokenType ? { tokenType: auth.material.tokenType } : {}),
    ...(selected.baseURL ? { baseURL: selected.baseURL } : {}),
    availability: selected
  };
}

export function unavailableReasonText(reasons: readonly ModelAvailabilityReason[]): string {
  if (reasons.length === 0) {
    return "available";
  }
  return reasons.map((reason) => reason.replaceAll("-", " ")).join(", ");
}

function modelViewFromConfig(options: {
  config: CliConfig;
  model: CliModelConfig & { providerId: string };
  provider: CliProviderConfig | undefined;
  source: "config" | "legacy" | "built-in";
  env: NodeJS.ProcessEnv;
  credentialRoot?: string;
  requiredCapabilities?: ModelCapability;
  health?: Record<string, ModelHealthStatus>;
}): ResolvedModelView {
  const provider = providerForModel(options.config, options.model, options.provider);
  const auth = resolveProviderAuth({
    provider: {
      ...provider,
      ...(options.model.apiKey ? { apiKey: options.model.apiKey } : {}),
      ...(options.model.apiKeyEnv ? { apiKeyEnv: options.model.apiKeyEnv } : {})
    },
    env: options.env,
    ...(options.credentialRoot ? { credentialRoot: options.credentialRoot } : {})
  });
  const providerMode = options.model.providerMode ?? provider.mode ?? options.config.providerMode;
  const healthStatus = healthFor(options.health, options.model.providerId, options.model.modelId);
  const capabilities = options.model.capabilities;
  const unavailableReasons = availabilityReasons({
    authStatus: auth.view.status,
    invalidConfig: hasInvalidConfigDiagnostic(options.config, options.model.providerId, options.model.id),
    healthStatus,
    ...(capabilities ? { capabilities } : {}),
    ...(options.requiredCapabilities ? { requiredCapabilities: options.requiredCapabilities } : {})
  });
  const defaultId = options.config.defaultModel ?? options.config.modelId;

  return {
    id: options.model.id,
    ...(options.model.label ? { label: options.model.label } : {}),
    providerId: options.model.providerId,
    ...(providerMode ? { providerMode } : {}),
    modelId: options.model.modelId,
    ...(options.model.purpose ? { purpose: options.model.purpose } : {}),
    ...(capabilities ? { capabilities } : {}),
    source: options.source,
    authStatus: auth.view.status,
    auth: auth.view,
    healthStatus,
    available: unavailableReasons.length === 0,
    unavailableReasons,
    isDefault: options.model.id === defaultId || (defaultId === undefined && options.source === "legacy"),
    displayName: options.model.label ?? options.model.id,
    ...(options.model.baseURL ?? provider.baseURL ?? options.config.baseURL ? {
      baseURL: options.model.baseURL ?? provider.baseURL ?? options.config.baseURL
    } : {})
  };
}

function modelViewFromRegistered(options: {
  config: CliConfig;
  metadata: ModelMetadata;
  provider: CliProviderConfig | undefined;
  env: NodeJS.ProcessEnv;
  credentialRoot?: string;
  requiredCapabilities?: ModelCapability;
  health?: Record<string, ModelHealthStatus>;
}): ResolvedModelView {
  const provider = providerForRegistered(options.metadata, options.provider);
  const auth = resolveProviderAuth({
    provider,
    env: options.env,
    ...(options.credentialRoot ? { credentialRoot: options.credentialRoot } : {})
  });
  const healthStatus = healthFor(options.health, options.metadata.providerId, options.metadata.modelId);
  const unavailableReasons = availabilityReasons({
    authStatus: auth.view.status,
    invalidConfig: hasInvalidConfigDiagnostic(options.config, options.metadata.providerId, options.metadata.modelId),
    healthStatus,
    ...(options.metadata.capabilities ? { capabilities: options.metadata.capabilities } : {}),
    ...(options.requiredCapabilities ? { requiredCapabilities: options.requiredCapabilities } : {})
  });
  const id = `${options.metadata.providerId}/${options.metadata.modelId}`;
  const defaultId = options.config.defaultModel ?? options.config.modelId;

  return {
    id,
    ...(options.metadata.displayName ? { label: options.metadata.displayName } : {}),
    providerId: options.metadata.providerId,
    ...(provider.mode ? { providerMode: provider.mode } : {}),
    modelId: options.metadata.modelId,
    ...(options.metadata.purposes?.[0] ? { purpose: options.metadata.purposes[0] } : {}),
    ...(options.metadata.capabilities ? { capabilities: options.metadata.capabilities } : {}),
    source: "registered",
    authStatus: auth.view.status,
    auth: auth.view,
    healthStatus,
    available: unavailableReasons.length === 0,
    unavailableReasons,
    isDefault: id === defaultId || options.metadata.modelId === defaultId,
    displayName: options.metadata.displayName ?? id,
    ...(provider.baseURL ? { baseURL: provider.baseURL } : {})
  };
}

function providersById(config: CliConfig): Map<string, CliProviderConfig> {
  const providers = new Map<string, CliProviderConfig>();
  for (const provider of config.providers ?? []) {
    providers.set(provider.id, provider);
  }
  if (config.providerId || config.providerMode || config.baseURL || config.apiKey || config.apiKeyEnv) {
    const id = config.providerId ?? "ai-sdk";
    providers.set(id, {
      ...providers.get(id),
      id,
      ...(config.providerMode ? { mode: config.providerMode } : {}),
      ...(config.baseURL ? { baseURL: config.baseURL } : {}),
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
      ...(config.apiKeyEnv ? { apiKeyEnv: config.apiKeyEnv } : {}),
      ...(config.modelId ? { defaultModel: config.modelId } : {})
    });
  }
  for (const model of config.models ?? []) {
    const id = model.providerId ?? config.providerId ?? "ai-sdk";
    if (!providers.has(id)) {
      providers.set(id, {
        id,
        ...(model.providerMode ?? config.providerMode ? { mode: model.providerMode ?? config.providerMode } : {}),
        ...(model.baseURL ?? config.baseURL ? { baseURL: model.baseURL ?? config.baseURL } : {}),
        ...(model.apiKey ? { apiKey: model.apiKey } : {}),
        ...(model.apiKeyEnv ? { apiKeyEnv: model.apiKeyEnv } : {})
      });
    }
  }
  for (const model of BUILT_IN_OAUTH_MODELS) {
    if (!providers.has(model.providerId)) {
      providers.set(model.providerId, builtInProviderFor(model.providerId));
    }
  }
  return providers;
}

function configuredModelSpecs(
  config: CliConfig,
  providers: Map<string, CliProviderConfig>
): Array<{ model: CliModelConfig & { providerId: string }; source: "config" | "legacy" }> {
  if (config.models?.length) {
    return config.models.map((model) => ({
      model: {
        ...model,
        providerId: model.providerId ?? config.providerId ?? providers.keys().next().value ?? "ai-sdk"
      },
      source: "config"
    }));
  }
  const modelId = config.modelId ?? config.defaultModel;
  if (!modelId) {
    return [];
  }
  return [{
    model: {
      id: modelId,
      providerId: config.providerId ?? providers.keys().next().value ?? "ai-sdk",
      modelId,
      ...(config.providerMode ? { providerMode: config.providerMode } : {}),
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
      ...(config.apiKeyEnv ? { apiKeyEnv: config.apiKeyEnv } : {}),
      ...(config.baseURL ? { baseURL: config.baseURL } : {})
    },
    source: "legacy"
  }];
}

function builtInOAuthModelSpecs(
  config: CliConfig,
  providers: Map<string, CliProviderConfig>
): Array<{ model: CliModelConfig & { providerId: string }; source: "built-in" }> {
  const configuredIds = new Set((config.models ?? []).map((model) => model.id));
  const configuredProviderModels = new Set((config.models ?? []).map((model) => `${model.providerId}:${model.modelId}`));
  return BUILT_IN_OAUTH_MODELS
    .filter((model) => !configuredIds.has(model.id) && !configuredProviderModels.has(`${model.providerId}:${model.modelId}`))
    .map((model) => {
      if (!providers.has(model.providerId)) {
        providers.set(model.providerId, builtInProviderFor(model.providerId));
      }
      return { model, source: "built-in" as const };
    });
}

function providerForModel(
  config: CliConfig,
  model: CliModelConfig & { providerId: string },
  provider: CliProviderConfig | undefined
): CliProviderConfig {
  const apiKey = model.apiKey ?? provider?.apiKey ?? config.apiKey;
  const apiKeyEnv = model.apiKeyEnv ?? provider?.apiKeyEnv ?? config.apiKeyEnv;
  return {
    id: model.providerId,
    ...(provider ?? {}),
    ...(model.providerMode ?? config.providerMode ? { mode: model.providerMode ?? config.providerMode } : {}),
    ...(model.baseURL ?? provider?.baseURL ?? config.baseURL ? { baseURL: model.baseURL ?? provider?.baseURL ?? config.baseURL } : {}),
    ...(apiKey ? { apiKey } : {}),
    ...(!apiKey && apiKeyEnv ? { apiKeyEnv } : {})
  };
}

function providerForRegistered(metadata: ModelMetadata, provider: CliProviderConfig | undefined): CliProviderConfig {
  return {
    id: metadata.providerId,
    ...(provider ?? {})
  };
}

function providerForSelection(config: CliConfig, selected: ResolvedModelView): CliProviderConfig {
  const providers = providersById(config);
  return providerForModel(config, {
    id: selected.id,
    providerId: selected.providerId,
    modelId: selected.modelId,
    ...(selected.providerMode ? { providerMode: selected.providerMode } : {}),
    ...(selected.baseURL ? { baseURL: selected.baseURL } : {})
  }, providers.get(selected.providerId));
}

function availabilityReasons(options: {
  authStatus: ProviderAuthStatus;
  invalidConfig?: boolean;
  healthStatus: ModelHealthStatus;
  capabilities?: ModelCapability;
  requiredCapabilities?: ModelCapability;
}): ModelAvailabilityReason[] {
  const reasons: ModelAvailabilityReason[] = [];
  if (options.authStatus === "missing") {
    reasons.push("missing-auth");
  }
  if (options.authStatus === "invalid") {
    reasons.push("invalid-auth");
  }
  if (options.authStatus === "expired") {
    reasons.push("expired-auth");
  }
  if (options.authStatus === "refresh-failed") {
    reasons.push("refresh-failed-auth");
  }
  if (options.authStatus === "logged-out") {
    reasons.push("logged-out-auth");
  }
  if (options.authStatus === "login-pending") {
    reasons.push("missing-auth");
  }
  if (options.invalidConfig) {
    reasons.push("invalid-config");
  }
  if (options.healthStatus === "unavailable") {
    reasons.push("provider-unhealthy");
  }
  if (hasUnsupportedCapability(options.capabilities, options.requiredCapabilities)) {
    reasons.push("unsupported-capability");
  }
  return reasons;
}

const BUILT_IN_OAUTH_MODELS: Array<CliModelConfig & { providerId: string }> = [
  {
    id: "copilot",
    label: "GitHub Copilot",
    providerId: "copilot",
    providerMode: "openai-compatible",
    modelId: "gpt-5.4",
    capabilities: { toolCalling: false, streaming: true, reasoning: true, usage: "optional" }
  },
  {
    id: "codex",
    label: "OpenAI Codex",
    providerId: "codex",
    providerMode: "openai",
    modelId: "gpt-5.4",
    capabilities: { toolCalling: true, streaming: true, reasoning: true, usage: "optional" }
  }
];

function builtInProviderFor(providerId: string): CliProviderConfig {
  return {
    id: providerId,
    mode: providerId === "codex" ? "openai" : "openai-compatible",
    metadata: { authType: "oauth" }
  };
}

function hasInvalidConfigDiagnostic(config: CliConfig, providerId: string, modelId: string): boolean {
  return (config.diagnostics ?? []).some((diagnostic) =>
    diagnostic.severity === "error"
    && diagnostic.code === "INVALID_PROVIDER_MODE"
    && (diagnostic.providerId === providerId || diagnostic.modelId === modelId || (!diagnostic.providerId && !diagnostic.modelId))
  );
}

function hasUnsupportedCapability(capabilities: ModelCapability | undefined, required: ModelCapability | undefined): boolean {
  if (!required) {
    return false;
  }
  if (required.toolCalling === true && capabilities?.toolCalling === false) {
    return true;
  }
  if (required.streaming === true && capabilities?.streaming === false) {
    return true;
  }
  if (required.reasoning === true && capabilities?.reasoning === false) {
    return true;
  }
  if (required.usage === "required" && capabilities?.usage === "unavailable") {
    return true;
  }
  return false;
}

function healthFor(
  health: Record<string, ModelHealthStatus> | undefined,
  providerId: string,
  modelId: string
): ModelHealthStatus {
  return health?.[`${providerId}/${modelId}`] ?? health?.[providerId] ?? "unknown";
}
