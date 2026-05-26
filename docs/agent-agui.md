# Agent UI/客户端协议方向：从最小可运行到商业级复刻

先把边界说清楚：这轮参考仓库里没有一个项目在源码层面宣称自己实现了名为 `AG-UI` 的标准协议。本文研究的是更宽的 agent 与 UI/客户端协议方向：agent runtime 如何把文本、工具、权限、取消、等待、artifact、附件、上下文压缩和 usage 暴露给 CLI、Web、IDE、IM 机器人或远端客户端。

因此，下文的事件列表不是 `opencode`、`deer-flow`、`cc-haha`、`blade-code` 的原生事件名合集，而是基于这些项目归纳出来的一份建议协议。真正落地时，你应该把它当成自己的 `AgentUIEvent` 合同，再分别映射到不同传输层和客户端。

本文沿用 Deep Dive 的写法，但目标不是评价某个仓库，而是给出一条“从最小可运行一路演进到商业级复刻”的路线：L0 先能跑，L1 统一事件，L2 支持流式，L3 加控制面，L4 补齐 artifact、附件、压缩和 usage，L5 再做多客户端商业级协议。

## Guga 的取舍校准：先定 canonical event，再选生态协议

L0 到 L5 是协议复杂度路线，不等于 Guga 要等到 L5 才有 Server/SSE。结合 `ui-protocol.md` 和 `agent-react-pattern.md`，Guga 应该把 UI/客户端协议拆成三层：core runtime event、canonical `AgentUIEvent`、传输/客户端 adapter。这样 Web SSE、CLI stream、IDE ACP、IM wait/stream 都是投影，不会反过来污染 agent loop。

- **Server/SSE 进入 P0，但只承载最小事件**：`ui-protocol.md` 建议 Guga Phase 1 采用 HTTP Server + SSE。这里的 P0 不是完整多客户端平台，而是 `run.started / message.delta / tool.started / tool.completed / run.completed / run.failed` 这种最小可观察事实。
- **控制面进入 P1，而不是等商业化后再补**：权限批准、拒绝、取消、等待是 agent 可控性的基础。它们可以先用 HTTP endpoint 实现，远端 WebSocket、ACP 和 IM adapter 后置。
- **artifact/usage/compact 是 P1/P2 的产品能力**：文件产物、token/cost、compact boundary 要在 runtime event 里有位置，但第一版可以只做结构化元数据，不做完整权限矩阵。
- **AG-UI / LangGraph / ACP 都先当 adapter**：不要把某个外部协议当 canonical schema。Guga 自己的事件合同应更小、更稳定，再映射到生态协议。

证据强度：`run/resource + SSE` 是 `deer-flow`、`opencode`、`ui-protocol.md` 的 `Fact`；Guga 采用 canonical event + adapter 是 `Inference`；具体事件字段和版本策略是 `Pending Verification`，需要等第一版 Web/CLI 客户端落地后收敛。

## 读源码前的定位：AG-UI 不是聊天框，而是运行时事实的投影

一个可用的 agent UI 不只是把最终回答 append 到聊天列表。它必须回答更难的问题：模型是否正在输出？工具是否已经开始？工具输入有没有形成？权限请求卡在哪里？用户取消后后台是否真的停了？文件生成后能否离开聊天框？上下文压缩后客户端如何恢复历史？

几个参考项目分别给了不同角度的证据。

`opencode` 的核心启发是“内部流式事件先投影成可展示的 message parts”。`SessionProcessor` 在 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/processor.ts:118` 创建处理器上下文；在 `:286` 处理 `tool-input-start` 并写入 `MessageV2.ToolPart` 的 `pending` 状态；在 `:333` 处理 `tool-call` 并转成 `running`；在 `:394` 处理 `tool-result`，支持 tool result 附带 file attachments；在 `:562` 到 `:625` 处理 text start/delta/end。与此同时，它通过 `SessionEvent` 做 v2 事件双写，但代码里多处写着 `TODO(v2): Temporary dual-write while migrating session messages to v2 events`，例如 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/processor.ts:290`、`:338`、`:420`。所以这里的准确结论是：`MessageV2 parts` 是当前 UI 投影主线，`SessionEvent.*` 更像实验中的事件系统，不应被包装成稳定 AG-UI 标准。

