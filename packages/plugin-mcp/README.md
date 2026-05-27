# @guga-agent/plugin-mcp

First-party MCP plugin for Guga Agent.

This package implements the M6 stdio-only MCP boundary. It connects to configured MCP servers, lists tools, and registers each server tool as a normal Guga `ToolDefinition` so calls still flow through core permission, hook, result, event, and audit machinery.

```ts
import { createAgentRuntime } from "@guga-agent/core";
import { createMcpPlugin } from "@guga-agent/plugin-mcp";

const runtime = createAgentRuntime({
  plugins: [
    createMcpPlugin({
      servers: [{
        name: "filesystem",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", process.cwd()]
      }]
    })
  ]
});
```

## Naming

MCP tools are normalized as:

```text
mcp__server__tool
```

For M6, only stdio transport is supported. SSE, WebSocket, HTTP, OAuth, remote auth cache, and IDE-specific allowlists are deferred to later production/host protocol work.
