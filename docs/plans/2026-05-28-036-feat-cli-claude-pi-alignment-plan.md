# CLI Claude Code / Pi Alignment Execution Plan

## 一句话结论

Guga 下一步不是重写 CLI，而是在现有 `packages/host-*` 和 `packages/cli` 基础上补齐“实时流 + 控制面 + 通用交互请求 + 会话树”四个缺口：体验上学习 Claude Code 的终端 workbench，通信上学习 Pi 的 JSONL/RPC 可嵌入性，但 canonical 协议仍以 Guga Host Protocol 为准，桌面/Web 只消费同一套资源、事件和控制命令。

## 项目对比

| 项目 | Fact / Inference | 对 Guga 的执行判断 |
| --- | --- | --- |
| Claude Code | Fact: `docs/research/source-analysis/claude-code-analysis/analysis/components/01-component-architecture-overview.md` 将 TUI 描述为 terminal agent workbench，而不是普通 chat UI。 | CLI 要优先补 transcript、tool progress、permission、task/status 区域，而不是只打印最终答案。 |
| Claude Code | Fact: `docs/research/source-analysis/claude-code-analysis/analysis/components/02-core-interaction-components.md` 中 `PromptInput` 承担 slash、history、typeahead、image、model、permission、task 等 orchestration。 | Guga 第一阶段只做 submit/steer/follow-up/abort/permission，保留 slash/typeahead 插槽。 |
| Claude Code | Fact: `docs/research/source-analysis/claude-code-analysis/analysis/components/04i-session-storage-resume.md` 描述 append-only JSONL transcript、resume recovery、sidechain transcript。 | Guga 的 resume/fork 要绑定 session/replay contract，不能只靠当前进程内存。 |
| Pi | Fact: `docs/research/repomix/pi-focused-context.xml` 中 `packages/coding-agent/docs/rpc.md` 定义 stdin/stdout JSONL RPC command/event。 | Guga 可增加 stdio adapter，但它只能映射 Host Protocol，不能成为第二套协议事实。 |
| Pi | Fact: Pi RPC events 包含 `message_start/update/end`、`tool_execution_start/update/end`、`queue_update`、`compaction_start/end`、`auto_retry_start/end`、`extension_ui_request/response`。 | Guga 需要补 `tool.progress`、queue、retry、generic interaction request/response，现有事件集还不够驱动完整 CLI/desktop。 |
| Pi | Fact: Pi interactive mode 在 agent 运行中输入默认走 steering，Alt+Enter 作为 follow-up，Escape abort 并恢复 queued messages。 | Guga CLI 应把运行中输入建模为控制命令，而不是等本轮结束再发新 prompt。 |
| Guga 当前实现 | Fact: `packages/host-local-server/src/routes.ts` 的 `POST /sessions/:id/runs` 当前 `await hostRuntime.startRun()` 后才返回。 | 这会阻塞实时 SSE 消费；必须改成异步启动，立即返回 `run` resource。 |
| Guga 当前实现 | Fact: `packages/cli/src/commands/run.ts` 当前 `startRun` 后调用 `listRunEvents` 渲染，`--headless` 只被解析，没有区分实时交互。 | CLI 需要改为 `streamRunEvents` 实时渲染；headless 输出最终答案/debug events，interactive 支持控制输入。 |

## 可借鉴模式

1. **Claude Code 的产品面分层**

   Adopt: CLI/TUI 是 workbench，要显示 transcript、工具状态、权限、session 状态和错误恢复。

   Adapt: 不照搬完整 React/Ink 组件体系，先用当前 CLI renderer 做实时文本 UI，再按需求引入更重的 TUI。

2. **Pi 的嵌入式通信形态**

   Adopt: command/event 明确分离；stdin/stdout JSONL 很适合 IDE extension、desktop child process、测试 harness。

   Adapt: Pi 的 `extension_ui_request` 应抽象为 Guga 的 `interaction.requested` / `interaction.resolved`，kind 可以覆盖 `select`、`confirm`、`input`、`editor`、`notify`、`setStatus`、`setWidget`、`setTitle`、`set_editor_text`。