`deer-flow` 的核心启发是“run 是服务端资源，stream/wait/cancel/events/usage 是协议面”。`thread_runs.py` 明确写着它在 LangGraph Platform runs API 上提供 `runs/stream`、`runs/wait`、取消、join、events 和 token usage：入口在 `/Users/lienli/Documents/GitHub/agent-ref/deer-flow/backend/app/gateway/routers/thread_runs.py:1`；`/runs/stream` 使用 SSE 并设置 `Content-Location` 在 `:124` 到 `:148`；`/runs/wait` 在 `:152`；`cancel` 在 `:198`；run events 在 `:377`；thread token usage 在 `:392`。

`cc-haha` 的核心启发是“远端客户端需要一条控制通道，不只是消息通道”。`RemoteSessionManager` 的职责注释写得很直接：它协调 WebSocket 接收、HTTP POST 发送用户消息、权限请求/响应流程，见 `/Users/lienli/Documents/GitHub/agent-ref/cc-haha/src/remote/RemoteSessionManager.ts:87`。它在 `:189` 处理 `can_use_tool` 控制请求，在 `:247` 回传权限结果，在 `:294` 发送 interrupt。`sdkMessageAdapter` 则把远端 SDK 消息转成本地 REPL 消息或流事件，见 `/Users/lienli/Documents/GitHub/agent-ref/cc-haha/src/remote/sdkMessageAdapter.ts:21` 和 `:168`；其中 `status === "compacting"`、`compact_boundary`、`tool_progress` 分别在 `:88`、`:128`、`:111` 被转成可展示消息。

`blade-code` 的核心启发是“IDE 协议层应该是 adapter，而不是 agent 内核本身”。`AcpSession` 把 ACP prompt 解析成 `ChatContext`，然后消费 `LoopEvent` 并发出 ACP `sessionUpdate`。证据在 `/Users/lienli/Documents/GitHub/agent-ref/blade-code/packages/cli/src/acp/Session.ts:307` 到 `:330`；内容 delta 映射到 `agent_message_chunk` 在 `:333`；工具开始和结果映射到 `tool_call` / `tool_call_update` 在 `:347` 到 `:400`；取消用 `AbortController` 在 `:448`；模式映射到权限模式在 `:459` 到 `:497`；真正请求 IDE 权限在 `:643` 以后。

