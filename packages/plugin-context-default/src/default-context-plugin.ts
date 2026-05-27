import type { LocalPlugin } from "@guga-agent/core";
import { defaultContextHooks, defaultContextPolicy } from "./default-context-policy";

export type DefaultContextPluginOptions = {
  pluginId?: string;
};

export function createDefaultContextPlugin(options: DefaultContextPluginOptions = {}): LocalPlugin {
  const pluginId = options.pluginId ?? "guga-default-context";
  return {
    id: pluginId,
    name: "Guga Default Context Policy",
    init(context) {
      context.registerContextPolicy?.(defaultContextPolicy(pluginId));
      for (const hook of defaultContextHooks(pluginId)) {
        context.registerHook(hook);
      }
    }
  };
}
