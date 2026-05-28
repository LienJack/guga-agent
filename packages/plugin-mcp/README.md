# @guga-agent/plugin-mcp

First-party MCP extension for Guga Agent.

This package implements the stdio-only MCP boundary as a Guga extension. It connects to configured MCP servers, lists tools, and registers each server tool as a normal Guga `ToolDefinition` so calls still flow through core permission, hook, result, event, and audit machinery.

```ts
import { createAgentRuntime } from "@guga-agent/core";
import { createMcpExtension } from "@guga-agent/plugin-mcp";

const runtime = createAgentRuntime({
  plugins: [
    createMcpExtension({
      servers: [{
        name: "filesystem",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", process.cwd()]
      }]
    })
  ]
});
```

`createMcpPlugin()` remains as a compatibility alias for existing hosts.

## Naming

MCP tools are normalized as:

```text
mcp__server__tool
```

For M6, only stdio transport is supported. SSE, WebSocket, HTTP, OAuth, remote auth cache, and IDE-specific allowlists are deferred to later production/host protocol work.

## Discovery

MCP tools register with `source: "mcp"` and `layer: "extension"`. Descriptor metadata records the extension owner, MCP server namespace, declared process/network effects, permission requirements, dependencies, and lifecycle policy. Shutdown closes connected clients and removes extension-owned tools from discovery.