`hermes-agent` 是新增参考里最强的多客户端样本。它不只支持一个 Web UI，而是把 CLI/IM/API/ACP 都看作 agent runtime 的外层 adapter：OpenAI-compatible API server 在 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/gateway/platforms/api_server.py:1` 到 `:21` 列出 `/v1/chat/completions`、`/v1/responses`、`/v1/runs`、`/v1/runs/{run_id}/events`、approval 和 stop endpoints；`GatewayStreamConsumer` 在 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/gateway/stream_consumer.py:77`，负责把同步 agent callbacks 桥接到异步平台消息编辑/草稿流；ACP session manager 在 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/acp_adapter/session.py:186` 管理 editor session 与 `AIAgent` 实例。这给 AG-UI 方向一个更商业化的判断：协议平台必须能适配不同客户端限制，而不是假设所有端都是浏览器 SSE。

`pi agent` 的核心启发是“UI/客户端协议也可以通过 extension surface 开放，而不是只由内置 TUI 决定”。它的 extension 文档明确允许 extension 订阅 lifecycle events、注册 LLM-callable tools、添加 commands、通过 `ctx.ui` 弹 select/confirm/input/notify、注册 custom UI component 和自定义 message/tool renderer，见 `/Users/lienli/Documents/GitHub/guga-agent/docs/research/repomix/pi-focused-context.xml:32075` 到 `:32175`。更底层的类型文件把 `ExtensionUIContext`、`SessionEvent`、`AgentEvent`、`ModelEvent`、`ToolEvent` 分开，见同一 context 的 `packages/coding-agent/src/core/extensions/types.ts` 片段。这说明 Guga 的 `AgentUIEvent` 不应该只服务内置 Web/CLI，还应该给插件一个受控的 UI/事件扩展面。

这些参考线索合起来，给我们一个更稳的判断：Agent UI 协议的主线不是“选 SSE 还是 WebSocket”，而是先定义清楚运行时事实，再决定如何传输、如何投影、如何控制。

## L0：CLI print，先让 agent 真的跑起来

L0 的目标很朴素：agent 能接收用户输入、调用模型、把最终文本打印出来。这里不要急着设计事件总线，也不要急着做 Web UI。你需要的只是一个同步或 async 的 `run(prompt)`，最后输出字符串。

这一层对应商业产品里的“冒烟测试内核”。它验证的是模型配置、prompt 拼装、最基本的错误处理和一次完整 turn 的生命周期。对参考项目而言，L0 不需要复刻任何复杂协议，只需要理解 `blade-code` 后来为什么要把 `Agent.chatStream()` 包进 ACP session：`AcpSession` 在 `/Users/lienli/Documents/GitHub/agent-ref/blade-code/packages/cli/src/acp/Session.ts:326` 调用 `this.agent.chatStream(message, context)`，说明底层 agent 能独立运行，ACP 只是外层适配。

要做什么：

- 提供一个 CLI 命令：读取 prompt，调用 agent，打印最终回答。
- 先把一次 turn 的输入、输出、错误写入日志。
- 用最小历史结构保存用户消息和 assistant 消息，哪怕只是 JSON 文件。

参考哪里：

- `/Users/lienli/Documents/GitHub/agent-ref/blade-code/packages/cli/src/acp/Session.ts:307`：ACP 之前先构造 `ChatContext`。
- `/Users/lienli/Documents/GitHub/agent-ref/blade-code/packages/cli/src/acp/Session.ts:418`：一轮结束后使用 `context.messages` 回写历史。

验收标准：

- 运行 `agent "hello"` 能得到最终文本。
- 模型错误、用户取消、空输出至少有可读错误。
- 同一个 session 至少能连续两轮对话，历史不会丢。

不要提前做什么：

- 不要设计完整事件枚举。
- 不要上 SSE/WebSocket。
- 不要做权限弹窗、artifact 面板、usage dashboard。
- 不要把 CLI 输出和未来 UI 状态绑死；这时 print 只是最薄的观察窗口。

## L1：统一 `AgentUIEvent`，让 UI 消费事实而不是猜状态

L1 开始进入 AG-UI 方向的核心：把内部运行过程转成统一事件。推荐先定义一组小而稳定的 `AgentUIEvent`，不要直接暴露模型供应商的 streaming chunk，也不要直接复制某个参考项目的事件名。

一个足够小的 L1 协议可以是：

```ts
type AgentUIEvent =
  | { type: "run.started"; runId: string; sessionId: string }
  | { type: "message.delta"; runId: string; messageId: string; text: string }
  | { type: "message.completed"; runId: string; messageId: string }
  | { type: "tool.started"; runId: string; callId: string; name: string }
  | { type: "tool.input"; runId: string; callId: string; input: unknown }
  | { type: "tool.completed"; runId: string; callId: string; output: unknown }
  | { type: "tool.failed"; runId: string; callId: string; error: string }
  | { type: "run.completed"; runId: string }
  | { type: "run.failed"; runId: string; error: string };
