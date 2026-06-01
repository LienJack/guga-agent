import type { CapabilityRegistrationOptions } from "../contracts/plugins";
import type { ModelMetadata, Provider } from "../contracts/provider";
import type { ToolDefinition } from "../contracts/tools";
import { CapabilityRegistry } from "../registry/capability-registry";
import { createBuiltInFilesystemTools, type BuiltInFilesystemOptions } from "./filesystem";
import { createBuiltInGitTools, type BuiltInGitOptions } from "./git";
import { createBuiltInShellTool, type BuiltInShellOptions } from "./shell";
import type { AiSdkProviderConfig, AiSdkProviderFactoryOptions } from "../provider-ai-sdk/index";

export type BuiltInCoreCapabilitySet = {
  providers?: Provider[];
  models?: ModelMetadata[];
  tools?: ToolDefinition[];
};

export type DefaultCoreCapabilitiesOptions = {
  workspaceRoot?: string;
  filesystem?: BuiltInFilesystemOptions | false;
  git?: BuiltInGitOptions | false;
  shell?: BuiltInShellOptions | false;
  aiSdk?: false | {
    config: AiSdkProviderConfig;
    factory?: AiSdkProviderFactoryOptions;
  };
};

export type BuiltInCoreCapabilityRegistration = {
  registered: {
    providers: string[];
    models: string[];
    tools: string[];
  };
};

export const BUILT_IN_CORE_OWNER = {
  kind: "core",
  id: "guga-core",
  packageName: "@guga-agent/core"
} as const;

export const BUILT_IN_CORE_REGISTRATION = {
  source: "built-in",
  layer: "built-in-core",
  owner: BUILT_IN_CORE_OWNER,
  trust: {
    level: "first-party"
  }
} as const satisfies CapabilityRegistrationOptions;

export function createDefaultCoreCapabilities(options: DefaultCoreCapabilitiesOptions = {}): BuiltInCoreCapabilitySet {
  const providers: Provider[] = [];
  const models: ModelMetadata[] = [];
  const tools: ToolDefinition[] = [];
  const workspaceRoot = options.workspaceRoot ?? process.cwd();

  if (options.filesystem !== false) {
    tools.push(...createBuiltInFilesystemTools(options.filesystem ?? { workspaceRoot }));
  }
  if (options.git !== false) {
    tools.push(...createBuiltInGitTools(options.git ?? { workspaceRoot }));
  }
  if (options.shell !== false) {
    tools.push(createBuiltInShellTool(options.shell ?? { workspaceRoot }));
  }
  if (options.aiSdk) {
    const aiSdk = createLazyBuiltInAiSdkProviderCapabilities(options.aiSdk.config, options.aiSdk.factory);
    providers.push(aiSdk.provider);
    models.push(aiSdk.model);
  }

  return { providers, models, tools };
}

export function registerBuiltInCoreCapabilities(
  registry: CapabilityRegistry,
  capabilities: BuiltInCoreCapabilitySet = createDefaultCoreCapabilities()
): BuiltInCoreCapabilityRegistration {
  const registered: BuiltInCoreCapabilityRegistration["registered"] = {
    providers: [],
    models: [],
    tools: []
  };

  for (const provider of capabilities.providers ?? []) {
    registry.registerProvider(provider, BUILT_IN_CORE_REGISTRATION);
    registered.providers.push(provider.id);
  }

  for (const model of capabilities.models ?? []) {
    registry.registerModel(model, BUILT_IN_CORE_REGISTRATION);
    registered.models.push(`${model.providerId}/${model.modelId}`);
  }

  for (const tool of capabilities.tools ?? []) {
    registry.registerTool(tool, BUILT_IN_CORE_REGISTRATION);
    registered.tools.push(tool.name);
  }

  return { registered };
}

function createLazyBuiltInAiSdkProviderCapabilities(
  config: AiSdkProviderConfig,
  factory?: AiSdkProviderFactoryOptions
): {
  provider: Provider;
  model: ModelMetadata;
} {
  const providerId = config.id ?? "ai-sdk";
  return {
    provider: {
      id: providerId,
      async generate(request) {
        const { createAiSdkProvider } = await import("../provider-ai-sdk/index");
        return createAiSdkProvider(config, factory).generate(request);
      }
    },
    model: {
      providerId,
      modelId: config.modelId,
      ...(config.metadata ?? {})
    }
  };
}
