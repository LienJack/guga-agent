# 案例 02: 集成 MCP Server

> 学会通过 MCP 协议扩展 Agent 的工具能力。

---

## 场景

你的项目需要访问外部系统（如数据库、API、文件服务器），你想让 Agent 能够：
- ✅ 查询 PostgreSQL 数据库
- ✅ 读取远程文件系统
- ✅ 调用第三方 API

通过 MCP (Model Context Protocol)，你可以轻松实现这些功能。

---

## 目标

学完本案例后，你将能够：
- ✅ 理解 MCP 协议的基本概念
- ✅ 配置现有的 MCP Server
- ✅ 开发自定义 MCP Server
- ✅ 在 Agent 中使用 MCP 工具

---

## 前置知识

- [快速入门](../getting-started.md) - 了解基本概念
- [MCP 协议](../concepts/mcp.md) - MCP 协议详解

预计时间：**30 分钟**

---

## 步骤 1: 使用现有 MCP Server

### 1.1 安装 OpenCode MCP Filesystem Server

```bash
# 安装官方文件系统 MCP Server
npm install -g @modelcontextprotocol/server-filesystem
```

### 1.2 配置 opencode.json

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/path/to/allowed/directory"
      ],
      "env": {
        "ALLOWED_DIRECTORIES": "/path/to/allowed/directory"
      }
    }
  }
}
```

### 1.3 测试 MCP Server

```bash
opencode run

# Agent 现在可以使用文件系统工具了
> 读取 /path/to/allowed/directory/config.json
```

---

## 步骤 2: 配置 PostgreSQL MCP Server

### 2.1 安装 PostgreSQL MCP Server

```bash
npm install -g @modelcontextprotocol/server-postgres
```

### 2.2 配置数据库连接

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://user:password@localhost:5432/mydb"
      ],
      "env": {
        "DATABASE_URL": "postgresql://user:password@localhost:5432/mydb"
      }
    }
  }
}
```

### 2.3 测试数据库查询

```bash
opencode run

> 查询用户表的前10条记录
```

Agent 会自动调用 MCP 提供的数据库工具。

---

## 步骤 3: 开发自定义 MCP Server

### 3.1 初始化项目

```bash
mkdir my-mcp-server
cd my-mcp-server
npm init -y

npm install @modelcontextprotocol/sdk zod
```

### 3.2 创建 Server

`index.ts`:

```typescript
#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"

// 创建 Server 实例
const server = new Server(
  {
    name: "my-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

// 定义工具
const tools = [
  {
    name: "calculate",
    description: "执行数学计算",
    inputSchema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "数学表达式，例如：2 + 3 * 4",
        },
      },
      required: ["expression"],
    },
  },
]

// 列出工具
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}))

// 执行工具
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  if (name === "calculate") {
    try {
      // 简单的数学计算（生产环境应使用更安全的库）
      const expression = args.expression as string
      const result = eval(expression) // 注意：生产环境不要使用 eval

      return {
        content: [
          {
            type: "text",
            text: `${expression} = ${result}`,
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `计算错误: ${error}`,
          },
        ],
        isError: true,
      }
    }
  }

  return {
    content: [
      {
        type: "text",
        text: `未知工具: ${name}`,
      },
    ],
    isError: true,
  }
})

// 启动 Server
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("My MCP Server running on stdio")
}

main().catch(console.error)
```

### 3.3 配置 opencode.json

```json
{
  "mcpServers": {
    "calculator": {
      "command": "node",
      "args": ["/path/to/my-mcp-server/index.ts"],
      "cwd": "/path/to/my-mcp-server"
    }
  }
}
```

### 3.4 测试自定义 Server

```bash
opencode run

> 计算 2 + 3 * 4
```

---

## 步骤 4: 高级 MCP Server 功能

### 4.1 添加资源 (Resources)

资源是 MCP Server 提供的数据。

```typescript
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"

// 定义资源
const resources = [
  {
    uri: "config://app",
    name: "应用配置",
    description: "读取应用配置",
    mimeType: "application/json",
  },
]

// 列出资源
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources,
}))

// 读取资源
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params

  if (uri === "config://app") {
    const config = {
      appName: "MyApp",
      version: "1.0.0",
      features: ["feature1", "feature2"],
    }

    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(config, null, 2),
        },
      ],
    }
  }

  throw new Error(`未知资源: ${uri}`)
})
```

### 4.2 添加提示 (Prompts)

提示是预定义的 Prompt 模板。

```typescript
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"

// 定义提示
const prompts = [
  {
    name: "analyze-config",
    description: "分析应用配置",
    arguments: [
      {
        name: "config",
        description: "配置 JSON",
        required: true,
      },
    ],
  },
]

// 列出提示
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts,
}))

// 获取提示
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  if (name === "analyze-config") {
    const config = args.config as string

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `请分析以下应用配置：\n\n${config}\n\n提供改进建议。`,
          },
        },
      ],
    }
  }

  throw new Error(`未知提示: ${name}`)
})
```

---

## 完整代码

### MCP Server (index.ts)