```

这不是四个项目的原生事件名。它是为了让自己的客户端先有一份稳定合同，再从内部事件做 adapter。

`opencode` 是这一层最值得看的参考，因为它清楚展示了“内部流事件如何投影成当前 UI 状态”。`tool-input-start` 写入 pending tool part，`tool-call` 把状态改成 running，`tool-result` 把状态改成 completed，`text-delta` 对 text part 做增量更新。证据分别是 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/processor.ts:286`、`:333`、`:394`、`:584`。`v2/session-event.ts` 也给了事件化方向的类型参考：Text 事件在 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/v2/session-event.ts:145`，Tool 事件在 `:210`，Tool Progress/Success/Failed 在 `:262` 到 `:303`，Compaction 在 `:329`。

但边界要写死：`opencode` 的 `SessionEvent.*` 当前带实验和迁移色彩，`SessionProcessor` 里的双写注释就是证据。复刻时应学习它的事件粒度和投影思路，而不是把这些名字直接当成外部协议。

要做什么：

- 在 agent runtime 内部建立 `emit(event: AgentUIEvent)`。
- 把文本 delta、工具开始、工具输入、工具结果、错误、run 完成统一成事件。
- 同时保留当前投影：例如 `messages[]` 或 `parts[]`，让页面刷新后能从状态快照恢复。

参考哪里：

- `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/processor.ts:37`：`Handle` 暴露 `updateToolCall`、`completeToolCall`、`process`。
- `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/processor.ts:181`：工具完成时写入 output、metadata、attachments。
- `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/v2/session-event.ts:100`：Step Started/Ended/Failed 类型。
- `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/processor.ts:290`：v2 event dual-write 的边界证据。

验收标准：

- UI 不再靠字符串猜测“正在调用工具”。
- 每个 tool call 有稳定 `callId`，能从 started 追到 completed/failed。
- 刷新页面后，能从投影状态还原当前消息、工具状态和错误状态。
- 单元测试覆盖：文本流、工具成功、工具失败、run 失败。

不要提前做什么：

- 不要一开始就做跨设备同步。
- 不要把内部事件名暴露成公共 API。
- 不要让前端直接理解模型供应商 chunk。
- 不要把 artifact、权限、usage 都塞进 L1；它们会让第一版协议失焦。

## L2：SSE streaming，把事件变成浏览器可消费的流

L2 的目标是让 Web UI 或轻量客户端实时消费 L1 事件。这里优先选 SSE，而不是马上 WebSocket。原因很实际：agent 输出大多数时候是服务端到客户端的单向流；用户输入、取消、权限响应可以先走普通 HTTP endpoint。

`deer-flow` 是这一层的主要参考。`/runs/stream` 在 `/Users/lienli/Documents/GitHub/agent-ref/deer-flow/backend/app/gateway/routers/thread_runs.py:124` 返回 `StreamingResponse`，media type 是 `text/event-stream`，并设置 `Content-Location` 指向 run 资源。它的文件头还说明 SSE 格式对齐 LangGraph Platform，使 `@langchain/langgraph-sdk/react` 的 `useStream` 能不修改工作，见同文件 `:1` 到 `:9`。这是一种成熟路线：协议不只是“能 stream”，还要让客户端知道 run resource 在哪里。

L2 不等于必须照搬 LangGraph Platform。早期项目可以只实现：

- `POST /sessions/{sessionId}/runs/stream`
- 响应 SSE：`event: agent-ui` + `data: AgentUIEvent JSON`
- header 包含 run URL 或 run id
- 断线后允许客户端用 `GET /runs/{runId}` 拿最终状态

要做什么：

- 把 L1 的 `AgentUIEvent` 序列化为 SSE。
- 建立 `runId`，每次用户输入创建一个 run。
- 每个事件都带 `runId`、递增 `seq`、时间戳，方便断线恢复和审计。
- 提供最小 `GET /runs/{runId}` 或 `GET /sessions/{sessionId}/messages`，避免客户端只能依赖 live stream。

参考哪里：

- `/Users/lienli/Documents/GitHub/agent-ref/deer-flow/backend/app/gateway/routers/thread_runs.py:124`：创建 run 并返回 SSE。
- `/Users/lienli/Documents/GitHub/agent-ref/deer-flow/backend/app/gateway/routers/thread_runs.py:137`：`StreamingResponse` 包装 stream consumer。
- `/Users/lienli/Documents/GitHub/agent-ref/deer-flow/backend/app/gateway/routers/thread_runs.py:147`：`Content-Location` 指向 canonical run resource。
- `/Users/lienli/Documents/GitHub/agent-ref/deer-flow/backend/app/channels/manager.py:849`：IM streaming 渠道通过 `client.runs.stream` 消费 `messages-tuple` 和 `values`。

验收标准：

- 浏览器能实时显示 message delta。
- 工具 started/completed 能在同一个 run 内实时更新。
- 断开 SSE 后，页面刷新能通过 run 或 messages endpoint 恢复最终状态。
- 同一个 session 内并发 run 的策略明确：拒绝、排队或中断，不能默默互相覆盖。

不要提前做什么：

- 不要一上来做 WebSocket 全双工，除非你的第一客户端就是远端终端或协作 IDE。
- 不要一上来完整兼容 LangGraph Platform；兼容性可以通过 adapter 后置。
- 不要把 stream 当唯一读取方式。移动端、企业 IM、Webhook 通常更需要 wait/polling。

## L3：权限、取消、等待，建立控制面

到了 L3，AG-UI 才真正从“展示层”进入“客户端协议”。用户不只是看 agent 输出，还要能批准工具、拒绝危险操作、取消 run、等待最终结果、恢复被中断的任务。

`cc-haha` 的远端控制流是这里最重要的参考。`RemoteSessionManager` 把普通 SDK message 和 control message 分开处理：`control_request` 在 `/Users/lienli/Documents/GitHub/agent-ref/cc-haha/src/remote/RemoteSessionManager.ts:153` 被拦截；`can_use_tool` 在 `:189` 进入 pending map 并回调 UI；权限结果在 `:247` 转成 `control_response` 发回；服务端取消待处理权限请求在 `:159` 到 `:170`；用户 interrupt 在 `:294`。这说明权限不是普通聊天消息，而是 run 的阻塞点。

`blade-code` 从 IDE 协议角度给了另一条证据。`AcpSession` 在构造 `ChatContext` 时把 `confirmationHandler.requestConfirmation` 接到 `this.requestPermission(details)`，见 `/Users/lienli/Documents/GitHub/agent-ref/blade-code/packages/cli/src/acp/Session.ts:316` 到 `:322`。会话模式映射到权限模式在 `:486` 到 `:497`，并在 `:643` 以后根据 yolo、auto-edit、plan、default 决定自动批准、拒绝或请求 IDE 确认。

`deer-flow` 则提供 run 控制面的 HTTP 形态：`/runs/wait` 在 `/Users/lienli/Documents/GitHub/agent-ref/deer-flow/backend/app/gateway/routers/thread_runs.py:152`，`/runs/{run_id}/cancel` 在 `:198`，支持 `interrupt` 和 `rollback`，`join` 在 `:236`，`/runs/{run_id}/events` 在 `:377`。

`hermes-agent` 的 API server 把这套控制面做成 OpenAI-compatible 外壳下的 run protocol：路由注册在 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/gateway/platforms/api_server.py:3357` 到 `:3361`，包括 start run、get run、SSE events、approval、stop。approval handler 在 `api_server.py:3183` 到 `:3247` 接收 `once/session/always/deny`，调用 `tools.approval.resolve_gateway_approval()`；stop handler 在 `api_server.py:3249` 到 `:3287` 先调用 `agent.interrupt()`，再取消 async task，并用 5 秒 bounded wait 避免 HTTP handler 挂死。这是商业级控制面的关键：UI 按钮必须落到 runtime interrupt 和 pending approval 队列，而不只是改 loading 状态。

