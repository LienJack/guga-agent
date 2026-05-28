import type { LocalPlugin } from "@guga-agent/core";
import { McpStdioClient } from "./mcp-stdio-client";
import { createMcpToolDefinition } from "./mcp-tool-adapter";

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
};

export function createMcpPlugin(options: McpPluginOptions): LocalPlugin {
  const pluginId = options.pluginId ?? "guga-mcp";
  const clients: McpStdioClient[] = [];
  return {
    id: pluginId,
    name: "Guga MCP",
    async init(context) {
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
              client
            }), {
              source: "mcp",
              namespace: server.name
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
  };
}

function closeClients(clients: McpStdioClient[]): void {
  for (const client of clients.splice(0)) {
    client.close();
  }
}