3. **控制面是协议，不是 UI 快捷键**

   Adopt: `steer`、`follow_up`、`abort`、`permission respond`、`compact`、`fork`、`resume` 都应是 typed command。

   Adapt: CLI 快捷键只是这些 command 的一种输入方式；桌面/Web/extension 后续走同一命令。

4. **会话是树，不只是列表**

   Adopt: Pi 的 fork/clone/tree 体验和 Claude Code 的 JSONL resume 都说明 session lineage 是核心产品能力。

   Adapt: Guga 先实现最小 `session.branch` / `session.forked` resource，不急着做完整可视化树。

## 不建议照搬

- 不照搬 Claude Code 全量 TUI 平台面：MCP、teams、agents、hooks、sandbox、memory、skills 的专业面板可以后置。
- 不照搬 Pi 的整套 TUI framework：Guga 已有 host packages，现阶段不需要迁移到另一个组件系统。
- 不把 `extension_ui_request` 这个名字放进 canonical 协议：它是 adapter 场景，不应限定为 extension。
- 不把 stdio JSONL 做成唯一通信方式：桌面/Web 仍以 HTTP/SSE 或本地 SDK 为主。
- 不让 CLI 解析 assistant 文本判断状态：所有工具、权限、队列、retry、compaction 都必须来自 typed events。

## Guga 落点

### P0 — 实时 run 与事件流

目标：让 CLI 和 server 真的能边跑边消费同一条事件流。

涉及文件：

- `packages/host-runtime/src/host-runtime.ts`
- `packages/host-runtime/src/in-memory-run-store.ts`
- `packages/host-local-server/src/routes.ts`
- `packages/host-sdk/src/client.ts`
- `packages/host-sdk/src/sse-client.ts`
- `packages/cli/src/commands/run.ts`
- `packages/cli/src/render/events.ts`

工作：

- 将 `HostRuntime.startRun` 拆成“创建 running run 并异步执行”和“等待 run 终态”两个能力，或者新增 `startRunDetached`。
- `POST /sessions/:sessionId/runs` 立即返回 running `RunResource`，后台执行 runtime。
- `GET /runs/:runId/events?stream=true&afterSeq=n` 能在 run 运行中持续输出 SSE。
- CLI 默认订阅 `streamRunEvents`，实时渲染 `message.delta`、tool、permission、context、usage、terminal event。
- `--headless` 输出最终答案和失败原因；`--debug-events` 输出 JSON event lines；interactive 留出 stdin 控制入口。

验收：

- CLI mock run 不再等完成后批量渲染，而是流式打印。
- server integration test 能在 run 完成前收到至少一个 SSE event。
- run 终态和事件 buffer 一致，断线后用 `afterSeq` 可续读。

### P1 — 控制命令与队列语义

目标：补齐 Pi 式 running input 和 Claude Code 式可中断 workbench 基础。

协议新增建议：

```ts
type RunInputMode = "prompt" | "steer" | "follow_up";

type HostCommand =
  | { type: "run.input"; sessionId: string; runId?: string; mode: RunInputMode; text: string }
  | { type: "run.abort"; runId: string; reason?: string }
  | { type: "run.compact"; sessionId: string; runId?: string; mode?: "manual" | "auto" }
  | { type: "permission.respond"; requestId: string; decision: "allow" | "deny"; remember?: "once" | "session" | "always"; reason?: string };
```

事件新增建议：

```ts
type HostEvent =
  | { type: "turn.started"; sessionId: string; runId: string; turnId: string; seq: number }
  | { type: "turn.completed"; sessionId: string; runId: string; turnId: string; seq: number }
  | { type: "queue.updated"; sessionId: string; runId?: string; pending: Array<{ id: string; mode: "steer" | "follow_up"; textPreview: string }>; seq: number }
  | { type: "tool.progress"; sessionId: string; runId: string; callId: string; message?: string; progress?: number; seq: number }
  | { type: "retry.started"; sessionId: string; runId: string; attempt: number; reason: string; seq: number }
  | { type: "retry.completed"; sessionId: string; runId: string; attempt: number; seq: number };
```

