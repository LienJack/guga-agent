# 包分析: `sdk`


## 1. 概览 (Overview)
- **路径**: `packages/sdk`
- **定位**: Client 与 Server 通信的桥梁。
- **观察**: 该目录包含 `openapi.json`，强烈暗示 SDK 是基于 OpenAPI 规范生成的。
## 2. 核心架构 (Core Architecture)

SDK 采用 **Generator + Launcher** 的混合模式：
1.  **Static Client**: 基于 OpenAPI 规范 (`openapi.json`) 自动生成 TypeScript 客户端代码，确保类型与 Server 严格对齐。
2.  **Process Launcher**: 提供封装函数直接启动 `opencode` 二进制文件作为 Server 进程，并自动解析服务端口。

### 3.1 Server 启动器 (`server.ts`)
`createOpencodeServer` 函数通过 node `spawn` 启动 `opencode serve` 命令。
- **机制**:
    1.  Spawn 子进程: `opencode serve --hostname=... --port=...`
    2.  Hook `stdout`: 监听输出流，正则匹配 `opencode server listening on (url)`。
    3.  Ready: 一旦捕获到 URL，Promise resolve，返回 Server 实例。

### 3.2 强类型客户端 (`v2/gen/`)
基于 **@hey-api/openapi-ts** 生成。核心类 `OpencodeClient` 按照 OpenAPI tags 分组暴露能力：

| 模块 | 核心功能 | 对应后端路由 |
| :--- | :--- | :--- |
| **Global** | 健康检查、**全局事件流 (SSE)**、销毁实例 | `/global/*` |
| **Session** | **Agent 核心交互**：创建会话、对话(Prompt)、文件编辑流 | `/session/*` |
| **Pty** | 终端管理：创建、Resize、Websocket 连接 | `/pty/*` |
| **Project** | 项目上下文：切换目录、获取当前项目信息 | `/project/*` |
| **Tool** | 工具发现：获取可用工具列表 (MCP/Built-in) | `/experimental/tool/*` |
| **Config** | 配置管理：读写 `opencode.json` | `/config/*` |
| **Worktree** | 沙箱环境：管理 git worktrees | `/experimental/worktree/*` |

### 3.3 通信模式 (Communication Patterns)
SDK 使用双轨通信：
1.  **Request/Response (HTTP)**: 绝大多数操作（如 `session.prompt`, `pty.create`）都是标准的 HTTP 请求。
2.  **Events Stream (SSE)**:
    -   客户端调用 `client.global.event()` 连接 `/global/event`。
    -   服务端通过 Server-Sent Events 推送实时状态（如 `message.updated` 思考过程, `terminal.output` 终端输出, `file.edited` 文件变更）。

## 4. 深入技术细节 (Advanced Details)
### 4.1 自定义 SSE 实现
为了支持更复杂的交互场景（不仅是 GET），SDK 没有使用浏览器原生的 `EventSource`，而是实现了一个基于 `fetch` 的 **Custom SSE Client** (`core/serverSentEvents.gen.ts`)。
- **特性**: 支持任意 HTTP 方法 (POST/PUT等) 进行流式订阅。
- **机制**: 手动使用 `TextDecoderStream` 解析 Response Body，按 `\n\n` 分割数据块，解析 `data:`, `event:`, `id:` 等标准字段。
- **容错**: 内置了指数退避 (Exponential Backoff) 的自动重连机制。

## 5. 使用示例 (Usage Example)

这就是为什么我们在 CLI 的 `run.ts` 中能看到如此简洁的启动代码：

```typescript
import { createOpencode } from "@opencode-ai/sdk"

// 1. 启动 Server 并创建 Client
const { client, server } = await createOpencode({
  port: 0 // 随机端口
})

// 2. 订阅全局事件 (SSE)
const eventSource = await client.global.event()
// ... 处理事件 ...

// 3. 创建会话并交互
const { data: session } = await client.session.create({ ... })
await client.session.prompt({
    sessionID: session.id,
    prompt: "帮我重构下 sdk 模块"
})
```

## 5. 总结
`packages/sdk` 是一个极其轻量但功能完备的胶水层。它：
1.  **不包含业务逻辑**：所有逻辑都在 Server (CLI) 中。
2.  **强依赖规范**：通过 OpenAPI 保证了前后端契约的一致性。
3.  **对开发者友好**：屏蔽了进程管理和网络连接的复杂性。
