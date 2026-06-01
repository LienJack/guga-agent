import type { LocalPlugin } from "@guga-agent/core";
import { defineExtension } from "@guga-agent/extension-sdk";
import { createWebSearchTool } from "./web-search-tool";
import { WEB_SEARCH_PACKAGE_NAME, WEB_SEARCH_PLUGIN_ID, type WebSearchPluginOptions } from "./types";

export function createWebSearchPlugin(options: WebSearchPluginOptions = {}): LocalPlugin {
  const pluginId = options.pluginId ?? WEB_SEARCH_PLUGIN_ID;
  return defineExtension({
    id: pluginId,
    name: "Guga Web Search",
    source: { kind: "first-party", packageName: WEB_SEARCH_PACKAGE_NAME },
    declaredEffects: ["network.access"],
    permissionRequirements: [{ subject: "web.search", actions: ["query"] }],
    dependencies: [{
      kind: "service",
      name: options.providerId ?? options.backend?.id ?? "web-search-backend",
      optional: true
    }],
    lifecycle: { load: "eager", unload: "remove-contributions", reload: "unsupported", shutdownTimeoutMs: 1_000 },
    setup(context) {
      context.registerTool(createWebSearchTool(options));
    }
  });
}
