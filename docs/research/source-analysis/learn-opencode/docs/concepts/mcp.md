# Model Context Protocol (MCP)

> OpenCode 作为 MCP Client，动态连接外部工具服务器，无限扩展 Agent 能力。

## 1. 协议介绍

### 1.1 什么是 MCP？

**Model Context Protocol (MCP)** 是一个**开放标准**，用于连接 AI 应用与外部工具/数据源。

```
问题: AI Agent 需要访问各种外部系统
  → Jira 任务
  → Slack 消息
  → PostgreSQL 数据库
  → GitHub 仓库
  → 文件系统
  → ...

传统方案: 为每个系统编写专用集成
  ❌ 重复劳动
  ❌ 难以维护
  ❌ 无法复用

MCP 方案: 标准化的工具协议
  ✅ MCP Server 封装工具
  ✅ MCP Client 自动发现和调用
  ✅ 社区生态共享
```

### 1.2 核心概念

| 概念 | 说明 | 示例 |
|------|------|------|
| **MCP Server** | 提供工具的服务端 | `@modelcontextprotocol/server-filesystem` |
| **MCP Client** | 调用工具的客户端 | OpenCode (本项目) |
| **Tool** | 可被 AI 调用的函数 | `read_file`, `list_directory` |
| **Resource** | 可被 AI 访问的数据 | 文件内容、数据库记录 |
| **Prompt** | 预定义的提示模板 | "Analyze this codebase" |

### 1.3 与其他协议的关系

```mermaid
graph TB
    subgraph OpenCode
        Agent[OpenCode Agent]
    end
    
    subgraph MCP[MCP - 工具扩展层]
        Agent -->|MCP Client| FS[Filesystem Server]
        Agent -->|MCP Client| DB[PostgreSQL Server]
        Agent -->|MCP Client| Slack[Slack Server]
        Agent -->|MCP Client| Custom[自定义 Server]
    end
    
    subgraph External[外部系统]
        FS -->|读写| Files[文件系统]
        DB -->|查询| Database[数据库]
        Slack -->|API| SlackAPI[Slack API]
        Custom -->|...| Any[任何系统]
    end
    
    style MCP fill:#9ff
```

---

## 2. OpenCode 作为 MCP Client

### 2.1 架构概览

OpenCode 实现了完整的 **MCP Client**，支持多种传输方式：

```mermaid
sequenceDiagram
    participant Agent as OpenCode Agent
    participant MCP as MCP Client
    participant Server as MCP Server
    participant System as 外部系统
    
    Agent->>MCP: 初始化
    MCP->>Server: connect()
    Server-->>MCP: 连接成功
    
    MCP->>Server: listTools()
    Server-->>MCP: [read_file, write_file, ...]
    
    Agent->>MCP: 获取可用工具
    MCP-->>Agent: 转换为 AI SDK Tools
    
    Agent->>MCP: 调用工具 read_file
    MCP->>Server: callTool({name: "read_file", args: {...}})
    Server->>System: 读取文件
    System-->>Server: 文件内容
    Server-->>MCP: {content: "..."}
    MCP-->>Agent: 返回结果
```

### 2.2 实现位置

```
packages/opencode/src/mcp/
├── index.ts            # MCP Client 核心逻辑 (26,626 行)
├── auth.ts             # OAuth 认证管理 (4,362 行)
├── oauth-provider.ts   # OAuth Provider 抽象 (4,852 行)
└── oauth-callback.ts   # OAuth 回调处理 (6,221 行)
```

---

## 3. 核心实现分析

### 3.1 MCP Client 初始化

**文件**: `src/mcp/index.ts`

