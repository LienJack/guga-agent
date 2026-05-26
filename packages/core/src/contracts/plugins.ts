import type { HookRegistration } from "./hooks";
import type { ModelIdentifier, ModelMetadata, Provider } from "./provider";
import type { ToolDefinition } from "./tools";

export type ToolRegistrationOptions = {
  override?: false | {
    replaces: string;
    reason: string;
  };
};

export type PluginContext = {
  pluginId: string;
  registerProvider(provider: Provider): void;
  registerModel?(model: ModelMetadata): void;
  registerTool(tool: ToolDefinition, options?: ToolRegistrationOptions): void;
  registerHook(hook: HookRegistration): void;
};

export type PluginShutdownContext = {
  pluginId: string;
};

export type LocalPlugin = {
  id: string;
  name?: string;
  init(context: PluginContext): Promise<void> | void;
  shutdown?(context: PluginShutdownContext): Promise<void> | void;
};

export type LocalModelPlugin = LocalPlugin & {
  model: ModelIdentifier;
};

export type PluginCapabilityKind = "provider" | "model" | "tool" | "hook";

export type PluginFailureKind = "init" | "hook" | "shutdown";

export type PluginFailure = {
  code: "PLUGIN_INIT_FAILED" | "PLUGIN_SHUTDOWN_FAILED" | "HOOK_FAILED";
  message: string;
  details?: unknown;
};

export type PluginHostOptions = {
  plugins?: LocalPlugin[];
};

export type PluginShutdownResult = {
  ok: boolean;
  failures: Array<{
    pluginId: string;
    error: PluginFailure;
  }>;
};
