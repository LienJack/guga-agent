import type { LocalPlugin, TrustDescriptor } from "@guga-agent/core";

export type MemoryJsonlPluginOptions = {
  pluginId?: string;
};

export const MEMORY_JSONL_OPERATION_NAME = "memory.jsonl" as const;

export const MEMORY_JSONL_OPERATION_NAMESPACE = "memory-jsonl" as const;

export const MEMORY_JSONL_READ_OPERATION_NAMES = [
  "memory.jsonl.review",
  "memory.jsonl.review_report",
  "memory.jsonl.review_markdown",
  "memory.jsonl.health",
  "memory.jsonl.audit_snapshot",
  "memory.jsonl.retrieval",
  "memory.jsonl.curated_markdown"
] as const;

export const MEMORY_JSONL_OPERATION_NAMES = [
  MEMORY_JSONL_OPERATION_NAME,
  ...MEMORY_JSONL_READ_OPERATION_NAMES
] as const;

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
      context.registerOperation?.(MEMORY_JSONL_OPERATION_NAME, {
        source: "plugin",
        namespace: MEMORY_JSONL_OPERATION_NAMESPACE,
        ownerPluginId: pluginId,
        trust: readWriteTrust
      });
      for (const name of MEMORY_JSONL_READ_OPERATION_NAMES) {
        context.registerOperation?.(name, {
          source: "plugin",
          namespace: MEMORY_JSONL_OPERATION_NAMESPACE,
          ownerPluginId: pluginId,
          trust: readTrust
        });
      }
    }
  };
}