```typescript
// MCP 命名空间
export namespace MCP {
  // 支持的传输方式
  type TransportType = 
    | StdioClientTransport      // 标准输入输出 (本地进程)
    | SSEClientTransport         // Server-Sent Events (远程 HTTP)
    | StreamableHTTPClientTransport  // HTTP 流式

  // 初始化 MCP Client
  async function createClient(config: {
    name: string          // Server 名称
    command?: string[]    // Stdio: 启动命令
    url?: string          // SSE/HTTP: 服务器 URL
    headers?: Record<string, string>  // HTTP 请求头
  }): Promise<MCPClient> {
    let transport: TransportType
    
    // 1. 根据配置选择传输方式
    if (config.command) {
      // Stdio: 启动本地子进程
      transport = new StdioClientTransport({
        command: config.command[0],
        args: config.command.slice(1),
      })
    } else if (config.url) {
      if (config.url.endsWith('/sse')) {
        // SSE: 服务端推送
        transport = new SSEClientTransport(new URL(config.url))
      } else {
        // HTTP: 流式请求
        transport = new StreamableHTTPClientTransport(new URL(config.url))
      }
    }
    
    // 2. 创建 MCP Client
    const client = new Client({
      name: "opencode",
      version: Installation.VERSION,
    }, {
      capabilities: {
        roots: { listChanged: true },  // 支持根目录变更通知
      }
    })
    
    // 3. 连接到 Server
    await client.connect(transport)
    
    // 4. 注册通知处理器
    registerNotificationHandlers(client, config.name)
    
    return client
  }
}
```

### 3.2 工具转换机制

MCP 工具定义需要转换为 **Vercel AI SDK** 的 Tool 格式：

```typescript
// 核心转换函数
async function convertMcpTool(mcpTool: MCPToolDef, client: MCPClient): Promise<Tool> {
  // 1. 获取 MCP 工具的 JSON Schema
  const inputSchema = mcpTool.inputSchema
  
  // 2. 规范化 Schema (确保 type 为 object)
  const schema: JSONSchema7 = {
    ...inputSchema,
    type: "object",
    properties: inputSchema.properties ?? {},
    additionalProperties: false,
  }
  
  // 3. 创建 AI SDK dynamicTool
  return dynamicTool({
    description: mcpTool.description ?? "",
    inputSchema: jsonSchema(schema),  // Zod Schema → JSON Schema
    
    // 4. 执行函数：转发给 MCP Server
    execute: async (args: unknown) => {
      return client.callTool({
        name: mcpTool.name,
        arguments: args as Record<string, unknown>,
      })
    },
  })
}
```

**数据流向**:
```
LLM 请求 → AI SDK Tool → MCP Client → MCP Server → 外部系统
                ↓
        convertMcpTool 转换
```

### 3.3 工具注册流程

```typescript
// 从 MCP Server 获取并注册工具
export async function tools(): Promise<Tool[]> {
  const config = await Config.get()
  const mcpServers = config.mcp ?? {}
  
  const allTools: Tool[] = []
  
  // 遍历所有配置的 MCP Server
  for (const [name, serverConfig] of Object.entries(mcpServers)) {
    try {
      // 1. 创建 MCP Client
      const client = await createClient({
        name,
        command: serverConfig.command,
        url: serverConfig.url,
        headers: serverConfig.headers,
      })
      
      // 2. 列出所有工具
      const { tools } = await client.listTools()
      
      // 3. 转换为 AI SDK Tools
      for (const mcpTool of tools) {
        const tool = await convertMcpTool(mcpTool, client)
        
        // 添加命名空间前缀（避免冲突）
        tool.id = `${name}.${mcpTool.name}`
        
        allTools.push(tool)
      }
      
      log.info("MCP server loaded", { 
        name, 
        toolCount: tools.length 
      })
      
    } catch (error) {
      log.error("Failed to load MCP server", { name, error })
    }
  }
  
  return allTools
}
```

---

## 4. 传输层支持

### 4.1 Stdio Transport (本地进程)

**使用场景**: 本地安装的 MCP Server

```typescript
// 配置示例
{
  "mcp": {
    "filesystem": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-filesystem", "/Users/me/data"]
    }
  }
}
```

**工作原理**:
```mermaid
graph LR
    OpenCode -->|stdin| MCPServer[MCP Server 进程]
    MCPServer -->|stdout| OpenCode
    MCPServer -->|操作| FileSystem[文件系统]
```

**代码实现**:
```typescript
// 创建 Stdio Transport
const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/data"],
})

// 连接
await client.connect(transport)
```

### 4.2 SSE Transport (Server-Sent Events)

**使用场景**: 远程 MCP Server (只读)

```typescript
// 配置示例
{
  "mcp": {
    "remote-tools": {
      "type": "remote",
      "url": "https://mcp.example.com/sse",
      "headers": {
        "Authorization": "Bearer xxx"
      }
    }
  }
}
```

**工作原理**:
```mermaid
sequenceDiagram
    participant OpenCode
    participant Server as MCP Server (远程)
    
    OpenCode->>Server: GET /sse (建立 SSE 连接)
    Server-->>OpenCode: SSE: tool list
    
    OpenCode->>Server: POST /call (调用工具)
    Server-->>OpenCode: tool result
    
    Server-->>OpenCode: SSE: notification (工具列表变更)
```

