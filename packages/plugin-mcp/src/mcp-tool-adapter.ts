import type { ToolDefinition } from "@guga-agent/core";
import type { McpCallToolResult, McpStdioClient, McpToolInfo } from "./mcp-stdio-client";

const MAX_MCP_DESCRIPTION_LENGTH = 2048;

export function mcpToolName(serverName: string, toolName: string): string {
  return `mcp__${sanitizeToolPart(serverName)}__${sanitizeToolPart(toolName)}`;
}

export function createMcpToolDefinition(options: {
  serverName: string;
  tool: McpToolInfo;
  client: McpStdioClient;
}): ToolDefinition {
  return {
    name: mcpToolName(options.serverName, options.tool.name),
    description: truncateDescription(options.tool.description ?? `MCP tool ${options.tool.name} from ${options.serverName}`),
    inputSchema: options.tool.inputSchema ?? { type: "object", additionalProperties: true },
    effect: "external",
    runtime: {
      source: {
        kind: "mcp",
        debugName: options.serverName
      }
    },
    async execute(input) {
      const result = await options.client.callTool(options.tool.name, input);
      if (result.isError) {
        return {
          ok: false,
          error: {
            code: "MCP_TOOL_ERROR",
            message: stringifyMcpToolResult(result)
          }
        };
      }
      return {
        ok: true,
        content: stringifyMcpToolResult(result),
        metadata: { serverName: options.serverName, toolName: options.tool.name }
      };
    }
  };
}

export function stringifyMcpToolResult(result: McpCallToolResult): string {
  if (!Array.isArray(result.content)) {
    return JSON.stringify(result);
  }
  return result.content.map((item) => {
    if (isObject(item) && item.type === "text" && typeof item.text === "string") {
      return item.text;
    }
    return JSON.stringify(item);
  }).join("\n");
}

function truncateDescription(description: string): string {
  return description.length > MAX_MCP_DESCRIPTION_LENGTH
    ? description.slice(0, MAX_MCP_DESCRIPTION_LENGTH)
    : description;
}

function sanitizeToolPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
