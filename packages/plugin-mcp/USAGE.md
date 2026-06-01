# @guga-agent/plugin-mcp Usage

## Purpose

`@guga-agent/plugin-mcp` is the first-party MCP extension for Guga. It connects to configured stdio MCP servers, lists their tools, and registers each server tool as a normal Guga `ToolDefinition`.

## Import

```ts
import {
  McpStdioClient,
  createMcpExtension,
  createMcpPlugin,
  mcpToolName
} from "@guga-agent/plugin-mcp";
```

## Main APIs

- `createMcpExtension(options)`: preferred factory for MCP extension registration.
- `createMcpPlugin(options)`: compatibility alias.
- `McpStdioClient`: low-level stdio MCP client.
- `createMcpToolDefinition(options)`: adapts MCP tool metadata and calls into a Guga tool.
- `mcpToolName(serverName, toolName)`: returns normalized names like `mcp__server__tool`.
- `stringifyMcpToolResult(result)`: formats MCP tool output.
- Types: `McpPluginOptions`, `McpServerConfig`, `McpCallToolResult`, `McpClientInfo`, and `McpToolInfo`.

## Common Usage

```ts
const runtime = createAgentRuntime({
  plugins: [
    createMcpExtension({
      servers: [
        {
          name: "filesystem",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", process.cwd()]
        }
      ]
    })
  ]
});
```

## Parameters

- `createMcpExtension(options)` and `createMcpPlugin(options)` require `servers`, an array of MCP stdio server configs. Optional `pluginId` overrides the registered extension id.
- Each `McpServerConfig` requires `name` and `command`. Optional `args`, `cwd`, and `env` are passed to the spawned process; `env` is merged over `process.env`.
- `new McpStdioClient(options)` uses the same stdio process fields and also accepts optional `clientInfo` for the MCP initialize request.
- `createMcpToolDefinition(options)` requires `serverName`, MCP `tool` metadata, and a connected `client`. Tool metadata may include optional `description` and `inputSchema`; missing schemas become permissive object schemas.
- `mcpToolName(serverName, toolName)` requires both names and sanitizes non-alphanumeric characters to `_`.
- `stringifyMcpToolResult(result)` accepts an MCP call result and joins text content when possible, falling back to JSON for structured parts.

## Notes

- This package currently supports stdio transport only. SSE, HTTP, OAuth, and remote auth caches are not implemented here.
- Registered MCP tools use `source: "mcp"`, `layer: "extension"`, and the MCP server name as namespace.
- Shutdown closes connected clients and removes extension-owned tools.
- Some low-level client option types are intentionally not exported from the package root.

## Related Packages

- `@guga-agent/core` executes MCP tools through the same permission, hook, event, and result-policy path as normal tools.
- `@guga-agent/extension-sdk` supplies the extension lifecycle facade.