工作：

- 新增 command/resource DTO 到 `packages/host-protocol`。
- server 增加 `POST /runs/:runId/input`、`POST /runs/:runId/abort`、`POST /permissions/:requestId/respond`。
- runtime store 维护 pending input queue；运行中普通输入默认 `steer`，明确 follow-up 进入队列。
- CLI interactive stdin：Enter 发送 steer，特殊命令先用文本命令实现，例如 `/follow <text>`、`/abort`、`/compact`。
- renderer 展示 queue/update、retry、tool.progress，不解析 assistant 文本。

验收：

- 运行中提交 steer 会产生 `queue.updated` 或被当前 turn 消费。
- follow-up 在当前 run 结束后继续执行或成为下一 turn。
- abort 通过协议传播到 abort signal，并产生稳定终态。

### P2 — 通用交互请求，替代 extension-only UI

目标：为 CLI、desktop、IDE extension 统一人机交互，不把 Pi 的 extension UI 名称固化进 core。

协议新增建议：

```ts
type InteractionRequest =
  | { kind: "select"; title?: string; options: Array<{ id: string; label: string; description?: string }>; multi?: boolean }
  | { kind: "confirm"; title?: string; message: string; defaultValue?: boolean }
  | { kind: "input"; title?: string; placeholder?: string; defaultValue?: string; secret?: boolean }
  | { kind: "editor"; title?: string; language?: string; initialText?: string }
  | { kind: "notify"; level: "info" | "warning" | "error"; message: string }
  | { kind: "setStatus"; text: string }
  | { kind: "setWidget"; widgetId: string; payload: unknown }
  | { kind: "setTitle"; title: string }
  | { kind: "set_editor_text"; text: string };

type InteractionEvent =
  | { type: "interaction.requested"; sessionId: string; requestId: string; request: InteractionRequest; seq: number }
  | { type: "interaction.resolved"; sessionId: string; requestId: string; response?: unknown; seq: number };
```

工作：

- `permission.requested` 保持专用高优先级事件；普通 UI 问题走 `interaction.requested`。
- CLI adapter 支持 `select`、`confirm`、`input`、`editor` 的最低可用实现。
- desktop/Web 后续可以用同一 request 渲染原生控件。
- stdio JSONL adapter 将 Pi-compatible `extension_ui_request` 映射到 `interaction.requested`。

验收：

- 一个测试插件可以发起 select/input 交互，CLI 回传 response。
- 同一交互可通过 HTTP endpoint 和 stdio adapter 响应。
- canonical 类型中不出现 `extension_ui_*` 命名。

### P3 — 会话 resume / fork / transcript

目标：让 Claude Code / Pi 都强调的长期会话能力落到 Guga session contract。

涉及文件：

- `packages/host-protocol/src/resources.ts`
- `packages/host-runtime/src/host-runtime.ts`
- `packages/host-local-server/src/routes.ts`
- `packages/host-sdk/src/client.ts`
- `packages/cli/src/commands/run.ts`
- `packages/core` session/replay 相关实现

工作：

- 扩展 session resource：`branchId`、`parentBranchId`、`createdFromRunId`、`summary`、`lastRunId`。
- server 增加 `GET /sessions`、`POST /sessions/:sessionId/resume`、`POST /sessions/:sessionId/fork`、`GET /sessions/:sessionId/tree`。
- CLI 增加 `/resume`、`/fork`、`/tree` 或命令参数形式。
- transcript/replay 以 M5 session store 为准，host store 只做投影和索引。

验收：

