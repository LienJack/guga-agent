# CLI / Desktop / Web Host Architecture

## 一句话结论

Guga 的 M7/M11 应采用 **CLI-first + local server + typed host protocol + SSE event stream**：CLI 是第一完整产品面，server 是多客户端复用边界，desktop/Web 先做同一事件流的 viewer/control surface。不要把 AG-UI、ACP、LangGraph 或某个桌面项目的 schema 直接放进 core；Guga 应先定义自己的 canonical host/UI event，再做 adapter。

## 项目对比

| 项目 | 可借鉴事实 | 对 Guga 的判断 |
| --- | --- | --- |
| OpenCode | Fact: `docs/research/source-analysis/learn-opencode/docs/internals/server.md` 描述 OpenCode 用 Hono server 暴露 global/session/message/tool/mcp/pty/tui 等 REST 路由，并用 `/global/event`、`/session/:id/event` 做 SSE。 | Adopt: 本地 server + REST/SSE 是 Guga 多客户端复用的主线。 |
| OpenCode SDK | Fact: `docs/research/source-analysis/learn-opencode/docs/packages/sdk/README.md` 描述 SDK 由 OpenAPI 生成 typed client，同时提供 server launcher。 | Adopt: Guga 应有 `@guga-agent/sdk` 或等价 typed client，CLI/Web/desktop 不各写一套 HTTP 调用。 |
| DeerFlow | Fact: `docs/research/source-analysis/deerflow-book/chapters/19-fastapi-gateway.md` 将 Gateway 拆为 models/mcp/memory/skills/artifacts/uploads/agents/channels 等 router，并把 CORS/lifecycle/channel service 放在 gateway 层。 | Adapt: Guga 的 server 不应变成大而全 gateway；第一版只做 session/run/event/permission/artifact/capability。 |
| Hermes Agent | Fact: `docs/research/source-analysis/hermes-agent-anatomy/docs/06-消息网关.md` 展示 GatewayRunner 统一平台 adapter、session store、pending approvals、slash command dispatch、running-agent interruption。 | Adapt: 采用 pending approval、session isolation、running-run control 思路；跳过 15 平台 gateway 复杂度。 |
| Guga AG-UI research | Fact: `docs/research/agent-agui.md` 提出 runtime event -> canonical `AgentUIEvent` -> client adapters 三层，并建议 P0 做 HTTP server、最小 SSE、run 状态查询。 | Adopt: Guga canonical event 先小而稳定，AG-UI/ACP/LangGraph 都是 adapter。 |
| UI Protocol Context Pack | Fact: `docs/research/context-packs/ui-protocol.md` 推荐 Phase 1 采纳 HTTP Server + SSE、Session REST API、OpenAPI SDK、TUI/CLI 反向控制模式。 | Adopt: 这是 M7/M11 的首选架构路线。 |

## 可借鉴模式

1. **Server 是复用边界，而不是第二套 runtime**  
   Fact: OpenCode 的所有客户端通过 Server 通信。Guga 应让 `apps/server` 包装现有 `AgentRuntime`，不复制 agent loop、tool pipeline、permission pipeline、session/replay/artifact 逻辑。

2. **CLI 是第一产品面，但不要把协议写死进 CLI**  
   Inference: CLI 可以 in-process 启动 runtime，也可以自动启动 local server；但对外应通过 typed SDK/host client 消费同一协议。这样 M9 code-agent、M10 deep-research、desktop viewer 后续都能复用。

3. **Run 是资源，event stream 是投影**  
   Fact: DeerFlow 和 OpenCode 都围绕 session/run/thread 资源组织 stream/wait/cancel/events。Guga 应把每次 prompt 变成 run resource，SSE 只是观察 run 的方式，不是唯一状态来源。

4. **Permission 是服务端 pending control point**  
   Fact: Hermes GatewayRunner 有 `_pending_approvals`，cc-haha/AG-UI research 也强调 permission control request/response。Guga 的 permission prompt 不应只在 CLI 内部弹窗；server 必须能持有 pending request，CLI/Web/desktop 都能响应。

5. **Typed SDK 先行**  
   Fact: OpenCode SDK 用 OpenAPI 生成 client，并封装 server launcher。Guga 第一版可以先手写小 SDK，但必须把 SDK 当客户端唯一入口；如果 API 扩大，应尽快转 OpenAPI 生成。

6. **Viewer 先于完整工作台**  
   Inference: M11 的桌面/Web 目标很大，但 M7 第一版只需要 event/artifact/permission viewer。真正高密度 workbench 应等 code-agent/deep-research 工作流压出真实需求。

