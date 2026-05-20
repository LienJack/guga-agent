# UI Protocol Context Pack

## 问题边界

本包聚焦："Agent 内核写好了，用户怎么用？" 涵盖三层问题：

1. **本地 UI 层** — CLI/TUI 直接操作 agent，进程内调用
2. **Server/Gateway 层** — agent 暴露为网络服务（HTTP REST + SSE + WebSocket），多客户端同时接入
3. **远程客户端层** — 编辑器集成 (ACP/LSP)、IM 渠道 (Telegram/Slack/飞书)、SDK/桌面应用

**不在本包范围内**：agent 循环本身的实现、tool-call 内部执行逻辑、context 压缩策略。

---

## 参考项目与版本

| 项目 | Commit | 关注重点 |
|------|--------|---------|
| claude-code | `3d7b32f` | Ink TUI 组件体系、platform 控制面、remote-control-server |
| cc-haha | `dbb8c95` | adapters/ 多渠道桥接（飞书/钉钉/Telegram/微信）、desktop/ 桌面应用、ws-bridge |
| hermes-agent | `dd0923b` | gateway/run.py 单进程多平台网关、SessionStore per-user 隔离、streaming edit 投递 |
| opencode | `caf1151` | Hono HTTP Server + SSE + mDNS、ACP 协议实现、LSP Client 集成、SDK 包 |
| deer-flow | `84f88b6` | FastAPI Gateway + LangGraph Server 双进程、IM Channel 系统 (MessageBus) |

---

## 必读分析材料

| 文件路径 | 一句话 |
|---------|--------|
| `docs/research/source-analysis/claude-code-analysis/analysis/components/03-platform-components.md` | Claude Code TUI 平台控制面总图：permissions/tasks/agents/mcp/teams |
| `docs/research/source-analysis/claude-code-analysis/analysis/components/06-function-level-platform-walkthrough.md` | 平台组件函数级拆解：状态机、映射器、mailbox 双写 |
| `docs/research/source-analysis/hermes-agent-anatomy/docs/06-消息网关.md` | Hermes gateway 全貌：15 平台适配器、session key 设计、slash 命令分发 |
| `docs/research/source-analysis/hermes-wiki/concepts/gateway-session-management.md` | Session 生命周期：per-user/per-thread 隔离、idle/daily 重置、PII 脱敏 |
| `docs/research/source-analysis/deerflow-book/chapters/19-fastapi-gateway.md` | DeerFlow 管理面 vs 数据面分离：9 个 Router、lifespan 管理 |
| `docs/research/source-analysis/deerflow-book/chapters/20-im-channels.md` | DeerFlow IM Channel 抽象：MessageBus pub/sub、Channel 基类三抽象方法 |
| `docs/research/source-analysis/learn-opencode/docs/internals/server.md` | OpenCode Hono HTTP Server：REST + SSE + WebSocket PTY |
| `docs/research/source-analysis/learn-opencode/docs/concepts/acp.md` | ACP 协议完整交互流：initialize → session/new → prompt → reportProgress |
| `docs/research/source-analysis/learn-opencode/docs/concepts/lsp.md` | OpenCode 作为 LSP Client：20+ 语言、codesearch tool 封装 |
| `docs/research/source-analysis/learn-opencode/docs/packages/sdk/README.md` | OpenCode SDK：OpenAPI 生成强类型客户端、自定义 SSE 实现 |

---

## 必读源码文件

### Claude Code / cc-haha

| 路径 | Token 量 | 说明 |
|------|----------|------|
| `src/screens/REPL.tsx` | 453k | TUI 主屏幕状态机（cc-haha） |
| `src/main.tsx` | 408k | 应用启动入口、Server 启动 |
| `src/components/PromptInput/PromptInput.tsx` | 185k | 输入组件：slash 命令、media attach |
| `adapters/common/ws-bridge.ts` | 2.3k | WebSocket 桥接公共抽象 |
| `adapters/feishu/index.ts` | 11.4k | 飞书适配器：streaming-card + flush |
| `adapters/telegram/index.ts` | 6.6k | Telegram 适配器 |
| `packages/remote-control-server/` | — | 远程控制 HTTP 入口 |

### Hermes

| 路径 | Token 量 | 说明 |
|------|----------|------|
| `gateway/run.py` | 150k | GatewayRunner 主体：adapter 工厂、session lock、command dispatch |
| `gateway/session.py` | ~44KB | SessionStore + SessionResetPolicy + PII hash |
| `gateway/platforms/base.py` | — | BasePlatformAdapter：4 抽象 + 6 可选方法 |
| `gateway/platforms/feishu.py` | 3.6k行 | 最复杂适配器 |
| `gateway/hooks.py` | — | 事件 hook 系统 |
| `cli.py` | 131k | CLI 入口（非网关模式） |

### OpenCode

