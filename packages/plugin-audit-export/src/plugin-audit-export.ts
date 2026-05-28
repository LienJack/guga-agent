import type { LocalPlugin } from "@guga-agent/core";

export type AuditExportPluginOptions = {
  pluginId?: string;
};

export function createAuditExportPlugin(options: AuditExportPluginOptions = {}): LocalPlugin {
  const pluginId = options.pluginId ?? "audit-export";
  return {
    id: pluginId,
    name: "Audit Export",
    init(context) {
      const trust = {
        level: "first-party" as const,
        scopes: [
          { kind: "audit", access: "read" },
          { kind: "metrics", access: "read" }
        ]
      };
      context.registerOperation?.("audit.summary", { trust });
      context.registerOperation?.("metrics.snapshot", { trust });
    }
  };
}