## 不建议照搬

- **不照搬 Hermes GatewayRunner 巨型单进程**：它证明了多平台复杂性，但 M7/M11 不做 IM 全平台网关。
- **不照搬 OpenCode 全路由面**：PTY、LSP、worktree、mDNS、TUI control 都有价值，但第一版只做 agent host protocol 必需面。
- **不把 AG-UI 或 ACP 当 canonical schema**：它们可做 adapter，不能定义 core/runtime event 事实。
- **不先做完整桌面 UI**：桌面产品形态需要 OpenClaw 深度研究；第一版只要求同一 event stream 可被桌面/Web 消费。
- **不让 UI 猜 assistant 文本**：所有状态必须来自 typed event/projection。

## Guga 落点

### 包和应用边界

- `packages/core`: 保持 runtime lifecycle、event、permission、session/replay/artifact contracts；只在确有缺口时补稳定 contract。
- `packages/host-protocol` 或 `packages/runtime-protocol`: 定义 `HostEvent` / `AgentUIEvent`、resource DTO、SSE envelope、SDK shared types。
- `packages/sdk` 或 `packages/host-client`: typed client，封装 HTTP/SSE/server launcher。
- `apps/server`: local HTTP + SSE adapter，调用 `AgentRuntime`。
- `apps/cli`: headless/interactive/debug CLI，优先消费 typed client。
- `apps/web` 或 desktop viewer: 第一版只验证 event/artifact/permission projection。

### MVP API 面

- `POST /sessions`
- `GET /sessions/:sessionId`
- `POST /sessions/:sessionId/runs`
- `GET /runs/:runId`
- `GET /runs/:runId/events` 或 `POST /sessions/:sessionId/runs/stream`
- `POST /runs/:runId/cancel`
- `POST /permissions/:requestId/approve`
- `POST /permissions/:requestId/deny`
- `POST /sessions/:sessionId/fork`
- `POST /sessions/:sessionId/resume`
- `GET /artifacts/:artifactId`
- `GET /capabilities`

### Canonical event 起点

```ts
type HostEvent =
  | { type: "run.started"; runId: string; sessionId: string; seq: number }
  | { type: "message.delta"; runId: string; messageId: string; text: string; seq: number }
  | { type: "message.completed"; runId: string; messageId: string; seq: number }
  | { type: "tool.started"; runId: string; callId: string; name: string; seq: number }
  | { type: "tool.completed"; runId: string; callId: string; artifactIds?: string[]; seq: number }
  | { type: "permission.requested"; runId: string; requestId: string; callId: string; seq: number }
  | { type: "context.compacted"; runId: string; boundaryId: string; seq: number }
  | { type: "artifact.created"; runId: string; artifactId: string; seq: number }
  | { type: "usage.recorded"; runId: string; totalTokens?: number; costUsd?: number; seq: number }
  | { type: "run.completed"; runId: string; seq: number }
  | { type: "run.failed"; runId: string; code: string; message: string; seq: number };
```

This shape is intentionally smaller than full AG-UI/ACP. It should be tested as Guga's public host contract before mapping to external protocols.

## 证据

- Fact: `docs/research/context-packs/ui-protocol.md` lists OpenCode local HTTP server, SSE, OpenAPI SDK, and session REST API as Phase 1 recommendations.
- Fact: `docs/research/agent-agui.md` recommends the three-layer split: runtime event, canonical `AgentUIEvent`, client adapters.
- Fact: `docs/research/source-analysis/learn-opencode/docs/internals/server.md` documents OpenCode server routes and SSE events.
- Fact: `docs/research/source-analysis/learn-opencode/docs/packages/sdk/README.md` documents generated typed SDK plus server launcher.
- Fact: `docs/research/source-analysis/deerflow-book/chapters/19-fastapi-gateway.md` documents gateway routers for models/MCP/skills/artifacts/uploads/agents/channels.
- Fact: `docs/research/source-analysis/hermes-agent-anatomy/docs/06-消息网关.md` documents GatewayRunner, session store, pending approvals, and command dispatch pipeline.
- Inference: Guga should merge M7 and M11 planning because M11's desktop/Web workbench depends on M7's host protocol, while CLI-first requirements constrain M7's first slice.
- Pending Verification: OpenClaw desktop workbench patterns still need materialized checkout, repomix/Graphify/Context Pack, and arch-insight before substantial desktop implementation.
- Pending Verification: Whether to generate SDK from OpenAPI immediately or handwrite first slice should be decided during implementation planning after checking current build/package conventions.