### 4.3 HTTP Transport (流式)

**使用场景**: 支持双向流的远程 MCP Server

```typescript
// 配置示例
{
  "mcp": {
    "advanced-server": {
      "type": "remote",
      "url": "https://mcp.example.com",
    }
  }
}
```

---

## 5. OAuth 认证流程

很多 MCP Server 需要 OAuth 认证（如 Slack、GitHub）。

### 5.1 OAuth 数据结构

```typescript
// src/mcp/auth.ts
export namespace McpAuth {
  // OAuth Tokens
  export const Tokens = z.object({
    accessToken: z.string(),
    refreshToken: z.string().optional(),
    expiresAt: z.number().optional(),
    scope: z.string().optional(),
  })
  
  // OAuth Client Info
  export const ClientInfo = z.object({
    clientId: z.string(),
    clientSecret: z.string().optional(),
    clientIdIssuedAt: z.number().optional(),
    clientSecretExpiresAt: z.number().optional(),
  })
  
  // 完整的认证条目
  export const Entry = z.object({
    tokens: Tokens.optional(),
    clientInfo: ClientInfo.optional(),
    codeVerifier: z.string().optional(),    // PKCE
    oauthState: z.string().optional(),
    serverUrl: z.string().optional(),
  })
}
```

### 5.2 OAuth 完整流程

```mermaid
sequenceDiagram
    participant User
    participant OpenCode
    participant MCP as MCP Server
    participant OAuth as OAuth Provider
    
    User->>OpenCode: 连接到 MCP Server
    OpenCode->>MCP: connect()
    MCP-->>OpenCode: 401 Unauthorized (需要认证)
    
    OpenCode->>MCP: 获取 OAuth 配置
    MCP-->>OpenCode: {authorizationUrl, tokenUrl, ...}
    
    OpenCode->>User: 打开浏览器
    User->>OAuth: 授权
    OAuth-->>OpenCode: 回调 (code)
    
    OpenCode->>MCP: 交换 Token
    MCP->>OAuth: exchange code
    OAuth-->>MCP: access_token
    MCP-->>OpenCode: tokens
    
    OpenCode->>OpenCode: 保存 tokens (mcp-auth.json)
    OpenCode->>MCP: 使用 access_token 连接
    MCP-->>OpenCode: 连接成功
```

### 5.3 代码实现

```typescript
// src/mcp/index.ts (简化)
async function handleOAuthFlow(
  client: MCPClient,
  serverName: string,
  serverUrl: string
) {
  try {
    // 1. 尝试连接
    await client.connect(transport)
  } catch (error) {
    if (!(error instanceof UnauthorizedError)) {
      throw error  // 非认证错误，直接抛出
    }
    
    // 2. 需要 OAuth 认证
    log.info("MCP server requires OAuth", { serverName })
    
    // 3. 检查已保存的 tokens
    const savedAuth = await McpAuth.getForUrl(serverName, serverUrl)
    
    if (savedAuth?.tokens) {
      // 使用已保存的 tokens
      await client.connect(transport)
      return
    }
    
    // 4. 启动 OAuth 流程
    // 打开浏览器，用户授权
    await open(authorizationUrl)
    
    // 5. 等待回调
    const { code } = await waitForCallback()
    
    // 6. 交换 Token
    const tokens = await client.exchangeOAuthCode(code)
    
    // 7. 保存 Tokens
    await McpAuth.set(serverName, { tokens }, serverUrl)
    
    // 8. 重新连接
    await client.connect(transport)
  }
}
```

---

## 6. 通知处理

MCP Server 可以主动通知 Client（例如工具列表变更）。

### 6.1 注册通知处理器

```typescript
// src/mcp/index.ts
function registerNotificationHandlers(client: MCPClient, serverName: string) {
  // 监听 tools/list_changed 通知
  client.setNotificationHandler(
    ToolListChangedNotificationSchema, 
    async () => {
      log.info("tools list changed", { server: serverName })
      
      // 发布事件，触发工具重新加载
      Bus.publish(MCP.ToolsChanged, { server: serverName })
    }
  )
}
```

### 6.2 动态工具重载