L3 建议新增的协议面：

```ts
type AgentUIControl =
  | { action: "sendMessage"; sessionId: string; text: string }
  | { action: "approvePermission"; requestId: string; updatedInput?: unknown }
  | { action: "denyPermission"; requestId: string; reason?: string }
  | { action: "cancelRun"; runId: string; mode?: "interrupt" | "rollback" }
  | { action: "waitRun"; runId: string };
```

要做什么：

- 把权限请求建模为 `permission.requested` 事件，包含 `requestId`、`runId`、`callId`、tool name、input、risk summary。
- 提供 HTTP endpoint：approve、deny、cancel、wait。
- agent runtime 遇到权限请求时必须暂停对应 tool call，直到收到控制响应或超时。
- cancel 必须传播到模型流、工具执行和后台任务，而不是只改 UI loading。

参考哪里：

- `/Users/lienli/Documents/GitHub/agent-ref/cc-haha/src/remote/RemoteSessionManager.ts:97`：pending permission request map。
- `/Users/lienli/Documents/GitHub/agent-ref/cc-haha/src/remote/RemoteSessionManager.ts:189`：处理 `can_use_tool`。
- `/Users/lienli/Documents/GitHub/agent-ref/cc-haha/src/remote/RemoteSessionManager.ts:247`：发送权限响应。
- `/Users/lienli/Documents/GitHub/agent-ref/blade-code/packages/cli/src/acp/Session.ts:448`：取消当前 prompt。
- `/Users/lienli/Documents/GitHub/agent-ref/deer-flow/backend/app/gateway/routers/thread_runs.py:198`：取消 run，区分 interrupt/rollback。

验收标准：

- 危险工具调用会进入等待权限状态，UI 能批准或拒绝。
- 拒绝后 agent 收到可理解的失败结果，而不是永久挂起。
- 取消 run 后，SSE 能结束，后台任务不会继续写状态。
- `runs.wait` 或等价接口能给不支持 streaming 的客户端返回最终状态。

不要提前做什么：

- 不要把权限做成纯前端弹窗；服务端必须持有 pending request。
- 不要只有 cancel 按钮没有取消语义；要明确 interrupt/rollback/kill 的差异。
- 不要让工具自己随意弹权限；权限请求应该走统一控制面。

## L4：artifact、attachments、context compact、usage，把产品能力补齐

L4 解决的是商业产品最容易“看起来能用但交付不了”的问题：agent 不只输出文本，还会生成文件；用户也会上传文件；上下文会被压缩；企业用户要看 token 和成本。

artifact 的强证据主要来自 `deer-flow`，不是 `opencode`。`deer-flow` 在 IM channel manager 中从 `present_files` tool call 提取本轮新 artifact，见 `/Users/lienli/Documents/GitHub/agent-ref/deer-flow/backend/app/channels/manager.py:310` 到 `:340`；只允许 `/mnt/user-data/outputs/` 下的虚拟路径转成附件，见 `:353` 到 `:390`；最终把 `artifacts` 和 `attachments` 放进 outbound message，非 streaming 路径在 `:816` 到 `:823`，streaming final 路径在 `:921` 到 `:929`。它还有 artifact HTTP 服务：`/Users/lienli/Documents/GitHub/agent-ref/deer-flow/backend/app/gateway/routers/artifacts.py`。

