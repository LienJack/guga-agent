import type { CapabilityRegistrationOptions } from "../contracts/plugins";
import type { ModelMetadata, Provider } from "../contracts/provider";
import type { ToolDefinition } from "../contracts/tools";
import { CapabilityRegistry } from "../registry/capability-registry";

export type BuiltInCoreCapabilitySet = {
  providers?: Provider[];
  models?: ModelMetadata[];
  tools?: ToolDefinition[];
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

export function createDefaultCoreCapabilities(): BuiltInCoreCapabilitySet {
  return {
    providers: [],
    models: [],
    tools: []
  };
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
