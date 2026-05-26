import type { HookRegistration } from "./hooks";
import type { Provider } from "./provider";
import type { ToolDefinition } from "./tools";

export type PluginContext = {
  pluginId: string;
  registerProvider(provider: Provider): void;
  registerTool(tool: ToolDefinition): void;
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

export type PluginCapabilityKind = "provider" | "tool" | "hook";

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