`opencode` 更准确的说法是：tool result 支持 file attachments，而不是已经提供完整 artifact.created 业务协议。证据在 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/processor.ts:394` 到 `:444`：它过滤 `MessageV2.FilePart`，对 image attachment 做 normalize，再把 file content 写入 `SessionEvent.Tool.Success` 的 content；但这仍然是 tool result 附件能力，不等同于 deer-flow 那种可下载 artifact 管理。

context compact 可以参考 `cc-haha` 的远端消息适配：`status === "compacting"` 被转成 “Compacting conversation…” 系统消息，见 `/Users/lienli/Documents/GitHub/agent-ref/cc-haha/src/remote/sdkMessageAdapter.ts:88` 到 `:103`；`compact_boundary` 被转成 `subtype: "compact_boundary"` 并带 `compactMetadata`，见 `:128` 到 `:139`。`opencode` 的 v2 event 也有 `Compaction.Started/Delta/Ended`，见 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/v2/session-event.ts:329` 到 `:358`，但仍要记住它的实验边界。

`hermes-agent` 对 L4 的补充是“流式展示要遵守平台限制”。`GatewayStreamConsumer` 文件头在 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/gateway/stream_consumer.py:1` 到 `:13` 说明它把同步 callback 放进 queue，再由 async task rate-limit 并 progressive edit 平台消息；tool boundary 用 segment break 表示，见 `stream_consumer.py:39` 和 `:232` 到 `:239`；overflow split、edit failure、flood control、draft streaming fallback 分布在 `:428` 到 `:571`、`:817` 到 `:900`、`:1055` 之后。复刻 Web UI 时你可能只需要 SSE；复刻商业多端时，要像 Hermes 一样把“编辑消息失败、平台限流、不能编辑、草稿流不可用”作为协议适配层问题处理。

usage 可以参考 `deer-flow` 的 `/token-usage`：response model 包含 total tokens、input/output tokens、by_model、by_caller，见 `/Users/lienli/Documents/GitHub/agent-ref/deer-flow/backend/app/gateway/routers/thread_runs.py:71` 到 `:89`，聚合 endpoint 在 `:392` 到 `:398`。`opencode` 也在 step finish 时记录 tokens/cost，见 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/processor.ts:520` 到 `:531`。

L4 建议补充的事件：

```ts
type AgentUIExtendedEvent =
  | { type: "artifact.created"; artifactId: string; runId: string; path: string; mime: string; filename: string; url?: string }
  | { type: "attachment.received"; attachmentId: string; sessionId: string; filename: string; mime: string; size: number }
  | { type: "context.compacting"; sessionId: string; reason: "auto" | "manual" }
  | { type: "context.compacted"; sessionId: string; summaryId?: string; metadata?: unknown }
  | { type: "usage.updated"; runId: string; inputTokens: number; outputTokens: number; cost?: number };
```

要做什么：

- 把 artifact 从“文本里的一行文件名”提升为一等资源：id、path、mime、size、download URL、来源 run/tool call。
- 对用户上传文件建立 attachment 入口，并把可供 agent 使用的 sandbox path 注入上下文。
- 当上下文压缩开始/结束时发事件，客户端能显示边界并避免误以为历史丢失。
- 每个 step/run 记录 usage，至少支持 thread 级聚合。

参考哪里：

- `/Users/lienli/Documents/GitHub/agent-ref/deer-flow/backend/app/channels/manager.py:310`：从 `present_files` tool calls 提取 artifacts。
- `/Users/lienli/Documents/GitHub/agent-ref/deer-flow/backend/app/channels/manager.py:356`：解析虚拟 artifact path 为附件。
- `/Users/lienli/Documents/GitHub/agent-ref/deer-flow/backend/app/channels/manager.py:433`：ingest inbound files。
- `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/processor.ts:396`：tool result attachments。
- `/Users/lienli/Documents/GitHub/agent-ref/cc-haha/src/remote/sdkMessageAdapter.ts:88`：compacting status。
- `/Users/lienli/Documents/GitHub/agent-ref/deer-flow/backend/app/gateway/routers/thread_runs.py:392`：thread token usage。

验收标准：