```typescript
#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"

const server = new Server(
  {
    name: "my-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
)

// 工具
const tools = [
  {
    name: "calculate",
    description: "执行数学计算",
    inputSchema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "数学表达式",
        },
      },
      required: ["expression"],
    },
  },
]

// 资源
const resources = [
  {
    uri: "config://app",
    name: "应用配置",
    description: "读取应用配置",
    mimeType: "application/json",
  },
]

// 提示
const prompts = [
  {
    name: "analyze-config",
    description: "分析应用配置",
    arguments: [
      {
        name: "config",
        description: "配置 JSON",
        required: true,
      },
    ],
  },
]

// 处理请求
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }))
server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources }))
server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts }))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  if (name === "calculate") {
    try {
      const result = eval(args.expression as string)
      return {
        content: [{ type: "text", text: `${args.expression} = ${result}` }],
      }
    } catch (error) {
      return {
        content: [{ type: "text", text: `计算错误: ${error}` }],
        isError: true,
      }
    }
  }

  return {
    content: [{ type: "text", text: `未知工具: ${name}` }],
    isError: true,
  }
})

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params

  if (uri === "config://app") {
    return {
      contents: [{
        uri,
        mimeType: "application/json",
        text: JSON.stringify({ appName: "MyApp", version: "1.0.0" }, null, 2),
      }],
    }
  }

  throw new Error(`未知资源: ${uri}`)
})

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  if (name === "analyze-config") {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `请分析以下配置：\n\n${args.config}\n\n提供改进建议。`,
          },
        },
      ],
    }
  }

  throw new Error(`未知提示: ${name}`)
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("My MCP Server running on stdio")
}

main().catch(console.error)
```

### opencode.json

```json
{
  "mcpServers": {
    "calculator": {
      "command": "node",
      "args": ["index.ts"],
      "cwd": "/path/to/my-mcp-server"
    }
  }
}
```

---

## 原理解析

### MCP 架构

```mermaid
graph TB
    subgraph OpenCode
        Agent[Agent]
    end
    
    subgraph MCP[MCP Client]
        Agent -->|调用工具| MCPClient[MCP Client]
    end
    
    subgraph MCPServers[MCP Servers]
        MCPClient -->|stdio| Server1[Calculator Server]
        MCPClient -->|stdio| Server2[Database Server]
        MCPClient -->|stdio| Server3[Filesystem Server]
    end
    
    subgraph Systems
        Server1 -->|访问| System1[本地计算]
        Server2 -->|访问| System2[数据库]
        Server3 -->|访问| System3[文件系统]
    end
```

### 通信协议

MCP Server 通过 stdio 与 OpenCode 通信：

```
[OpenCode] --stdin--> [MCP Server]
[OpenCode] <--stdout-- [MCP Server]
[OpenCode] <--stderr-- [MCP Server - 日志]
```

### 工具执行流程

```mermaid
sequenceDiagram
    participant User
    participant Agent
    participant MCP
    participant Server
    participant System
    
    User->>Agent: "计算 2 + 3"
    Agent->>MCP: 列出工具
    MCP->>Server: list_tools
    Server-->>MCP: [calculate, ...]
    MCP-->>Agent: 可用工具
    
    Agent->>MCP: 调用 calculate("2+3")
    MCP->>Server: call_tool({name: "calculate", args: {expression: "2+3"}})
    Server->>System: 执行计算
    System-->>Server: 5
    Server-->>MCP: {content: "2+3 = 5"}
    MCP-->>Agent: 工具结果
    Agent-->>User: "结果是 5"
```

---

## 扩展阅读

### 相关文档

- [MCP 协议](../concepts/mcp.md) - MCP 协议详解
- [开发自定义工具](./04-develop-custom-tool.md) - Plugin 方式扩展
- [Agent 定义](../internals/agent.md) - Agent 如何使用工具

### 其他案例

- [案例 01: 创建自定义 Agent](./01-create-custom-agent.md) - Agent 扩展
- [案例 05: 构建 ACP 客户端](./05-build-acp-client.md) - 编辑器集成

---

## 💡 最佳实践

### 1. 安全性

- ✅ 验证所有输入参数
- ✅ 限制资源访问权限
- ❌ 不要在生产环境使用 `eval()`

### 2. 错误处理

```typescript
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    // 执行工具逻辑
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `工具执行错误: ${error instanceof Error ? error.message : String(error)}`
      }],
      isError: true,
    }
  }
})
```

### 3. 日志记录

```typescript
console.error("Tool called:", request.params.name)
console.error("Arguments:", JSON.stringify(request.params.arguments))
```

### 4. 性能优化

- 缓存频繁访问的资源
- 使用流式处理大文件
- 限制返回结果的大小

---

## 🎯 知识检查点

完成本案例后，检查你是否能回答以下问题：

- [ ] MCP 协议的作用是什么？
- [ ] 如何配置现有的 MCP Server？
- [ ] 如何开发自定义 MCP Server？
- [ ] Tools、Resources、Prompts 的区别是什么？
- [ ] MCP Server 如何与 OpenCode 通信？

**如果都能回答，恭喜你掌握了 MCP 集成！** 🎉

---

**准备好学习下一个案例了？** 👉 [案例 03: 调试会话问题](./03-debug-session.md)