- 同一 session 可以 fork 出新 branch 并运行新 prompt。
- resume 后能继续使用旧 transcript，而不是只拿 title。
- tree 输出至少包含 main branch、fork branch、last run 状态。

### P4 — Stdio JSONL adapter

目标：服务 IDE extension、desktop child process、自动化测试，对齐 Pi 的可嵌入通信方式。

新增包建议：

- `packages/host-stdio`

命令：

- `prompt`
- `steer`
- `follow_up`
- `abort`
- `new_session`
- `get_state`
- `get_messages`
- `compact`
- `switch_session`
- `fork`
- `get_last_assistant_text`

事件：

- 映射现有 `HostEvent`
- 输出 `agent_start` / `agent_end` 兼容事件可作为 adapter event，不进入 canonical core
- 输出 `extension_ui_request` / `extension_ui_response` 兼容事件时必须由 `interaction.*` 派生

验收：

- 一条 JSONL command 输入能创建 session、启动 run、实时收到 event lines。
- adapter 层测试证明 canonical event 和 Pi-compatible event 可互相映射关键字段。

## 执行顺序

1. P0：修正 run 生命周期和 CLI 实时流，这是所有体验的地基。
2. P1：加入 command/control plane 和 queue，解决运行中输入、abort、permission response。
3. P2：加入 generic interaction request/response，为 desktop/extension 统一协议。
4. P3：补 resume/fork/tree，把长期会话从 UI 需求变成 host resource。
5. P4：实现 stdio JSONL adapter，对齐 Pi 的嵌入式通信场景。

## 最小测试矩阵

- `packages/host-protocol`: event/command DTO serialization tests。
- `packages/host-runtime`: detached run、streaming event、cancel、queue、permission、interaction tests。
- `packages/host-local-server`: create run 立即返回、SSE live event、afterSeq replay、control endpoints tests。
- `packages/host-sdk`: streamRunEvents、sendRunInput、respondPermission、respondInteraction tests。
- `packages/cli`: mock streaming run、headless final answer、debug event JSONL、interactive command parser tests。
- `packages/host-stdio`: JSONL command/event compatibility tests。

## 证据

- Fact: `docs/research/context-packs/ui-protocol.md` 推荐 HTTP Server + SSE、Session REST API、OpenAPI typed SDK、TUI/CLI control mode。
- Fact: `docs/research/cli-desktop-web-host-architecture.md` 已将 Guga M7/M11 定位为 CLI-first + local server + typed host protocol + SSE event stream。
- Fact: `docs/research/source-analysis/claude-code-analysis/analysis/components/01-component-architecture-overview.md` 将 Claude Code TUI 定义为 terminal agent workbench。
- Fact: `docs/research/source-analysis/claude-code-analysis/analysis/components/02-core-interaction-components.md` 显示 Claude Code input 是多能力 orchestration point。
- Fact: `docs/research/source-analysis/claude-code-analysis/analysis/components/04i-session-storage-resume.md` 描述 append-only JSONL transcript 与 resume recovery。
- Fact: `docs/research/repomix/pi-focused-context.xml` 的 `packages/coding-agent/docs/rpc.md` 记录 Pi JSONL RPC commands/events 和 `extension_ui_request/response`。
- Fact: `packages/host-protocol/src/events.ts` 当前已有 run/message/tool/permission/context/artifact/usage 事件，但还没有 queue、retry、interaction、tool.progress。
- Fact: `packages/host-local-server/src/routes.ts` 当前 `POST /sessions/:sessionId/runs` 会 await `hostRuntime.startRun()` 后返回。
- Fact: `packages/cli/src/commands/run.ts` 当前先 `startRun` 再 `listRunEvents`，不是实时消费 event stream。
- Inference: Guga 应把 Pi 的 extension UI 抽象为 generic interaction，因为未来 desktop/Web/IDE 都需要同类请求，但它们不是 extension-only。
- Pending Verification: session/replay 的 durable fork/resume 需要实现前再次核对 M5 store API，避免 host-runtime 自建第二套持久层。