| 路径 | Token 量 | 说明 |
|------|----------|------|
| `packages/opencode/src/server/server.ts` | 94k | Hono 主 Server、所有 REST 路由 |
| `packages/opencode/src/acp/agent.ts` | 36k | ACP Agent 实现 |
| `packages/opencode/src/acp/session.ts` | 2.6k | ACP 会话映射 |
| `packages/opencode/src/lsp/server.ts` | 62k | LSP Server 配置 |
| `packages/opencode/src/lsp/index.ts` | 14k | LSP 管理器 |
| `packages/sdk/` | — | OpenAPI 生成的强类型 SDK |
| `packages/app/` | 570k | SolidJS 桌面 Web App |

### DeerFlow

| 路径 | 说明 |
|------|------|
| `gateway/app.py` | FastAPI Gateway create_app |
| `src/channels/base.py` | Channel 抽象基类 |
| `src/channels/message_bus.py` | MessageBus (asyncio.Queue + 回调) |
| `src/channels/service.py` | ChannelService 生命周期 |

---

## 关键抽象

### 1. Server 暴露模式（三种范式）

| 范式 | 代表 | 特征 |
|------|------|------|
| **进程内 TUI** | Claude Code Ink / Hermes CLI | 无网络开销，stdin/stdout 直接驱动 |
| **本地 HTTP Server** | OpenCode Hono :4096 | REST + SSE 事件流 + WebSocket PTY；mDNS 服务发现 |
| **网关进程** | DeerFlow FastAPI + Hermes GatewayRunner | 管理面/数据面分离，外部客户端通过 HTTP/WebSocket 接入 |

### 2. 事件流推送协议

| 协议 | 方向 | 使用者 |
|------|------|--------|
| **SSE (Server-Sent Events)** | Server → Client | OpenCode `/session/:id/event`、DeerFlow LangGraph `/threads` |
| **WebSocket** | 双向 | OpenCode PTY、Hermes streaming edit、cc-haha ws-bridge |
| **AG-UI (Agent-UI Protocol)** | Agent → UI | 新兴标准，event 类型包括 text_delta / tool_call / state_update |
| **ACP (Agent Context Protocol)** | 双向 JSON-RPC | OpenCode ↔ Zed；支持 permission request / progress report |
| **LSP** | 双向 JSON-RPC over stdio | OpenCode 作为 Client 驱动 typescript-language-server 等 |

### 3. IM 渠道抽象层

**DeerFlow 模式（轻量）**：
```
Channel(ABC): start() / stop() / send()
MessageBus: asyncio.Queue(inbound) + list[callback](outbound)
ChannelService: registry + 延迟导入
```

**Hermes 模式（重量）**：
```
BasePlatformAdapter: connect/disconnect/send/get_chat_info + 6 可选方法
GatewayRunner: 单进程管所有平台
SessionStore: per-user per-platform session key
DeliveryRouter: 跨平台投递（A 平台创建的 cron 投递到 B 平台）
```

**cc-haha 模式（TypeScript 中间路线）**：
```
adapters/common/: ws-bridge + chat-queue + session-store + pairing
adapters/{feishu,telegram,wechat,dingtalk}/: 各自 index.ts
streaming-card / flush-controller: 飞书特有的卡片流式更新
```

### 4. Session 管理核心设计

| 维度 | Hermes | OpenCode | DeerFlow |
|------|--------|----------|----------|
| Session Key | `agent:main:{platform}:{type}:{ids}` | Session ID (UUID) | LangGraph thread_id |
| 隔离粒度 | per-user/per-thread 可配置 | per-session | per-thread (topic_id 映射) |
| 持久化 | SQLite + JSONL 双写 | SQLite (via bus 事件) | LangGraph checkpointer |
| 过期策略 | idle + daily 可配置 | 无自动过期 | 无 |
| PII 保护 | SHA256 hash（Signal/WhatsApp/Telegram） | 不涉及 | 不涉及 |

### 5. SDK 模式

OpenCode 的 SDK 架构值得注意：
- 从 `packages/opencode/src/server/` 的 OpenAPI spec 自动生成
- `@hey-api/openapi-ts` 生成强类型 TS Client
- 自定义 SSE Client（支持 POST 订阅，非 native EventSource）
- `createOpencodeServer()` 启动器：spawn 子进程 → 匹配 stdout URL → resolve

---

## 已确认事实

