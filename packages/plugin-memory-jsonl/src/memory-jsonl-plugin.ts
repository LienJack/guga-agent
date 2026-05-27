import type { LocalPlugin } from "@guga-agent/core";

export type MemoryJsonlPluginOptions = {
  pluginId?: string;
};

export function createMemoryJsonlPlugin(options: MemoryJsonlPluginOptions = {}): LocalPlugin {
  const pluginId = options.pluginId ?? "memory-jsonl";
  return {
    id: pluginId,
    name: "Memory JSONL",
    init(context) {
      context.registerOperation?.("memory.jsonl", {
        source: "plugin",
        ownerPluginId: pluginId,
        trust: {
          level: "first-party",
          scopes: [
            { kind: "memory", access: "read" },
            { kind: "memory", access: "write" }
          ]
        }
      });
    }
  };
}