```typescript
// 订阅工具变更事件
Bus.subscribe(MCP.ToolsChanged, async (event) => {
  const serverName = event.properties.server
  
  // 重新获取该 Server 的工具列表
  const client = getClient(serverName)
  const { tools } = await client.listTools()
  
  // 更新工具注册表
  await ToolRegistry.reload({ server: serverName, tools })
})
```

---

## 7. 配置示例

### 7.1 本地 Filesystem Server

```json
{
  "mcp": {
    "filesystem": {
      "command": ["npx", "-y", "@modelcontextprotocol/server-filesystem", "/Users/me/Documents"],
      "enabled": true
    }
  }
}
```

**效果**:
- Agent 可以读写 `/Users/me/Documents` 下的文件
- 工具: `filesystem.read_file`, `filesystem.write_file`, `filesystem.list_directory`, ...

### 7.2 PostgreSQL Server

```json
{
  "mcp": {
    "database": {
      "command": ["npx", "-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "POSTGRES_CONNECTION_STRING": "postgresql://user:pass@localhost/mydb"
      },
      "enabled": true
    }
  }
}
```

**效果**:
- Agent 可以查询和修改数据库
- 工具: `database.query`, `database.execute`, `database.list_tables`, ...

### 7.3 远程 MCP Server (SSE)

```json
{
  "mcp": {
    "custom-tools": {
      "url": "https://my-mcp-server.com/sse",
      "headers": {
        "Authorization": "Bearer my-secret-token"
      },
      "enabled": true
    }
  }
}
```

### 7.4 Slack Server (OAuth)

```json
{
  "mcp": {
    "slack": {
      "command": ["npx", "-y", "@modelcontextprotocol/server-slack"],
      "enabled": true
    }
  }
}
```

**首次使用**:
1. OpenCode 尝试连接
2. 检测到需要 OAuth
3. 打开浏览器，用户授权 Slack
4. 保存 access_token 到 `~/.opencode/data/mcp-auth.json`
5. 后续自动使用已保存的 token

---

## 8. 常见 MCP Servers

### 8.1 官方 Servers

| Server | 功能 | 安装 |
|--------|------|------|
| **filesystem** | 文件系统操作 | `npx @modelcontextprotocol/server-filesystem` |
| **postgres** | PostgreSQL 数据库 | `npx @modelcontextprotocol/server-postgres` |
| **slack** | Slack 集成 | `npx @modelcontextprotocol/server-slack` |
| **github** | GitHub API | `npx @modelcontextprotocol/server-github` |
| **puppeteer** | 浏览器自动化 | `npx @modelcontextprotocol/server-puppeteer` |

### 8.2 社区 Servers

- **Firebase** - Firestore 数据库操作
- **AWS S3** - 云存储访问
- **Jira** - 任务管理
- **Google Calendar** - 日历事件
- **Stripe** - 支付处理

---

## 9. 实战场景

### 场景 1: 让 Agent 访问 PostgreSQL

```json
// opencode.json
{
  "mcp": {
    "mydb": {
      "command": ["npx", "-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "POSTGRES_CONNECTION_STRING": "postgresql://localhost/myapp"
      }
    }
  }
}
```

**使用**:
```
用户: 查询最近 10 个注册的用户

Agent: 我会使用数据库查询工具
  → 调用 mydb.query({ sql: "SELECT * FROM users ORDER BY created_at DESC LIMIT 10" })
  → 返回结果并展示
```

### 场景 2: 让 Agent 发送 Slack 消息

```json
{
  "mcp": {
    "slack": {
      "command": ["npx", "-y", "@modelcontextprotocol/server-slack"]
    }
  }
}
```

**使用**:
```
用户: 在 #engineering 频道发送"部署完成"

Agent: 
  → 调用 slack.send_message({ channel: "#engineering", text: "部署完成" })
  → 消息已发送
```

### 场景 3: 自定义 MCP Server

**创建简单的 MCP Server**:

```typescript
// my-mcp-server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"

const server = new Server({
  name: "my-tools",
  version: "1.0.0",
}, {
  capabilities: {
    tools: {}
  }
})

// 注册工具
server.setRequestHandler("tools/list", async () => {
  return {
    tools: [
      {
        name: "get_weather",
        description: "获取天气信息",
        inputSchema: {
          type: "object",
          properties: {
            city: { type: "string", description: "城市名称" }
          },
          required: ["city"]
        }
      }
    ]
  }
})

server.setRequestHandler("tools/call", async (request) => {
  if (request.params.name === "get_weather") {
    const city = request.params.arguments.city
    // 调用天气 API...
    return {
      content: [
        {
          type: "text",
          text: `${city} 今天晴天，25°C`
        }
      ]
    }
  }
})

// 启动
const transport = new StdioServerTransport()
await server.connect(transport)
```