- agent 生成文件后，UI 能显示文件名、类型、大小和下载入口。
- 上传文件能进入 agent 可访问目录，并能在消息中追踪来源。
- context compact 不会让 UI 历史突然“断掉”；用户能看到压缩边界。
- usage 能按 run/thread 查询，并能区分至少 input/output tokens。

不要提前做什么：

- 不要在 L4 前做复杂 artifact 权限模型；先保证路径安全和下载能力。
- 不要把 artifact 只作为 markdown 链接；那会丢失审计、权限、mime、安全处理。
- 不要把 context compact 当普通系统消息；它会影响历史恢复和用户信任。

## L5：商业级多客户端协议，复刻的不是界面，而是协议平台

L5 才是“商业级复刻”。这一层不是把 Web Chat 做漂亮，而是同一个 agent runtime 可以服务 Web、CLI、IDE、远端终端、IM、Webhook，并且这些客户端共享 run、event、artifact、权限、取消、usage、审计和恢复语义。

`deer-flow` 给的是平台 API 路线：run 是资源，stream/wait/cancel/events/messages/token-usage 都围绕 thread/run 展开。`thread_runs.py` 的 endpoints 从 `:116` 到 `:398` 已经接近一个服务端协议骨架。`channels/manager.py` 则说明同一套 runs API 可以服务不支持 streaming 的 Slack/Discord/Telegram，也可以服务支持 streaming 的 Feishu/WeCom：能力矩阵在 `/Users/lienli/Documents/GitHub/agent-ref/deer-flow/backend/app/channels/manager.py:40` 到 `:48`，非 streaming 走 `runs.wait` 在 `:789`，streaming 走 `runs.stream` 在 `:849`。

`cc-haha` 给的是远端会话路线：WebSocket 订阅远端消息，HTTP POST 发送用户输入，控制消息处理权限与 interrupt。它适合 CLI/远端终端这种需要实时控制、断线重连、viewer-only 的场景。`RemoteSessionConfig.viewerOnly` 在 `/Users/lienli/Documents/GitHub/agent-ref/cc-haha/src/remote/RemoteSessionManager.ts:57`，说明商业客户端还要区分“操作者”和“观察者”。

`blade-code` 给的是 IDE adapter 路线：ACP session 不等于 agent 内核，而是把 prompt、mode、permission、tool call、diff、plan update 映射到 IDE 能理解的 `sessionUpdate`。`sendUpdate` 在 `/Users/lienli/Documents/GitHub/agent-ref/blade-code/packages/cli/src/acp/Session.ts:593`，plan update 在 `:613`，工具 diff 内容在 `:367` 到 `:381`。这说明多客户端协议的关键不是让所有客户端显示同一种 UI，而是让它们共享同一组语义。

`hermes-agent` 同时覆盖 API server 与 ACP 路线。API server 的能力声明在 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/gateway/platforms/api_server.py:10` 到 `:15`，真实路由在 `:3341` 到 `:3361`；ACP session manager 在 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/acp_adapter/session.py:169` 到 `:184` 保存 session id、agent、cwd、history、cancel_event、运行锁和排队 prompts，并在 `:186` 之后提供线程安全 session 管理。这说明 L5 的协议平台需要同时支持 stateless chat、stateful response、long-running run、IDE session 和 IM streaming adapter，而不是把某一种协议当作唯一入口。

L5 的推荐架构是三层：

1. Runtime events：agent 内核发出内部事件，服务端保存原始事件和投影状态。
2. Canonical `AgentUIEvent`：对外稳定协议，包含 run、message、tool、permission、artifact、context、usage。
3. Client adapters：Web SSE、CLI stream、IDE ACP、IM wait/stream、Webhook callback 分别映射。

要做什么：

- 为事件建立持久化 event store，至少支持 `seq`、`runId`、`sessionId`、`type`、`payload`、`createdAt`。
- 建立消息投影、artifact 投影、usage 聚合、权限 pending store。
- 支持多消费模式：stream、wait、poll events、join existing run、webhook completion。
- 为每类客户端写 adapter，而不是让客户端直接吃内部事件。
- 增加租户、权限、审计、速率限制、幂等 key、断线重连和版本协商。

参考哪里：

- `/Users/lienli/Documents/GitHub/agent-ref/deer-flow/backend/app/gateway/routers/thread_runs.py:305`：跨 run 的 thread messages。
- `/Users/lienli/Documents/GitHub/agent-ref/deer-flow/backend/app/gateway/routers/thread_runs.py:377`：run event stream 用于 debug/audit。
- `/Users/lienli/Documents/GitHub/agent-ref/cc-haha/src/remote/sdkMessageAdapter.ts:168`：SDK message 到本地 REPL message 的 adapter。
- `/Users/lienli/Documents/GitHub/agent-ref/blade-code/packages/cli/src/acp/Session.ts:593`：统一 `sendUpdate` 给 ACP client。

