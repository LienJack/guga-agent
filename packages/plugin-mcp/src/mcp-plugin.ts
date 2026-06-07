import type { LocalPlugin } from "@guga-agent/core";
import { defineExtension } from "@guga-agent/extension-sdk";
import { McpStdioClient } from "./mcp-stdio-client";
import { createMcpToolDefinition, type McpToolPolicyResolver } from "./mcp-tool-adapter";

export type McpServerConfig = {
  name: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
};

export type McpPluginOptions = {
  pluginId?: string;
  servers: McpServerConfig[];
  toolPolicy?: McpToolPolicyResolver;
};

export function createMcpPlugin(options: McpPluginOptions): LocalPlugin {
  return createMcpExtension(options);
}

export function createMcpExtension(options: McpPluginOptions): LocalPlugin {
  const pluginId = options.pluginId ?? "guga-mcp";
  const clients: McpStdioClient[] = [];
  return defineExtension({
    id: pluginId,
    name: "Guga MCP",
    source: { kind: "first-party", packageName: "@guga-agent/plugin-mcp" },
    declaredEffects: ["process.spawn", "network.access"],
    permissionRequirements: [{ subject: "mcp.server", actions: ["connect", "call-tool"] }],
    dependencies: options.servers.map((server) => ({ kind: "service", name: server.name, optional: false })),
    lifecycle: { load: "eager", unload: "remove-contributions", reload: "unsupported", shutdownTimeoutMs: 1_000 },
    async setup(context) {
      try {
        for (const server of options.servers) {
          const client = new McpStdioClient(server);
          clients.push(client);
          await client.connect();
          const tools = await client.listTools();
          for (const tool of tools) {
            context.registerTool(createMcpToolDefinition({
              serverName: server.name,
              tool,
              client,
              ...(options.toolPolicy ? { policy: options.toolPolicy } : {})
            }), {
              source: "mcp",
              namespace: server.name,
              trust: {
                level: "untrusted",
                scopes: [
                  { kind: "mcp.server", access: "call-tool", value: server.name },
                  { kind: "mcp.tool", access: "execute", value: tool.name }
                ],
                reason: "MCP server capabilities are external to the core runtime."
              }
            });
          }
        }
      } catch (error) {
        closeClients(clients);
        throw error;
      }
    },
    shutdown() {
      closeClients(clients);
    }
  });
}

function closeClients(clients: McpStdioClient[]): void {
  for (const client of clients.splice(0)) {
    client.close();
  }
}
