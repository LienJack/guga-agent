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

## Notes

- This package currently supports stdio transport only. SSE, HTTP, OAuth, and remote auth caches are not implemented here.
- Registered MCP tools use `source: "mcp"`, `layer: "extension"`, and the MCP server name as namespace.
- Shutdown closes connected clients and removes extension-owned tools.
- Some low-level client option types are intentionally not exported from the package root.

## Related Packages

- `@guga-agent/core` executes MCP tools through the same permission, hook, event, and result-policy path as normal tools.
- `@guga-agent/extension-sdk` supplies the extension lifecycle facade.