验收标准：

- Web 客户端使用 SSE，IDE 客户端使用 ACP，IM 客户端使用 wait/stream，但看到的是同一个 run 的一致状态。
- 任意客户端取消 run 后，其他客户端能观察到 run 结束或 cancelled 状态。
- artifact、permission、usage 不依赖某个 UI 组件存在。
- 协议版本升级时旧客户端不会立即坏掉。
- 生产可观测性覆盖 run latency、tool latency、cancel 成功率、permission 等待时长、stream 断线率、token/cost。

不要提前做什么：

- 不要在 L1/L2 就设计 L5 的所有表和权限系统；那会让最小闭环迟迟跑不起来。
- 不要让某个前端组件反向定义协议。
- 不要把 LangGraph、ACP、CCR 任一协议当唯一真理；商业级系统通常需要 canonical event + 多 adapter。

## 一份更稳的阶段顺序

如果从今天开始实现，我会按这个顺序推进：

| 阶段 | 目标 | 关键产物 | 主要参考 |
| --- | --- | --- | --- |
| L0 | CLI 最小闭环 | `run(prompt) -> text`，本地历史 | `blade-code` ChatContext |
| L1 | 统一事件 | `AgentUIEvent`，message/tool 投影 | `opencode` SessionProcessor |
| L2 | SSE streaming | `/runs/stream`，run resource，恢复查询 | `deer-flow` thread_runs.py |
| L3 | 控制面 | permission/cancel/wait endpoint | `cc-haha` RemoteSessionManager，`deer-flow` cancel/wait |
| L4 | 产品能力 | artifact、attachments、compact、usage | `deer-flow` artifacts/usage，`cc-haha` compact，`opencode` attachments，`pi` custom renderers |
| L5 | 商业协议平台 | event store，多客户端 adapter，审计 | `deer-flow` runs API，`blade-code` ACP，`cc-haha` remote bridge，`hermes-agent` API server/gateway/ACP，`pi` extension UI/events |

如果面向 Guga 当前阶段，可以把这条路线压成更具体的优先级：

| 优先级 | 先做什么 | 暂时不做什么 |
| --- | --- | --- |
| P0 | HTTP Server、最小 SSE、`runId/seq`、message/tool/run 事件、run 状态查询 | WebSocket 全双工、完整 AG-UI 标准兼容、多租户事件库 |
| P1 | permission/cancel/wait endpoint、compact boundary、artifact metadata、usage summary、断线后状态恢复 | 完整 artifact 权限、IM streaming edit、ACP/LSP |
| P2 | canonical event versioning、多客户端 adapter、event store/replay、Webhook/IM/IDE 映射、协议观测指标 | Hermes 式全平台 gateway、复杂租户策略 |

最容易走错的是把 L5 的形态搬到 L1：一开始就做多端、多租户、完整事件库、完整 artifact 权限。更稳的方式是让每层只解决一个主要风险。L0 验证 agent 能跑；L1 验证 UI 不靠猜；L2 验证实时输出；L3 验证人能介入；L4 验证交付物和成本可见；L5 才验证多客户端、协议版本和商业运维。

## 最后判断：复刻 AG-UI 方向，先复刻“事件合同”，再复刻“生态协议”

本文的核心结论是：AG-UI 方向最值得复刻的不是某个聊天界面，而是 agent runtime 与客户端之间的事件合同。

`opencode` 告诉我们，先把流投影成 message/tool/reasoning/patch parts，UI 才不会猜状态。`deer-flow` 告诉我们，run 应该成为服务端资源，stream、wait、cancel、events、usage 都围绕它组织。`cc-haha` 告诉我们，远端客户端必须有控制面，权限请求和取消不是普通消息。`blade-code` 告诉我们，IDE 协议应该做 adapter，把 agent 内核事件翻译成客户端理解的 session update。

真正商业级的实现不是选择其中一个照抄，而是用 L0 到 L5 的路线逐步收敛：先跑通，再事件化，再流式化，再控制化，再产品化，最后平台化。这样做的好处是每一层都有可验收产物，也都有明确“不提前做”的边界；它能防止团队在协议名词里绕很久，却迟迟没有一个可靠的 agent 客户端体验。