1. **Claude Code TUI 是终端 agent 平台控制台**，不是聊天 UI。permissions/tasks/teams/mcp/agents 各有独立状态机。
2. **Hermes 网关在单进程内管 15 个平台**，代码量 3 万行。核心防御：sentinel lock、photo burst 合并、stale agent 驱逐、断线重连 watcher。
3. **OpenCode 用 Hono HTTP 暴露全部能力**，端口 4096，所有客户端（Desktop/CLI/VSCode/Zed）通过统一 REST + SSE 通信。
4. **ACP 协议实现了 Agent ↔ IDE 双向 JSON-RPC**：initialize → session → prompt → permission → progress。OpenCode 用它让 Zed 直接驱动 agent。
5. **DeerFlow 把管理面和数据面拆成两个进程**（FastAPI :8001 vs LangGraph :2024），通过 Nginx 统一暴露。
6. **IM 渠道全部采用无需公网 IP 的连接方式**：Long Polling (Telegram)、Socket Mode (Slack)、WebSocket (飞书/钉钉)。
7. **cc-haha 的 adapters/ 目录是 Claude Code 未公开的 IM 适配层**，包含飞书 streaming-card、钉钉 AI-card、微信协议适配等 69k token。
8. **流式编辑投递**（Hermes）：token 攒够 40 字符或 0.3 秒就 editMessageText，末尾带 ▉ 光标，不支持 edit 的平台 fallback 一次性发送。
9. **OpenCode LSP 集成**：agent 可通过 codesearch tool 调用 workspace/symbol、definition、references，等效于 IDE 级代码理解。
10. **Hermes slash 命令分发**是一个 500+ 行 pipeline：running-agent 拦截 → built-in → quick commands → plugin → skill → 普通消息。

---

## Guga 迁移判断

### Phase 1（MVP）应采纳

| 能力 | 推荐来源 | 理由 |
|------|---------|------|
| **HTTP Server + SSE 事件流** | OpenCode Hono 模式 | 最小依赖，一个进程同时服务 CLI/Desktop/IDE；SSE 比 WebSocket 简单、浏览器原生支持 |
| **OpenAPI 自动生成 SDK** | OpenCode `@hey-api/openapi-ts` | 避免手写客户端，保证类型安全 |
| **TUI/CLI 反向代理模式** | OpenCode `/tui/control/` | CLI 不直接调 agent，而是通过 Server；Server 反向"回调"CLI 获取用户输入（如权限询问） |
| **Session REST API** | OpenCode `/session/*` | CRUD + prompt + event stream，最小可行会话管理 |

### Phase 2 应采纳

| 能力 | 推荐来源 | 理由 |
|------|---------|------|
| **ACP 协议** | OpenCode `src/acp/` | 让 Zed/VSCode 等编辑器直接驱动 Guga，零额外 UI 开发 |
| **IM Channel 抽象** | DeerFlow Channel 基类 | 三方法抽象 (`start/stop/send`) + MessageBus pub/sub 最简洁，适合 PoC 阶段 |
| **mDNS 服务发现** | OpenCode `src/server/mdns.ts` | Desktop App 自动发现本地 Server，零配置体验 |

### Phase 3 可考虑

| 能力 | 推荐来源 | 理由 |
|------|---------|------|
| **单进程多平台网关** | Hermes GatewayRunner | 15 平台全通但代码量大；Guga 若需深度 IM 集成再考虑 |
| **Session 隔离策略** | Hermes per-user/per-thread | 群聊场景必须；单人使用可延后 |
| **LSP Client 集成** | OpenCode `src/lsp/` | agent 获得 IDE 级代码理解；需等核心稳定后再加 |
| **跨平台投递 (DeliveryRouter)** | Hermes | "Telegram 创建 cron → Discord 收结果"；高级场景 |

### 应避免或延后

- **Claude Code 式 TUI 全量控制面**：permissions/agents/teams/mcp 等完整组件体系太重，Guga 先做好 API 层，前端按需长出来
- **Hermes 式 GatewayRunner 巨型单文件**：150k token 单文件不可维护；如果要网关，应拆成独立微服务
- **流式 edit 投递**：Telegram editMessageText 有 rate limit (每分钟 30 次)，需要攒 delta 逻辑；先实现一次性发送

### 关键架构决策建议

1. **Server 是第一公民**：哪怕只有 CLI 模式，也启一个 HTTP Server，CLI 通过 HTTP 与 Server 通信。这样未来加 Desktop/Web/IDE 客户端零改动。
2. **SSE 优先于 WebSocket**：agent 输出是单向流，SSE 足够且更简单。WebSocket 只用于 PTY 这种需要双向 stdin/stdout 的场景。
3. **IM 适配器独立包**：不要把 Telegram/飞书适配器放进核心进程，做成可选的 bridge 子进程或插件包，避免 SDK 依赖污染核心。

---

## 待验证问题

1. **AG-UI 协议成熟度**：CopilotKit 推动的 AG-UI 协议（event 类型：TEXT_MESSAGE_START / TOOL_CALL_START 等）是否已有可复用的 TypeScript SDK？是否比自建 SSE 更值得采纳？
2. **ACP 协议覆盖度**：除 Zed 外还有哪些编辑器实际支持 ACP Client？VSCode 是否有社区插件？
3. **Hono vs Fastify vs Express**：Guga 后端选 Go 还是 TypeScript？如果 Go，对应的轻量 HTTP 框架选型？
4. **SSE 断线重连**：OpenCode SDK 内置了指数退避重连，但具体实现是否处理了 `Last-Event-ID`？Guga 是否需要事件 ID 以支持断点续传？
5. **IM 平台 rate limit**：飞书/钉钉/Telegram 各自的消息发送频率限制具体是多少？streaming edit 模式下需要怎样的 throttle 策略？
