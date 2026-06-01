# @guga-agent/plugin-mcp 用法

## 用途

`@guga-agent/plugin-mcp` 是 Guga 的第一方 MCP 扩展。它连接到已配置的 stdio MCP server，列出它们的工具，并将每个 server tool 注册为常规 Guga `ToolDefinition`。

## 导入

```ts
import {
  McpStdioClient,
  createMcpExtension,
  createMcpPlugin,
  mcpToolName
} from "@guga-agent/plugin-mcp";
```

## 主要 API

- `createMcpExtension(options)`: MCP extension 注册的首选 factory。
- `createMcpPlugin(options)`: 兼容性 alias。
- `McpStdioClient`: 低层 stdio MCP client。
- `createMcpToolDefinition(options)`: 将 MCP tool metadata 和调用适配为 Guga tool。
- `mcpToolName(serverName, toolName)`: 返回类似 `mcp__server__tool` 的规范化名称。
- `stringifyMcpToolResult(result)`: 格式化 MCP tool output。
- 类型：`McpPluginOptions`、`McpServerConfig`、`McpCallToolResult`、`McpClientInfo` 和 `McpToolInfo`。

## 常见用法

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

## 参数说明

- `createMcpExtension(options)` 和 `createMcpPlugin(options)` 都使用 `McpPluginOptions`。`servers` 为必填数组，列出要连接的 MCP server；`pluginId` 可选，用于覆盖默认插件 id。
- `McpServerConfig` 的 `name` 和 `command` 为必填字段。`name` 用作工具 namespace 和依赖名称；`command` 是要启动的 stdio server 命令；`args`、`cwd` 和 `env` 可选，分别用于命令参数、工作目录和环境变量覆盖。
- `new McpStdioClient(options)` 使用与 server 配置相同的 stdio 字段，并额外支持可选 `clientInfo`，用于初始化握手中的 client 名称与版本。
- `createMcpToolDefinition(options)` 需要 `serverName`、`tool` 和 `client`。`tool` 使用 `McpToolInfo`，其中 `name` 必填，`description` 和 `inputSchema` 可选。
- `mcpToolName(serverName, toolName)` 接收原始 server/tool 名称并返回规范化工具名；`stringifyMcpToolResult(result)` 接收 `McpCallToolResult` 并输出字符串内容。

## 注意事项

- 该包目前只支持 stdio transport。SSE、HTTP、OAuth 和 remote auth cache 尚未在这里实现。
- 注册的 MCP tool 使用 `source: "mcp"`、`layer: "extension"`，并将 MCP server name 作为 namespace。
- Shutdown 会关闭已连接的 client，并移除 extension 拥有的 tool。
- 一些低层 client option 类型有意不从 package root 导出。

## 相关包

- `@guga-agent/core` 会通过与常规 tool 相同的 permission、hook、event 和 result-policy 路径执行 MCP tool。
- `@guga-agent/extension-sdk` 提供 extension 生命周期 facade。
