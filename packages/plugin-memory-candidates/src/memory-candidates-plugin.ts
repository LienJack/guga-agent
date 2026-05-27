import type { LocalPlugin } from "@guga-agent/core";

export type MemoryCandidatesPluginOptions = {
  pluginId?: string;
};

export function createMemoryCandidatesPlugin(options: MemoryCandidatesPluginOptions = {}): LocalPlugin {
  const pluginId = options.pluginId ?? "memory-candidates";
  return {
    id: pluginId,
    name: "Memory Candidates",
    init(context) {
      context.registerOperation?.("memory.candidates", {
        source: "plugin",
        ownerPluginId: pluginId,
        trust: {
          level: "first-party",
          scopes: [{ kind: "memory", access: "read" }]
        }
      });
    }
  };
}

export function createMemoryGovernancePlugin(options: MemoryCandidatesPluginOptions = {}): LocalPlugin {
  const pluginId = options.pluginId ?? "memory-governance";
  return {
    id: pluginId,
    name: "Memory Governance",
    init(context) {
      context.registerOperation?.("memory.governance", {
        source: "plugin",
        ownerPluginId: pluginId,
        trust: {
          level: "first-party",
          scopes: [{ kind: "memory", access: "read" }]
        }
      });
    }
  };
}
