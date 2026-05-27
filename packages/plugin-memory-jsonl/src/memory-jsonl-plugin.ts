import type { LocalPlugin, TrustDescriptor } from "@guga-agent/core";

export type MemoryJsonlPluginOptions = {
  pluginId?: string;
};

const readTrust: TrustDescriptor = {
  level: "first-party",
  scopes: [{ kind: "memory", access: "read" }]
};

const readWriteTrust: TrustDescriptor = {
  level: "first-party",
  scopes: [
    { kind: "memory", access: "read" },
    { kind: "memory", access: "write" }
  ]
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
        trust: readWriteTrust
      });
      for (const name of [
        "memory.jsonl.review",
        "memory.jsonl.health",
        "memory.jsonl.retrieval",
        "memory.jsonl.curated_markdown"
      ]) {
        context.registerOperation?.(name, {
          source: "plugin",
          ownerPluginId: pluginId,
          trust: readTrust
        });
      }
    }
  };
}