**在 OpenCode 中使用**:

```json
{
  "mcp": {
    "weather": {
      "command": ["bun", "run", "./my-mcp-server.ts"]
    }
  }
}
```

---

## 10. 状态管理

### 10.1 连接状态

```typescript
// src/mcp/index.ts
export const Status = z.discriminatedUnion("status", [
  z.object({ status: z.literal("connected") }),
  z.object({ status: z.literal("disabled") }),
  z.object({ status: z.literal("failed"), error: z.string() }),
  z.object({ status: z.literal("needs_auth") }),
  z.object({ status: z.literal("needs_client_registration"), error: z.string() }),
])
```

**状态流转**:
```mermaid
stateDiagram-v2
    [*] --> Connecting: 初始化
    Connecting --> Connected: 连接成功
    Connecting --> NeedsAuth: 需要认证
    Connecting --> Failed: 连接失败
    
    NeedsAuth --> Connecting: OAuth 完成
    NeedsAuth --> Failed: 认证失败
    
    Connected --> Disconnected: 断开
    Failed --> [*]
    Disconnected --> [*]
```

---

## 11. 常见陷阱与最佳实践

### ❌ 陷阱 1: 忘记处理 OAuth

**错误做法**:
```json
{
  "mcp": {
    "slack": {
      "command": ["npx", "-y", "@modelcontextprotocol/server-slack"]
    }
  }
}
```
```
结果: UnauthorizedError - 第一次使用会失败
```

**正确做法**:
```typescript
// OpenCode 已内置 OAuth 处理
// 首次连接会自动:
// 1. 打开浏览器
// 2. 用户授权
// 3. 保存 token
// 4. 后续自动使用
```

### ❌ 陷阱 2: 工具名称冲突

**问题**:
```json
{
  "mcp": {
    "server1": { "command": [...] },  // 提供 read_file
    "server2": { "command": [...] }   // 也提供 read_file
  }
}
```

**解决方案**:
```typescript
// OpenCode 自动添加命名空间前缀
// server1.read_file
// server2.read_file
```

### ✅ 最佳实践 1: 明确工具范围

```json
{
  "mcp": {
    "work-files": {
      "command": ["npx", "-y", "@modelcontextprotocol/server-filesystem", "/work"],
      "description": "Work documents only"
    },
    "personal-files": {
      "command": ["npx", "-y", "@modelcontextprotocol/server-filesystem", "/personal"],
      "description": "Personal documents"
    }
  }
}
```

### ✅ 最佳实践 2: 使用环境变量

```json
{
  "mcp": {
    "database": {
      "command": ["npx", "-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "POSTGRES_CONNECTION_STRING": "${DATABASE_URL}"
      }
    }
  }
}
```

---

## 12. 总结

MCP 协议让 OpenCode 能够**无限扩展工具能力**：

### 核心特性
- ✅ **标准化**: 基于 `@modelcontextprotocol/sdk`
- ✅ **多传输**: Stdio、SSE、HTTP
- ✅ **OAuth 支持**: 自动处理认证流程
- ✅ **动态加载**: 工具列表变更自动更新
- ✅ **命名空间**: 避免工具名称冲突

### 关键实现
- **convertMcpTool**: MCP Tool → AI SDK Tool
- **OAuth 流程**: 浏览器授权 + Token 管理
- **通知处理**: 动态工具重载
- **传输抽象**: 支持多种连接方式

### 生态系统
```mermaid
graph TB
    OpenCode[OpenCode Agent] --> MCP1[Filesystem]
    OpenCode --> MCP2[PostgreSQL]
    OpenCode --> MCP3[Slack]
    OpenCode --> MCP4[GitHub]
    OpenCode --> MCP5[Custom...]
    
    MCP1 --> Files[文件系统]
    MCP2 --> DB[数据库]
    MCP3 --> SlackAPI[Slack API]
    MCP4 --> GitHubAPI[GitHub API]
    MCP5 --> Any[任何系统]
```

**下一步**: 阅读 [LSP 协议](./lsp.md) 了解代码智能功能
