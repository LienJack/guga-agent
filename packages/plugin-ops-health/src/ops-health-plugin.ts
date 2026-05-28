import type { LocalPlugin } from "@guga-agent/core";

export type OpsHealthPluginOptions = {
  pluginId?: string;
};

export function createOpsHealthPlugin(options: OpsHealthPluginOptions = {}): LocalPlugin {
  const pluginId = options.pluginId ?? "ops-health";
  return {
    id: pluginId,
    name: "Operations Health",
    init(context) {
      const trust = {
        level: "first-party" as const,
        scopes: [{ kind: "provider", access: "read" }]
      };
      context.registerOperation?.("provider.health", { trust });
      context.registerOperation?.("provider.config", { trust });
    }
  };
}
