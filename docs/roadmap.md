# Guga Agent Roadmap

这份 roadmap 将 Guga Agent 重新定义为一个 **agent core + plugin ecosystem + desktop workbench** 的工程路线。核心判断是：agent 的不可替代能力应该沉淀为极小的 core；provider、工具、上下文策略、skills、MCP、UI、session 存储、eval 和商业运营都通过 plugin 接入，最终产品体验对齐 OpenClaw 和 Hermes Agent 的桌面端工作台。

设计理念更偏向 pi agent：Guga 不是先做一个大而全的应用，再从应用里拆 SDK；而是先做一个可编程的 agent workbench。core 只负责稳定的生命周期、事件、状态和能力注册，其他能力都在清晰的插件边界里生长。

在这个方向上，`agent hook` 应该成为 core 的一等契约。插件不只是在启动时注册 tool/provider，还可以在 session、context、model、tool、permission、UI projection 等关键节点，以受控、可审计、可回放的方式参与 agent 行为。

## 一句话结论

Guga Agent 的最终形态不是“内置很多功能的 agent”，而是一个 **小内核、强插件、CLI-first、桌面工作台化、可恢复、可审计、可嵌入** 的 agent runtime。

## 当前基线（2026-05-28）

当前仓库已经完成这份 roadmap 的 M0-M12 主线闭环。`packages/core` 已具备 core contracts、agent loop、capability registry、plugin host、hook kernel、permission/tool runtime、provider router、context projection、durable store/replay contracts 等核心边界；first-party 插件也已经覆盖 provider bridge、filesystem/shell/git tools、default context policy、JSONL session store、filesystem artifact store、replay/audit、skills、MCP、host protocol、CLI、operations、eval、code agent 和 deep research agent。

完成状态以 Trellis archive、package surface、research/solution/blog 文档和质量门禁共同为准：

- M0-M12 主线已经完成：core、plugin host、provider、tools/permissions、context、session/replay、skills/MCP、host adapters、production ops、code agent、deep research agent、CLI/workbench protocol、learning/eval flywheel。
- M13-M37 后续扩展也已经完成并归档：review/eval agent、多 agent delegation runtime、memory candidate/governance/JSONL/retrieval/Markdown/review/health/audit/capability surface 等。
- 2026-06-10 首批 Claude Code 平台级 TUI parity 竖切已经落地：host platform surfaces、task progress panel、platform inspection panel、permission overlay、continuity panel、SDK/local-server/stdio parity contract 均有自动化测试；`/compact`、memory auto-inject/write、swarm、多 provider 运维和 IDE/desktop adapter 仍是显式后续范围。
- 每个已完成模块都有对应的 `docs/research/`、`docs/plans/`、`docs/solutions/architecture-patterns/` 和 `blog/build-agent-from-zero-*` 记录。
- 验证门禁在回填本状态前已通过：`pnpm -r typecheck`、`pnpm -r test`、`pnpm build`。

因此本 roadmap 现在是完成基线和后续演进约束，而不是未完成任务队列。后续新增能力仍然要遵守小 core、强插件、事件为事实源、权限在 runtime、上下文为投影的边界。

## 长任务执行纪律

后续每个大模块都必须作为可复用的工程闭环推进，而不是只写代码：

1. 用 `ce-brainstorm` 和 `trellis-brainstorm` 明确需求、范围、MVP、非目标，并创建/更新 Trellis task。
2. 先按 7-layer research funnel 深度调研参考项目，不直接跳 raw source；调研结论沉淀到 `docs/` 下。
3. 用 `ce-plan` 写可执行计划，明确 repo-relative 文件、测试、风险、系统影响和验收标准。
4. 用 `ce-work` 执行实现，并保持每个 implementation unit 可验证。
5. 用 `ce-code-review` 做合并前 review，处理安全、正确性、测试、维护性和项目标准问题。
6. 用 `ce-compound` 把解决过程沉淀到 `docs/solutions/`，让后续 agent 能复用。
7. 用 `write-blog` 在 `blog/` 下补一篇“如果从 0 开始建立 agent”的模块文章。
8. 用 `trellis-finish-work` 完成任务归档、journal 和收尾。

## 参考发现

- **pi agent**：把 `core/agent-session*`、`core/extensions`、`core/tools`、`modes` 分开；extension 可以注册 tools、providers、commands、shortcuts、message renderers、UI primitives，并订阅 lifecycle events。它的启发是：agent 应该像可编程工作台，而不是固定 CLI。
- **pi agent hooks**：extension 暴露了 `before_agent_start`、`resources_discover`、`session_before_compact`、`context`、`tool_call`、`tool_result`、`session_start`、`session_shutdown` 等节点。它的启发是：插件接入不应只靠 registry，还要有稳定的 agent lifecycle hook surface。
- **deepagentsjs**：通过确定性 middleware 顺序组合 filesystem、subagents、summarization、skills、memory、HITL、cache 等能力。它的启发是：复杂 agent 能力应可组合、可关闭、可替换，不应写死进主循环。
- **opencode**：插件通过 hook 介入 tool execution 和 compaction，例如 `tool.execute.before`、`tool.execute.after`、`experimental.session.compacting`。它的启发是：插件生态需要可阻断、可补充、可观察的运行时切点。
- **blade-code**：插件系统有 manifest、namespacing、loader、registry、integrator，并能把 commands、skills、agents、hooks、MCP server 接入既有子系统。它的启发是：插件生态从第一天就需要命名空间、发现、安装、启停和冲突处理。
- **Claude Code / blade-agent-sdk**：PreToolUse/PostToolUse、ExecutionPipeline hooks 说明工具执行前后的 hook 对权限、审计、策略和 UI 状态很关键。它的启发是：hook 必须进入 tool pipeline，而不是作为事后日志。

证据强度：

- `Fact`：参考项目的 token tree / focused context 显示上述目录和接口存在。
- `Inference`：Guga 应采用 pi agent 式可编程工作台哲学，并吸收 opencode/blade/Claude/deepagents 的 hook/middleware 顺序经验，而不是照搬任何一个项目的完整结构。
- `Pending Verification`：具体实现语言、包管理、插件沙箱和签名机制需要在代码落地前再确认。

## 产品最终形态

Guga Agent 是一个 agent runtime platform。它应该让宿主项目可以：

- 创建一个 agent session。
- 注入模型 provider、tools、权限策略、上下文策略和 session store。
- 通过事件流观察 agent 正在做什么。
- 通过插件扩展命令、工具、skills、MCP、UI、providers 和 agent hooks。
- 通过 agent hooks 在受控节点改写 prompt/context、阻断危险动作、贡献资源、补充 UI projection。
- 从 event log 恢复、回放、审计一次 run。
- 先以 CLI 作为最基础形态运行，再在桌面应用、Web、IDE、API、worker 中复用同一个 core。

产品目标分四层对齐：

- **基础使用形态：CLI。** CLI 是 Guga 的最小可用产品，也是所有能力的 dogfood 入口；它必须能完整表达 session、run、permission、tool progress、artifact、resume、fork、debug event。
- **代码能力：对齐 Claude Code 和 OpenCode。** Guga 的 code-agent 目标不是泛聊天，而是本地 coding agent：读写代码、运行命令、管理 diff/test、处理权限、恢复长任务、支持可审计的工具执行。
- **桌面应用：对齐 OpenClaw 和 Hermes。** 桌面目标是把同一套 runtime 事件、权限、artifact 和长任务状态投影成高密度 agent workbench；OpenClaw 是桌面产品形态主参考，Hermes 是成熟长任务/网关/工具/权限/多平台压力样本参考。
- **持续研究和路线自修正。** `任务.md` 和本 roadmap 是 living documents。后续可以边准备参考仓库、边跑 repomix/Graphify/Context Pack、边用 `arch-insight` 形成判断，再持续修正路线。

最重要的产品约束：

- **Core 越小越好。** 任何不是 agent 生命周期必需的能力，都优先做成插件。
- **Plugin 是一等公民。** first-party 能力和 third-party 能力使用同一套插件契约，只是信任级别不同。
- **事件是事实源。** UI、审计、恢复、eval 都从事件和投影派生，不猜字符串。
- **权限在 runtime 层执行。** 模型只能提出意图，不能决定危险动作是否执行。
- **上下文是投影，不是历史。** 模型输入由 core/plugin 共同投影，原始事件和 artifact 不被 summary 替代。

## Core 边界

`packages/core` 只保留不可外包的 agent 内核能力：

- `AgentRuntime`：创建 session、运行 turn、停止、恢复、释放资源。
- `AgentLoop`：模型调用、tool call 回流、max turns、abort、retry、finish 状态机。
- `ConversationState`：system/history/pending 分层，保证 tool call/result 配对。
- `EventBus`：统一发布 session、turn、message、tool、permission、context、usage、error 事件。
- `HookKernel`：定义 typed agent hooks、hook 顺序、effect 权限、timeout、abort、错误隔离和 audit 事件。
- `CapabilityRegistry`：注册 tools、providers、commands、skills、context policies、renderers 等能力。
- `PluginHost`：加载插件、绑定 runtime API、向 `HookKernel` 注册 hooks、隔离 stale context。
- `PermissionKernel`：定义 allow/ask/deny 决策协议，但不内置具体产品 UI。
- `ProjectionKernel`：定义 model input、UI view、audit view 的投影接口。
- `CoreContracts`：稳定类型，包括 messages、tools、provider transport、events、session store、artifact store。

Core 明确不做：

- 不内置 OpenAI/Anthropic/Gemini SDK。
- 不内置 read/write/shell/browser/git 等工具。
- 不内置 CLI/TUI/Web UI。
- 不内置 MCP client。
- 不内置 long-term memory、skills、subagents。
- 不绑定 JSONL、SQLite、Postgres 或对象存储。
- 不读取全局配置文件；配置由 host/plugin 注入。

## Plugin 能力模型

插件不是“附加脚本”，而是 runtime 能力提供者。插件可以声明并注册：

- `provider`：模型 transport、模型元数据、credential resolver、fallback policy。
- `tool`：LLM-callable tool、schema、effect、permission requirement、execution mode、renderer。
- `contextPolicy`：token budget、compaction、tool result truncation、post-compact reinjection。
- `sessionStore`：JSONL、SQLite、remote store、branch/fork/search。
- `skill`：`SKILL.md` 元数据、按需加载、资源路径。
- `mcpServer`：MCP server 配置、工具命名空间、连接生命周期。
- `command`：slash command、快捷键、CLI/RPC 命令。
- `ui`：message renderer、tool renderer、dialogs、status、widgets。
- `hook`：在 session、context、model、tool、permission、projection 等 phase 上注册受控扩展点。
- `eval`：测试场景、trace exporter、replay verifier。

插件契约必须支持：

- manifest：name、version、capabilities、permissions、dependencies、entry。
- namespace：默认 `plugin-name:resource`，MCP 工具采用稳定命名规则，避免冲突。
- load order：core 插件、project 插件、user 插件、CLI 指定插件，有确定优先级。
- capability diff：插件加载后能解释新增/移除的 tools、commands、providers。
- enable/disable/reload：不重启 host 也能刷新能力。
- stale context guard：session 切换、fork、reload 后，旧插件 context 不能继续操作新 session。

## Agent Hook 模型

Hook 是让插件更好接入 agent runtime 的关键，但它必须是 **受控扩展点**，不是任意 monkey patch。Guga 应把 hook 做进 core contract，让插件可以参与关键运行时节点，同时保持 determinism、权限、审计和 replay。

`EventBus`、`HookKernel`、`CapabilityRegistry` 的分工：

- `EventBus`：发布已经发生的事实，主要用于观察、UI、日志、replay。
- `HookKernel`：在特定 phase 执行插件逻辑，允许按声明的 effect 观察、改写、阻断或贡献内容。
- `CapabilityRegistry`：记录插件声明了什么能力，例如 tool、provider、skill、renderer、context policy。

第一批 hook phase：

- `session.start` / `session.shutdown`：建立和释放插件运行态。
- `run.start` / `run.end`：围绕一次用户请求设置临时策略、trace、预算。
- `resources.discover`：插件贡献 skills、prompt templates、themes、context files、MCP server。
- `context.assemble`：插件贡献或裁剪模型输入来源。
- `context.compact.before` / `context.compact.after`：允许取消、调整、标注 compaction。
- `model.request.before`：插件返回 prompt/context patches，不直接修改原始 state。
- `model.response.after`：插件观察模型输出，补充 usage、trace、UI projection。
- `tool.call.before`：在模型提出 tool call 后做 schema 之外的策略检查和参数 patch。
- `tool.execute.before` / `tool.execute.after`：进入真实执行前后做权限、审计、锁、结果标注。
- `tool.result.before`：工具结果回流给模型前做截断、artifact 引用、敏感信息处理。
- `permission.request.before` / `permission.resolve.after`：插件参与权限策略，但最终由 `PermissionKernel` 落账。
- `projection.render.before`：插件贡献 UI renderer 或 message annotation。

Hook effect 必须先声明，再执行：

- `observe`：只能读取 event/context，不能改变 runtime 行为，适合 metrics、logging、debug UI。
- `transform`：只能返回 typed patch，适合 prompt/context/tool args/result projection。
- `gate`：可以 allow/deny/pause，适合权限、policy、dangerous tool guard。
- `contribute`：可以追加资源或能力候选，适合 `resources.discover`、skills、prompt templates。

示例 contract：

```ts
type AgentHook<TEvent, TResult> = {
  id: string;
  phase: AgentHookPhase;
  priority?: number;
  effect: "observe" | "transform" | "gate" | "contribute";
  timeoutMs?: number;
  run(event: TEvent, ctx: HookContext): Promise<TResult>;
};
```

Hook 安全规则：

- hook 顺序必须由 load order、priority、phase 明确决定，并能在 debug view 中解释。
- hook 不能直接 mutate core state，只能返回 patch、decision、contribution 或 annotation。
- mutating/blocking hook 必须产生 audit event，记录 plugin、phase、input hash、decision、patch summary。
- 每个 hook 都有 timeout、abort signal 和错误隔离；危险 phase 默认 fail closed。
- hook 权限按 phase 和 effect 授权，插件不能因为能观察事件就能阻断工具。
- session replacement、fork、reload 后旧 `HookContext` 必须失效。
- replay 时默认不重跑有副作用 hook，只重放其已记录 decision；需要重跑时必须显式标记 deterministic。

## 推荐代码布局

```text
packages/
  core/
    src/
      runtime/
      loop/
      state/
      events/
      hooks/
      registry/
      plugin-host/
      permissions/
      projections/
      contracts/
  plugin-provider-openai/
  plugin-provider-anthropic/
  plugin-tools-filesystem/
  plugin-tools-shell/
  plugin-context-compaction/
  plugin-session-jsonl/
  plugin-skills/
  plugin-mcp/
  plugin-eval/
apps/
  cli/
  server/
  web/
examples/
  minimal-agent/
  custom-tool-plugin/
  custom-provider-plugin/
  custom-ui-renderer/
```

起步阶段可以先放在一个仓库内，但包边界要从第一天保持清晰：core 不反向 import 任何 first-party plugin。

## 设计原则

- **小内核，大外围。** Core 只拥有流程控制和契约；能力在插件里注册。
- **默认可恢复。** 每个 session/run/turn/tool 事件都能落账，恢复不是后补功能。
- **默认可审计。** 每次模型输入、工具执行、权限决策、上下文压缩都有来源和事件。
- **默认 fail closed。** 未声明 effect、permission、schema 或 namespace 的能力不能执行。
- **默认 deterministic order。** 插件、middleware、hooks、context policy 的顺序必须可解释。
- **默认 hook 可审计。** 插件必须先声明 phase/effect/permission，再由 `HookKernel` 执行并记录结果。
- **默认可替换。** Provider、session store、context policy、toolset、UI 都可以替换。
- **默认渐进披露。** Skills、工具详情、长输出、历史内容按需进入上下文，而不是常驻 system prompt。

## M0：Core Kernel Spike（已完成）

**目标：** 证明一个无产品外壳的 core 可以完成 “user -> model -> tool -> model -> final” 的最小闭环。

建设范围：

- 定义 core message、tool call、tool result、usage、event 类型。
- 实现 `AgentLoop` 最小状态机。
- 实现 `CapabilityRegistry`，支持注册 provider 和 tool。
- 实现内存版 `EventBus`。
- 实现一个测试 provider 和一个测试 tool，验证 tool call/result 配对。
- 提供 `createAgentRuntime()`，不依赖 CLI/Web。

退出标准：

- Core 单元测试能模拟一轮 tool-calling。
- 没有具体 provider SDK 类型穿透 core。
- 工具失败作为 structured observation 回到模型。
- 每个 turn 都有可观察事件。

不做：

- 不做真实 provider。
- 不做文件工具。
- 不做 plugin loader。
- 不做持久化。

## M1：Plugin Host And Hook Kernel（已完成）

**目标：** 让 core 能通过插件获得能力，并通过 typed hooks 让插件安全参与 agent 生命周期。

建设范围：

- 定义 plugin manifest 和 capability schema。
- 实现本地插件加载、初始化、启停、reload。
- 插件可注册 provider、tool、command、hook。
- 插件可订阅 lifecycle events。
- 定义 `AgentHookPhase`、`HookEffect`、`HookContext`、hook result contract。
- 实现 `HookKernel`：按 phase 收集 hooks、排序、timebox、abort、隔离错误。
- 首批支持 `session.start`、`session.shutdown`、`resources.discover`、`model.request.before`、`tool.call.before`、`tool.result.before`。
- hook result 统一进入 event/audit log，mutating/blocking hook 必须可追溯。
- 实现 namespace 和冲突处理。
- 实现 stale context guard，session replacement 后旧 context 失效。

first-party 示例插件：

- `plugin-provider-mock`
- `plugin-tool-echo`
- `plugin-command-debug-events`

退出标准：

- 不改 core 代码即可新增一个 tool。
- 不改 core 代码即可新增一个 provider。
- 插件可以通过 hook 贡献 resource path、阻断危险 tool call、给模型输入追加 typed patch。
- hook 的执行顺序、耗时、decision、patch summary 能在 debug event 中看到。
- 插件 reload 后 registry 与事件订阅不残留旧状态。
- 同名资源必须显式 namespace，不允许静默覆盖内建能力。

不做：

- 不做远程安装。
- 不做插件 marketplace。
- 不做插件沙箱。
- 不开放任意 state mutation hook。

## M2：Provider Plugins（已完成）

**目标：** 把模型接入从 core 中完全剥离，建立 provider transport 插件模型。

建设范围：

- 定义 `ProviderTransport`：messages/tools 转换、stream normalization、usage normalization、error normalization。
- 定义 `ModelRegistry`：模型能力、context window、pricing、tool support、thinking support。
- 支持主模型和辅助模型路由。
- 支持 streaming，core 只消费统一 `ModelEvent`。
- 支持 provider fallback 和 retry policy。
- `model.request.before` hook 可返回 prompt/context/tool definition patches，但不能直接调用 provider。
- `model.response.after` hook 可记录 usage、cache、trace annotation，但不能改写 provider 原始响应。

first-party 插件：

- `plugin-provider-openai`
- `plugin-provider-anthropic`
- `plugin-provider-openai-compatible`

退出标准：

- Agent loop 中没有 `if provider === ...`。
- 相同 tool-calling 测试能在至少两个 provider transport 上通过。
- provider error 能归一化为 retryable、auth、rate-limit、context-overflow、payment、fatal。
- usage 和成本事件能从 provider plugin 发出。

不做：

- 不做 provider marketplace。
- 不做完整 credential pool。
- 不做 OAuth 复杂流。

## M3：Tool Plugins And Permission Runtime（已完成）

**目标：** 让 agent 安全执行真实动作，同时保持工具生态可插拔。

建设范围：

- 定义 `ToolDefinition`：name、description、schema、effect、permission、executionMode、resultBudget、renderer。
- 实现 `ExecutionPipeline`：schema validate、arg prepare、permission、timeout、abort、execute、normalize、audit。
- 将 `tool.call.before`、`tool.execute.before`、`tool.execute.after`、`tool.result.before` 纳入 pipeline。
- 实现 allow/ask/deny 权限协议。
- 支持工具并发策略：parallel、sequential、path-scoped。
- 支持工具 partial update 和 structured result。
- pre-tool hooks 可 patch/block；post-tool hooks 可 annotate/truncate/store artifact，但不能吞掉真实工具错误。

补充任务（参考 pi、Claude Code、deepagentsjs 后加入）：

- 实现 tool availability / visibility filter：模型看到工具前，runtime 根据 workspace、permission policy、tool health/check 和 host config 投影可用工具池；不可用工具不应默认暴露给模型。
- 为 filesystem、shell、git 插件定义可替换 execution backend 边界：M3 只实现 local/workspace backend，但 contract 不应把工具长期绑定到单一本地执行环境。
- 定义 interrupt / cancel 后的 tool result 配对策略：一轮响应中 queued、running、cancelled、skipped 的每个 tool call 都必须有对应真实或 synthetic tool result，避免 orphan tool_call/tool_result。
- 定义最小 permission mode/profile：例如 default、deny-all/background、ask-on-write、trusted-session，用于 headless/background agent 和宿主默认策略，不进入企业 policy engine。
- 明确 tool event correlation invariants：每个 tool lifecycle / permission / hook / result event 必须携带足够关联字段，例如 runId、turn、toolCallId、attempt、batchId，支撑后续 audit 和 replay。

first-party 插件：

- `plugin-tools-filesystem`：read、write、edit、grep、find、ls。
- `plugin-tools-shell`：bash/exec，默认 ask。
- `plugin-tools-git`：status、diff、commit 辅助。

退出标准：

- 所有副作用工具都必须经过 permission runtime。
- 危险工具在 permission 前必须经过 `tool.call.before` / `tool.execute.before` gate hooks。
- 工具拒绝、取消、超时、异常都回流为 tool result。
- post-tool hook 失败不会掩盖工具原始失败，只能追加 hook failure annotation。
- 文件工具只能访问声明 workspace/sandbox。
- 并发执行不会并行写同一路径。
- Provider bridge 投影给模型的工具池已经过 visibility filter；被禁用、缺少 backend、越权或 host policy 不允许的工具不可见或有明确不可用原因。
- 中断、取消或批次降级后，conversation state 中不存在 orphan tool_call/tool_result。
- Background/headless permission mode 不会卡在 ask；必须 auto-deny、auto-allow 受限范围，或返回结构化 not-executed result。
- Tool lifecycle events 可以通过 correlation fields 串起 queued、permission、started、progress、completed/failed/denied/cancelled、budgeted 的完整链路。

不做：

- 不做浏览器工具。
- 不做远端执行 sandbox。
- 不做复杂企业策略。

## M4：Context Policy Plugins（已完成）

**目标：** 把“模型看见什么”做成可替换、可审计、可恢复的 context policy plugin，而不是固定 prompt 拼接或单体 `ContextManager`。

核心判断来自 `docs/research/agent-context-management.md` 和九个参考项目的交叉结论：context 不是历史消息本身，而是从事件账本、会话状态、工具 artifact、资源文件、skills、当前 pending turn 和压缩摘要投影出来的一次模型输入。M4 只负责让这个投影过程可插拔、可预算、可压缩、可追踪；长期记忆、向量检索、跨 session semantic memory 留到 M5/M8 之后。

参考项目取舍：

- `blade-code`：采用 `system/history/pending` 分层和 tool call/result 配对保护，避免压缩污染 system 或打断当前轮。
- `blade-agent-sdk`：采用 loop recovery hook 的边界，context overflow 是可恢复分支，不是 `ContextManager` 私自吞掉的异常。
- `claude-code`：采用 append-only session log、auto-compact、PTL fallback、post-compact 文件/plan/skill 重注入的产品经验；不照搬它的完整 CLI 状态机。
- `opencode`：采用 compaction message/part 和 session projection 思路，让 compact boundary 成为协议事实；不把摘要当唯一事实源。
- `hermes-agent`：采用 ContextEngine 可插拔、50% 阈值、防抖、Smart Collapse、三层大工具结果防护和结构化 action-log summary；复杂的 FTS/session split 延后。
- `deepagentsjs`：采用 middleware 组合、大结果文件化、summary middleware 不重写完整 state 的经验；不绑定 LangGraph。
- `deer-flow`：采用 middleware 兜底思路，特别是 dangling tool call 修复和 todo/context 自愈；不采用纯 LangChain middleware 作为 Guga 的 core 形态。
- `cc-haha`：采用 compact boundary 进入客户端协议和 UI projection 的经验，让用户和调试器都能看见上下文发生过变化。
- `pi`：采用 extension-first 的 `resources_discover`、`context`、`session_before_compact` 思路，让插件能贡献资源、触发/取消压缩，并在 session replacement 后重建 cwd-bound services。

M4 的设计原则：

- **Context 是 projection，不是账本。** 原始 session event、tool result、artifact、summary 都保留；模型输入只是某次调用的投影。
- **Policy 只能返回贡献或 patch。** context hook 不能直接 mutate event log、conversation state 或 provider request。
- **先治理工具输出，再做摘要。** 大日志、搜索结果、文件读取、测试输出是爆窗主因，必须先预算、截断、落盘和引用化。
- **压缩是显式事件。** compact start/boundary/summary/failure 都进入 event/audit stream，并能投影到 UI。
- **压缩不能破坏消息合法性。** system 不被压缩，pending 不被压缩，tool call/result 不产生孤儿。
- **恢复优先于聪明。** context overflow、provider prompt-too-long、manual compact 都必须能回到同一用户意图继续执行。
- **后续能力有插槽但不提前实现。** memory、retrieval、enterprise policy、eval-driven prompt tuning 需要接口预留，不进入 M4 主交付。

建设范围：

- 定义 `ContextPolicy` 能力：resource discovery、source contribution、budget planning、tool result shaping、compaction decision、compaction execution、post-compact reinjection。
- 定义 `ModelInputProjection`：每次模型调用的 messages、tool definitions、source metadata、policy decisions、token estimate、reserved output budget、projection hash。
- 定义 context source 类型：system/developer prompt、session history、pending turn、tool result preview、artifact reference、resource file、skill body、plan/todo、compaction summary、host-injected context。
- 支持 `resources.discover`、`context.assemble`、`context.budget`、`context.truncate`、`context.compact.before`、`context.compact.after`、`context.reinject` hooks。
- 实现 `ContextBudgeter`：根据模型 context window、reserved output、tool definitions、pending turn、recent tail 和 provider usage 判断是否需要截断或压缩。
- 实现 `ToolResultStore`：大工具结果不完整进入模型，只给 head/tail preview、摘要、artifact id/path、重读提示和 source metadata。
- 实现 lightweight truncation：按工具类型做 head/tail、snip、Smart Collapse，不调用 LLM 也能降低上下文压力。
- 实现 reactive compaction：provider 返回 context overflow / prompt too long 时，触发 compact + retry 当前轮，且保留原始失败事件。
- 实现 proactive compaction：根据上一轮 usage 或投影 token estimate 接近阈值时，在下一次模型调用前 compact。
- 实现 compaction plugin：保留 system、pending、未闭合工具轮次、recent tail、上一份 summary，并生成新的 summary boundary。
- 实现 post-compact reinjection：当前文件/资源引用、plan/todo、active skills、active tools、permission mode、host context 在 compact 后重新进入 projection。
- 实现 context audit：每次 projection 记录来源、策略、触发原因、token 估算、截断说明、summary parent/cutoff/boundary。
- context hooks 只能贡献 source、返回 typed patch、返回 gate decision 或 annotation，不能覆盖原始 event log。
- replay 时默认使用已记录的 context decisions，不重跑有副作用或非确定性 context hook。

M4 分阶段实现：

**M4a：Model Input Projection Skeleton**

- 建立 `ContextPolicy` / `ContextSource` / `ModelInputProjection` 的最小 contract。
- 把 model request 前的 prompt 拼接改为 projection 流程：collect sources -> order -> budget -> emit projection。
- 每次 projection 产生 source metadata 和 token estimate，即使暂时不压缩。
- `plugin-context-basic` 只做预算检查和最近窗口保护，用来验证 M0-M3 的 loop/provider/tool contract。

退出标准：

- Agent loop 不再手写拼接最终 messages。
- 每次 provider request 都能解释 system、history、pending、tool results、resources 分别来自哪里。
- token estimate 超预算时能返回结构化 context-pressure event，即使还不自动压缩。

**M4b：Tool Result Budget And Artifact References**

- 将工具执行结果拆成 raw result、LLM preview、UI projection、audit metadata 四种视图。
- 单个大结果和单轮聚合大结果都能落到 artifact store 或 workspace-safe 文件引用。
- 搜索、文件读取、shell/test 输出按工具类型保留关键信息，避免一刀切截断。
- `tool.result.before` 与 `context.truncate` 共同保证模型只看到可预算 preview。

退出标准：

- 5MB 日志、超长 grep 结果或完整文件读取不会直接进入模型输入。
- 模型能看到“已省略什么、如何重读”的引用，而不是沉默丢内容。
- UI/audit 仍能访问原始或完整 tool result。

**M4c：Reactive Compact And Pairing Safety**

- provider context overflow 进入 recovery 分支：compact、重建 projection、重试当前用户意图。
- 压缩前先修复或拒绝非法 tool call/result 对，pending turn 默认不可压缩。
- 压缩结果包含 summary、recent tail、boundary、pre/post token、trigger、retained sources。
- compact 失败必须产生可见 error event，并允许降级到更激进的本地 truncation。

退出标准：

- context overflow 不直接终止 run。
- compact 后不存在 orphan tool call/tool result。
- compact boundary 能被 UI/replay/audit 看到。

**M4d：Policy Plugin Hooks**

- 插件可通过 `resources.discover` 贡献 skill、prompt template、context file、project rules。
- 插件可通过 `context.assemble` 贡献 source 或调整优先级，但必须声明 source provenance。
- 插件可通过 `context.compact.before` 取消、延迟或定制一次 compaction。
- 插件可通过 `context.compact.after` 标注 summary、触发 reinjection 或记录质量信号。
- context policy hook 必须有 phase、effect、priority、timeout、permission scope 和 audit event。

退出标准：

- 不改 core 就能新增一种 context policy。
- 插件对模型输入的任何增删改都有 source metadata 和 audit trail。
- session reload/replacement 后旧 hook context 失效，不能继续写入新 session。

**M4e：Post-Compact Reinjection And Projection Replay**

- compact 后自动重注入当前工作状态：活动文件、plan/todo、active skills、active tools、permission mode、host context。
- `ModelInputProjection` 可从 event log 和 context decisions 重建，支撑 M5 replay。
- projection hash 与 source list 写入 event stream，方便后续 eval 比较不同 policy。
- 为 manual compact、auto compact、reactive compact 保持同一套事件和审计语义。

退出标准：

- 压缩后 agent 仍知道当前目标、关键约束、最近文件、计划和下一步。
- 能重建“某一轮模型实际看见了什么”。
- 更换 context policy 后，可以通过 replay/eval 比较行为差异。

first-party 插件：

- M4 首版使用 `@guga-agent/plugin-context-default` 作为单一默认 context policy，证明不改 core 即可替换 context 行为；host/plugin 作者文档见 [`docs/research/context-policy-plugins.md`](research/context-policy-plugins.md)。
- 后续可拆为 `plugin-context-basic`、`plugin-context-tool-results`、`plugin-context-truncation`、`plugin-context-compaction`、`plugin-context-reinjection`，但多包拆分不属于 M4 首版交付。

退出标准：

- Agent loop 中没有散落的 prompt 拼接逻辑，模型输入统一来自 `ModelInputProjection`。
- 大工具输出不会完整塞进模型输入。
- context overflow 是可恢复分支。
- compact 不破坏 tool call/result 配对。
- 插件能通过 `resources.discover` 贡献 skill/prompt/context path。
- 插件能通过 `context.compact.before` 取消或调整一次 compaction，并留下 audit event。
- 每次模型输入都能追踪 source metadata。
- compact boundary、summary、source cutoff、pre/post token 和触发原因都能进入 event stream。
- post-compact 后当前文件、plan、active skills、active tools 不会被摘要“遗忘”。
- replay 可以重建一次模型输入 projection，至少达到 M5 的 session replay 前置要求。

不做：

- 不做长期记忆。
- 不做向量搜索。
- 不做跨 session semantic memory。
- 不做 FTS/session search。
- 不做企业级 context policy 管理后台。
- 不做自动从历史会话提炼用户偏好。
- 不做多 agent 全局共享 memory。
- 不做摘要质量自动评分；M4 只记录质量信号接口，M8 再接 eval。

后续落点：

- M5 接手 append-only event store、artifact store、session resume、fork、projection replay 的持久化能力。
- M6 接手 skills/MCP/resource discovery 的完整生态化，让 M4 的 `resources.discover` 有更多来源。
- M8 接手 context policy versioning、trust model、enterprise allowlist、summary quality eval、sensitive data filtering 和 audit export。

## M5：Session Store And Replay Plugins（已完成）

**目标：** 让 agent 从内存循环变成可恢复、可回放、可分叉的工作台。

**实现备注（2026-05-27）：** M5 采用 local-first durable substrate：core 暴露 store/replay contracts 与 durable side-effect gates，first-party JSONL、filesystem artifact、replay/audit 插件通过同一 public plugin surface 接入。

建设范围：

- 定义 `SessionStore`、`EventStore`、`ArtifactStore` 接口。
- 实现 append-only event log。
- 实现 session resume、fork、tree navigation 的基础协议。
- 实现 projection replay：conversation view、model input view、audit view。
- 实现 interrupted run detection。

first-party 插件：

- `plugin-session-jsonl`
- `plugin-artifact-filesystem`
- `plugin-replay-audit`

退出标准：

- 进程重启后可以恢复 session。
- 可以重建某一轮模型实际看到的输入。
- 可以 fork 到历史节点继续。
- 事件日志 append-only，不覆盖历史。

不做：

- 不做远端同步。
- 不做全文搜索。
- 不做多人协作。

## M6：Skills, MCP, And Capability Discovery（已完成）

**目标：** 让 Guga 能通过标准化资源扩展知识和工具，而不是手工改代码。

建设范围：

- 实现 `plugin-skills`：扫描 host 显式配置的 project/plugin skill paths。
- Skills 采用渐进式加载：metadata 常驻、body 按需、assets 执行时读取。
- 实现 `plugin-mcp`：MCP stdio server 注册、连接、工具转换、namespace。
- 实现 capability discovery：当前启用插件、工具、skills、hooks、stores、providers 可解释。
- 实现 capability diff：插件启停或 reload 前后的新增、移除、变化和冲突可解释。
- 建立 namespace / source / owner metadata；不做 marketplace。

退出标准：

- 插件能贡献 skills。
- MCP 工具与内建工具进入同一个 tool registry。
- 内建工具优先，第三方工具不能覆盖内建能力。
- capability diff 可用于 UI 和审计。

不做：

- 不做复杂 MCP 远程认证。
- 不做 SSE/WebSocket/HTTP MCP transport。
- 不做插件评分/搜索市场。
- 不做自动安装未知插件。

## M7：Host Adapters（已完成）

**目标：** 让同一个 core 可以驱动 CLI、server、web、IDE，而不是每个入口复制 loop。

建设范围：

- `apps/cli`：最小交互、headless run、debug events。
- `apps/server`：run/session API、SSE/event stream。
- `apps/web`：消费 AgentEvent，不管理核心状态。
- `adapter-acp`：把 Guga session 映射到 ACP。
- `adapter-rpc`：JSONL/RPC headless 协议。

退出标准：

- CLI 和 server 使用同一个 core runtime。
- UI 只消费事件和投影，不解析 assistant 文本猜状态。
- permission request 可以跨 CLI/server 表达。
- cancel/resume 在至少两个 host adapter 中表现一致。

不做：

- 不做重型管理后台。
- 不做复杂多人协作 UI。
- 不做 IDE 深度定制。

## M8：Production And Operations（已完成）

**目标：** 把插件化 runtime 变成商业级平台底座。

建设范围：

- 企业级 permission policy plugin。
- Credential pool 和 provider health。
- Eval/replay plugin。
- Audit export。
- Prompt/context versioning。
- Plugin trust：签名、allowlist、capability permission、hook phase allowlist。
- Hook sandbox：限制高危 phase、限制网络/文件访问、记录 hook telemetry。
- Observability：run metrics、tool latency、retry、cost、context pressure。

退出标准：

- 企业能控制模型、工具、权限、日志和数据边界。
- 每次模型调用、工具执行和权限决策都可审计。
- 插件能力有 trust level 和 permission scope。
- 插件 hook 有 phase/effect/permission scope，企业可按 phase 禁用第三方 hook。
- hook timeout、deny、patch、failure 都进入 telemetry 和 audit export。
- Provider、tool、context policy 改动可通过 replay/eval 验证。

不做：

- 不做脱离 eval 的 prompt 实验平台。
- 不做没有 trust model 的 marketplace。
- 不做和 runtime 无关的 BI。

## M9：Code Agent（已完成）

**目标：** 在通用 runtime 之上建设专业 coding agent，而不是把 coding 行为写死进 core。Code Agent 应作为 first-party agent profile / plugin bundle 存在，复用 core 的 tools、permissions、context、session、replay、subagent 和 host protocol。

主要参考：

- Claude Code：coding loop、tool pipeline、permission UI、subagent、CLI/TUI 任务控制面。
- OpenCode：coding agent profile、本地 server、SSE、ACP、LSP、permission config 和多客户端复用。
- pi agent：extension-first session runtime、code-focused workbench 和模式切换，作为 core/plugin 工作台形态补充参考。
- Hermes Agent：长任务执行、terminal/worktree/browser/tool guards、fallback 和运行稳定性，作为极端长任务压力样本。

建设范围：

- 定义 `code-agent` profile：默认工具集、permission profile、context policy、skills、system prompt/resource discovery。
- 实现代码库理解能力：repo map、symbol/search、文件引用、测试发现、计划/任务上下文重注入。
- 实现编辑执行能力：read/write/edit/shell/git/test/browser 等工具以插件方式组合，而不是直接进入 core。
- 实现长任务策略：plan-unit execution、worktree isolation、incremental commits、review gate、resume after interruption。
- 实现 coding-specific context：active files、diff、tests、plan、errors、terminal output、review findings 的投影和压缩。
- 实现 code-agent eval：小型 fixtures、bug-fix tasks、tool-call trace、replay-based regression。
- 产出调研报告：`docs/research/code-agent-architecture.md`。
- 产出博客：`blog/build-agent-from-zero-m9-code-agent.md`。

退出标准：

- 不改 core 即可创建一个 code-agent session。
- code-agent 能从计划执行一个小型改动：读代码、改文件、跑测试、生成 diff、写 review summary。
- 所有副作用动作仍经过 permission runtime。
- code-agent 的上下文、工具、prompt、skills 能被 replay/audit 解释。
- CLI 必须能完整使用 code-agent；桌面/Web 至少能看到同一套 code-agent event stream。

不做：

- 不做 Claude Code 全量 TUI 复制。
- 不做复杂 swarm/team mailbox。
- 不做 IDE 深度集成；ACP/LSP 只做必要协议调研和最小 bridge。
- 不把 coding prompt、工具列表、测试策略写进 core。

## M10：Deep Research Agent（已完成）

**目标：** 建设面向长期研究任务的专业 agent，先服务 Guga 自己的参考项目调研、技术报告、方案比较和证据链管理，再扩展为通用 deep research agent。

主要参考：

- DeerFlow：lead agent、LangGraph-style workflow、research/decompose/synthesize/present_files、middleware guardrails。
- DeepAgentsJS：middleware 组合、subagents、filesystem/artifact、summarization、skills。
- Hermes Agent：长上下文压缩、session search、tool result artifact、research trace 和 report 生成。
- Claude Code / OpenCode：可回放事件、工具状态、权限和终端展示。

建设范围：

- 定义 `deep-research-agent` profile：research planner、source collector、evidence verifier、synthesizer、report writer。
- 实现 evidence ledger：每条结论绑定来源、强度（Fact / Inference / Pending Verification）、引用路径、时间和可复核片段。
- 实现 research workflow：问题框架 -> 分解 -> 检索 -> 阅读 -> 对比 -> 证据合并 -> 报告 -> 待验证问题。
- 实现 artifact-first 输出：报告、附录、证据表、图谱/索引、可复核材料。
- 实现 source policy：本地 docs/context packs/source-analysis 优先，必要时再进 repomix/context/raw source。
- 实现长任务 resume：研究任务可中断、继续、分叉和回放。
- 产出调研报告：`docs/research/deep-research-agent-architecture.md`。
- 产出博客：`blog/build-agent-from-zero-m10-deep-research-agent.md`。

退出标准：

- 能针对一个 Guga 子系统自动产出结构化研究报告，并清楚区分事实、推论和待验证。
- 能按 7-layer funnel 使用参考项目材料，不直接把 raw source 当第一入口。
- CLI 必须能展示研究进度、已读来源、证据强度和当前 synthesis；桌面/Web 后续消费同一事件流。
- 研究报告可被后续 `ce-brainstorm` / `ce-plan` 直接消费。

不做：

- 不做互联网搜索型通用问答产品。
- 不做无证据来源的长文生成。
- 不做自动修改代码；deep research 只产出报告、建议和计划输入。

## M11：CLI-First Host And Desktop/Web Workbench（已完成）

**目标：** 先把 CLI 做成最基础、最可靠的产品形态，再实现对齐 OpenClaw 和 Hermes Agent 的桌面端工作台；Web、未来 IDE/API 都消费同一套 runtime protocol，而不是为每个终端复制 agent loop。M11 是 M7 Host Adapters 的产品化深化：先定 CLI 和 host protocol，再把桌面/Web 作为同一事件流的工作台投影。

主要参考：

- Claude Code：CLI/TUI 状态面、permission/task/agent 控制面、流式工具展示。
- OpenCode：本地 HTTP server、REST + SSE、SDK、ACP、mDNS、CLI/Web/Desktop 复用。
- OpenClaw：桌面应用主参考，后续调研需先 materialize checkout、确认项目版本、源码锚点和可借鉴边界。
- cc-haha：远程/IM/桌面桥接和多客户端投影。
- DeerFlow：FastAPI gateway、channels、message bus。
- Hermes Agent：长任务工作台、gateway session、platform adapter、streaming edit、per-user/per-thread 隔离、权限/审批和工具状态压力样本。

建设范围：

- 定义 Guga Host Protocol：session CRUD、prompt/run、event stream、permission request/response、tool progress、artifact read、resume/fork/cancel。
- 定义事件 schema 与 UI projection：message、reasoning、tool call、tool result、permission、context pressure、compact boundary、agent delegation、artifact。
- 定义 CLI 基础产品目标：interactive run、headless run、debug event stream、permission prompt、resume/fork/cancel、artifact/diff/test output。
- 定义桌面工作台目标：session list、run timeline、event stream、permission queue、tool state、artifact viewer、diff/test output renderer、长任务状态面。
- 定义 Web 工作台目标：先作为轻量 event/artifact/permission viewer，后续再向桌面能力靠齐。
- 实现 server SDK：typed client，避免 CLI/Web 手写协议。
- 调研并决定 AG-UI / ACP / 自定义 SSE 的边界：哪些采用标准，哪些保持 Guga 私有协议。
- 产出调研报告：`docs/research/cli-desktop-web-host-architecture.md`。
- 产出博客：`blog/build-agent-from-zero-m7-m11-cli-host-workbench.md`。

退出标准：

- CLI 能独立完成基础 agent 工作流，不依赖桌面/Web 才可用。
- 桌面/Web 使用同一个 server/runtime，不复制 agent loop。
- 同一个 session 能在 CLI 发起，桌面/Web 观察或接管权限请求。
- Permission、tool progress、artifact、context compact、resume/fork 都有协议事件。
- UI 不解析 assistant 文本猜状态，只消费 typed event/projection。

不做：

- 不做重型管理后台。
- 不做 IM 全平台网关。
- 不在第一版桌面里复制 Hermes 的完整网关复杂度。
- 不做 IDE 深度体验；ACP/IDE 先保留 adapter 插槽。

## M12：Learning, Writing, And Evaluation Flywheel（已完成）

**目标：** 把“做一个 agent”变成可复用学习系统：每个模块有调研、有设计、有实现、有 review、有 solution、有博客、有 eval。Guga 不只产出代码，也产出如何从 0 建立 agent 的连续知识库。

建设范围：

- 为每个大模块维护 `docs/research/<module>.md` 调研报告。
- 为每个大模块维护 `docs/brainstorms/` 和 `docs/plans/` 里的需求/计划链路。
- 用 `docs/solutions/` 沉淀实现中遇到的模式、坑、修复和决策。
- 在 `blog/` 下维护 `build-agent-from-zero-*` 系列文章。
- 建立 replay/eval 数据集：核心 trace、失败恢复、工具权限、context overflow、code-agent task、deep-research task。
- 建立模块完成 checklist：research -> requirements -> plan -> implementation -> tests -> review -> compound -> blog -> finish。

退出标准：

- 每个大模块完成时，至少有一份调研报告、一份计划、一组测试、一次 code review、一份 solution 记录和一篇博客。
- 新 agent session 可以通过 `docs/roadmap.md`、`任务.md`、`docs/research/`、`docs/solutions/` 迅速接上项目上下文。
- 用户可以把博客系列作为学习路径，从 M0 到 code-agent / deep-research / CLI-first desktop/web host 逐步理解 agent 如何构建。

## M13：Review Eval Agent（已完成）

**目标：** 在 coding agent 和 deep research agent 之外，补一个 findings-first 的 review/eval profile，让代码审查和评估分析不被写进 core。

交付：

- `@guga-agent/profile-review-agent`，包含 profile metadata、system prompt、finding ledger 和 Markdown report writer。
- CLI profile selection 支持 review profile。
- 文档闭环：`docs/research/review-eval-agent-architecture.md`、`docs/solutions/architecture-patterns/review-eval-agent-profile.md`、`blog/build-agent-from-zero-m13-review-eval-agent.md`。

## M14：Multi-Agent Delegation Runtime（已完成）

**目标：** 提供第一版多 agent primitive，但保持 delegate-as-tool，不提前引入 swarm、team mailbox 或复杂工作流图。

交付：

- `@guga-agent/plugin-tools-delegation`，提供 `delegate_task` 工具和 delegation plugin。
- 父 agent 可以把一个自包含任务交给隔离 child run，并接收 compact result。
- 文档闭环：`docs/research/multi-agent-delegation-runtime.md`、`docs/solutions/architecture-patterns/multi-agent-delegation-runtime.md`、`blog/build-agent-from-zero-m14-multi-agent-delegation.md`。

## M15：Memory Candidate Ledger（已完成）

**目标：** 建立 memory 的第一层安全边界：只产生可审计候选，不自动写入长期记忆。

交付：

- `@guga-agent/plugin-memory-candidates`，提供 `createMemoryCandidate()` 和 candidate ledger。
- memory candidate 保留 source、scope、confidence、importance、safety 和 provenance。
- 文档闭环：`docs/research/memory-candidate-ledger.md`、`docs/solutions/architecture-patterns/memory-candidate-ledger.md`、`blog/build-agent-from-zero-m15-memory-candidate-ledger.md`。

## M16：Memory Governance Store（已完成）

**目标：** 把 memory candidate 变成可人工治理的 active memory item，而不是让候选直接生效。

交付：

- governance ledger 支持 accept、reject、supersede 等 decision。
- active memory projection 能解释谁接受了什么、替换了什么、为什么仍然有效。
- 文档闭环：`docs/research/memory-governance-store.md`、`docs/solutions/architecture-patterns/memory-governance-store.md`、`blog/build-agent-from-zero-m16-memory-governance-store.md`。

## M17：Memory JSONL Store（已完成）

**目标：** 为 memory candidates 和 governance decisions 提供 local-first durable adapter。

交付：

- `@guga-agent/plugin-memory-jsonl`，提供 `JsonlMemoryStore`、candidate append、decision append 和 record read。
- JSONL reader 暴露 diagnostics，遇到 corrupt/partial data 时 fail closed。
- 文档闭环：`docs/research/memory-jsonl-store.md`、`docs/solutions/architecture-patterns/memory-jsonl-store.md`、`blog/build-agent-from-zero-m17-memory-jsonl-store.md`。

## M18：Scoped Memory Retrieval（已完成）

**目标：** 在 governed memory 上提供确定性检索，但不引入 embedding、向量库或自动 prompt injection。

交付：

- `searchGovernedMemoryItems()` 和 `renderMemoryRetrievalBlock()`。
- 每次 retrieval 必须显式传入 scope，避免跨用户、跨项目或跨工作区泄漏。
- 文档闭环：`docs/research/memory-scoped-retrieval.md`、`docs/solutions/architecture-patterns/scoped-memory-retrieval.md`、`blog/build-agent-from-zero-m18-scoped-memory-retrieval.md`。

## M19：Memory Markdown Export（已完成）

**目标：** 把 active governed memory 投影成可人工检查的 Markdown，而不是直接写 `MEMORY.md` 或 `USER.md`。

交付：

- `renderCuratedMemoryMarkdown()`。
- Markdown projection 按 scope/kind 分组，保留 confidence、importance、tags、source event ids 和安全边界。
- 文档闭环：`docs/research/memory-markdown-export.md`、`docs/solutions/architecture-patterns/memory-markdown-export.md`、`blog/build-agent-from-zero-m19-memory-markdown-export.md`。

## M20：Memory Review Report（已完成）

**目标：** 为 governed memory 提供 typed audit report，让 operator 能看到 active、rejected、superseded、unsafe 和 undecided 状态。

交付：

- `createMemoryReviewReport()` 和 `renderMemoryReviewReport()`。
- report 输出 counts、queues、diagnostics 和 deterministic item lists。
- 文档闭环：`docs/research/memory-review-report.md`、`docs/solutions/architecture-patterns/memory-review-report.md`、`blog/build-agent-from-zero-m20-memory-review-report.md`。

## M21：Memory Review Capability（已完成）

**目标：** 把 memory review 变成可发现的 read-only capability，而不是需要 host 私下知道 helper 函数。

交付：

- `createMemoryReviewPlugin()` 注册 `memory.review` operation。
- capability descriptor 标明 plugin owner、source、trust 和 read-only memory surface。
- 文档闭环：`docs/research/memory-review-capability.md`、`docs/solutions/architecture-patterns/memory-review-capability.md`、`blog/build-agent-from-zero-m21-memory-review-capability.md`。

## M22：Memory JSONL Review Report（已完成）

**目标：** 让 durable JSONL memory 直接产出 typed review report。

交付：

- `JsonlMemoryStore.readReviewReport()`。
- 读取 JSONL records 后重建 governance ledger，再生成 review report 和 diagnostics。
- 文档闭环：`docs/research/memory-jsonl-review-report.md`、`docs/solutions/architecture-patterns/memory-jsonl-review-report.md`、`blog/build-agent-from-zero-m22-memory-jsonl-review-report.md`。

## M23：Memory JSONL Review Markdown（已完成）

**目标：** 让 durable JSONL memory 直接产出 display-ready Markdown audit view。

交付：

- `JsonlMemoryStore.readReviewMarkdown()`。
- 返回 typed report、Markdown string 和 JSONL diagnostics。
- 文档闭环：`docs/research/memory-jsonl-review-markdown.md`、`docs/solutions/architecture-patterns/memory-jsonl-review-markdown.md`、`blog/build-agent-from-zero-m23-memory-jsonl-review-markdown.md`。

## M24：Memory Review Health（已完成）

**目标：** 在 detailed review report 之上补一个 compact health signal，便于 CLI/host/status surface 判断 blocked、review-needed 或 healthy。

交付：

- `createMemoryReviewHealth()` 和 `renderMemoryReviewHealthBlock()`。
- unsafe candidates、governance diagnostics、undecided queues 等进入 health summary。
- 文档闭环：`docs/research/memory-review-health.md`、`docs/solutions/architecture-patterns/memory-review-health.md`、`blog/build-agent-from-zero-m24-memory-review-health.md`。

## M25：Memory JSONL Review Health（已完成）

**目标：** 把 durable JSONL memory 接到 typed review health。

交付：

- `JsonlMemoryStore.readReviewHealth()`。
- 基于 `readReviewReport()` 计算 health，并一起返回 report、health 和 diagnostics。
- 文档闭环：`docs/research/memory-jsonl-review-health.md`、`docs/solutions/architecture-patterns/memory-jsonl-review-health.md`、`blog/build-agent-from-zero-m25-memory-jsonl-review-health.md`。

## M26：Memory JSONL Retrieval（已完成）

**目标：** 把 durable JSONL memory 接到 scope-required retrieval。

交付：

- `JsonlMemoryStore.readRetrieval()`。
- 读取 governance ledger 后执行 deterministic retrieval，保持 explicit scope 和 diagnostics。
- 文档闭环：`docs/research/memory-jsonl-retrieval.md`、`docs/solutions/architecture-patterns/memory-jsonl-retrieval.md`、`blog/build-agent-from-zero-m26-memory-jsonl-retrieval.md`。

## M27：Memory JSONL Curated Markdown（已完成）

**目标：** 让 durable JSONL memory 直接产出 curated memory Markdown。

交付：

- `JsonlMemoryStore.readCuratedMarkdown()`。
- 返回 governed ledger、Markdown string 和 diagnostics。
- 文档闭环：`docs/research/memory-jsonl-curated-markdown.md`、`docs/solutions/architecture-patterns/memory-jsonl-curated-markdown.md`、`blog/build-agent-from-zero-m27-memory-jsonl-curated-markdown.md`。

## M28：Memory JSONL Capability Surface（已完成）

**目标：** 让 JSONL memory 的 read-only projections 在 capability discovery 中可解释。

交付：

- `createMemoryJsonlPlugin()` 除 broad `memory.jsonl` 外，还注册 review、retrieval、curated Markdown projection descriptors。
- capability surface 区分 storage descriptor 和 read-only projection descriptors。
- 文档闭环：`docs/research/memory-jsonl-capability-surface.md`、`docs/solutions/architecture-patterns/memory-jsonl-capability-surface.md`、`blog/build-agent-from-zero-m28-memory-jsonl-capability-surface.md`。

## M29：Memory JSONL Audit Snapshot（已完成）

**目标：** 把 ledger、report、health 和 audit Markdown 聚合成一次 durable memory inspection。

交付：

- `JsonlMemoryStore.readAuditSnapshot()`。
- 单次读取 JSONL 后构建 governance ledger、review report、health 和 review Markdown。
- 文档闭环：`docs/research/memory-jsonl-audit-snapshot.md`、`docs/solutions/architecture-patterns/memory-jsonl-audit-snapshot.md`、`blog/build-agent-from-zero-m29-memory-jsonl-audit-snapshot.md`。

## M30：Memory JSONL Health Markdown（已完成）

**目标：** 为 durable memory health 提供 compact Markdown block。

交付：

- `JsonlMemoryStore.readReviewHealthMarkdown()`。
- 返回 report、health、Markdown block 和 diagnostics。
- 文档闭环：`docs/research/memory-jsonl-health-markdown.md`、`docs/solutions/architecture-patterns/memory-jsonl-health-markdown.md`、`blog/build-agent-from-zero-m30-memory-jsonl-health-markdown.md`。

## M31：Memory JSONL Health Capability（已完成）

**目标：** 让 durable memory health projection 可被 host 通过 capability discovery 发现。

交付：

- `createMemoryJsonlPlugin()` 注册 `memory.jsonl.health` operation descriptor。
- descriptor 标明 first-party read-only memory trust。
- 文档闭环：`docs/research/memory-jsonl-health-capability.md`、`docs/solutions/architecture-patterns/memory-jsonl-health-capability.md`、`blog/build-agent-from-zero-m31-memory-jsonl-health-capability.md`。

## M32：Memory JSONL Audit Snapshot Capability（已完成）

**目标：** 让 durable memory audit bundle 可被 host 发现。

交付：

- `createMemoryJsonlPlugin()` 注册 `memory.jsonl.audit_snapshot` operation descriptor。
- descriptor 复用 JSONL memory ownership、source、namespace 和 read-only trust。
- 文档闭环：`docs/research/memory-jsonl-audit-snapshot-capability.md`、`docs/solutions/architecture-patterns/memory-jsonl-audit-snapshot-capability.md`、`blog/build-agent-from-zero-m32-memory-jsonl-audit-snapshot-capability.md`。

## M33：Memory JSONL Review Markdown Capability（已完成）

**目标：** 让 durable review Markdown projection 可被 host 精确发现。

交付：

- `createMemoryJsonlPlugin()` 注册 `memory.jsonl.review_markdown` operation descriptor。
- broad review descriptor 和 Markdown-specific descriptor 分开，避免 host 猜 projection shape。
- 文档闭环：`docs/research/memory-jsonl-review-markdown-capability.md`、`docs/solutions/architecture-patterns/memory-jsonl-review-markdown-capability.md`、`blog/build-agent-from-zero-m33-memory-jsonl-review-markdown-capability.md`。

## M34：Memory JSONL Review Report Capability（已完成）

**目标：** 让 durable typed review report projection 可被 host 精确发现。

交付：

- `createMemoryJsonlPlugin()` 注册 `memory.jsonl.review_report` operation descriptor。
- typed report、Markdown report 和 broad review surface 分别可发现。
- 文档闭环：`docs/research/memory-jsonl-review-report-capability.md`、`docs/solutions/architecture-patterns/memory-jsonl-review-report-capability.md`、`blog/build-agent-from-zero-m34-memory-jsonl-review-report-capability.md`。

## M35：Memory JSONL Capability Name Constants（已完成）

**目标：** 把 memory JSONL operation names 固定成可导入常量，避免 registration、tests 和 host callers 出现字符串漂移。

交付：

- `MEMORY_JSONL_OPERATION_NAME`、`MEMORY_JSONL_READ_OPERATION_NAMES`、`MEMORY_JSONL_OPERATION_NAMES`。
- plugin registration 和 consumer-facing exports 使用同一组 operation vocabulary。
- 文档闭环：`docs/research/memory-jsonl-capability-name-constants.md`、`docs/solutions/architecture-patterns/memory-jsonl-capability-name-constants.md`、`blog/build-agent-from-zero-m35-memory-jsonl-capability-name-constants.md`。

## M36：Memory JSONL Capability Namespace（已完成）

**目标：** 给 memory JSONL operation descriptor 补 stable namespace，便于 host 按 capability family 过滤。

交付：

- `MEMORY_JSONL_OPERATION_NAMESPACE = "memory-jsonl"`。
- 所有 memory JSONL operation descriptors 带 namespace，同时保留 ownerPluginId 作为 plugin instance identity。
- 文档闭环：`docs/research/memory-jsonl-capability-namespace.md`、`docs/solutions/architecture-patterns/memory-jsonl-capability-namespace.md`、`blog/build-agent-from-zero-m36-memory-jsonl-capability-namespace.md`。

## M37：Memory JSONL Public Capability Exports（已完成）

**目标：** 证明 M35/M36 的 constants 真正从 package entrypoint 对 host callers 可见。

交付：

- `public-exports.test.ts` 从 `@guga-agent/plugin-memory-jsonl` entrypoint 导入 capability constants。
- 测试固定 operation name、namespace、read operation names 和 full operation names 的 public export surface。
- 文档闭环：`docs/research/memory-jsonl-public-capability-exports.md`、`docs/solutions/architecture-patterns/memory-jsonl-public-capability-exports.md`、`blog/build-agent-from-zero-m37-memory-jsonl-public-capability-exports.md`。

## 跨阶段依赖

截至 2026-05-28，下列依赖链已经按顺序落地并通过质量门禁。这里保留依赖图，是为了让后续维护者理解为什么模块按这个顺序形成，而不是把它当作待办列表。

```text
M0 Core Kernel
  -> M1 Plugin Host + Hook Kernel
    -> M2 Provider Plugins
    -> M3 Tool Plugins + Permissions
      -> M4 Context Policy Plugins
        -> M5 Session Store + Replay
          -> M6 Skills + MCP + Capability Discovery
            -> M7 Host Adapters
              -> M8 Production Operations
                -> M9 Code Agent
                  -> M10 Deep Research Agent
                    -> M11 CLI-First Host And Desktop/Web Workbench
                      -> M12 Learning/Writing/Eval Flywheel
```

M13-M37 是在主线完成后追加的扩展链路，不改变 M0-M12 的 core/plugin 边界：

```text
M13 Review Eval Agent
M14 Multi-Agent Delegation Runtime
M15 Memory Candidate Ledger
  -> M16 Memory Governance Store
    -> M17 Memory JSONL Store
      -> M18 Scoped Memory Retrieval
      -> M19 Memory Markdown Export
      -> M20 Memory Review Report
        -> M21 Memory Review Capability
        -> M22 Memory JSONL Review Report
          -> M23 Memory JSONL Review Markdown
          -> M24 Memory Review Health
            -> M25 Memory JSONL Review Health
          -> M26 Memory JSONL Retrieval
          -> M27 Memory JSONL Curated Markdown
          -> M28 Memory JSONL Capability Surface
            -> M29 Memory JSONL Audit Snapshot
            -> M30 Memory JSONL Health Markdown
            -> M31 Memory JSONL Health Capability
            -> M32 Memory JSONL Audit Snapshot Capability
            -> M33 Memory JSONL Review Markdown Capability
            -> M34 Memory JSONL Review Report Capability
              -> M35 Memory JSONL Capability Name Constants
                -> M36 Memory JSONL Capability Namespace
                  -> M37 Memory JSONL Public Capability Exports
```

M2 和 M3 可以部分并行，但都必须建立在 M1 的 plugin host、capability registry 和 hook kernel 上。M3 必须先定义清楚 tool hook 的 fail-closed 语义，否则权限和审计会漂移。M4 必须等 M3 的 tool result contract 稳定，否则 compaction 无法安全处理工具输出。M7 必须等 M5 至少能恢复 session，否则多 host 只会复制临时状态。

M9 依赖 M6 的 skills/MCP/capability discovery、M7 的 host event protocol 和 M5 的 resume/replay。M10 可以与 M9 部分并行，但必须复用同一套 artifact、evidence、session 和 report pipeline。M11 不应在 M9/M10 之前做重 UI；先用它们的真实工作流压协议。M12 贯穿所有阶段，不是最后才做：每个阶段完成时都要补 research、solution、blog 和 eval。

## 已完成工程闭环

原“下一批工程任务”已经完成并归档。完成情况如下：

1. M6 skills/MCP/capability discovery：已完成 research、requirements、`plugin-skills`、`plugin-mcp`、capability diff、namespace、solution 和 `blog/build-agent-from-zero-m6-skills-mcp.md`。
2. M7/M11 CLI host workbench：已完成 `docs/research/cli-desktop-web-host-architecture.md`、host protocol、server/runtime/SDK、CLI、permission/artifact/resume/fork/event stream 基础面、solution 和 `blog/build-agent-from-zero-m7-m11-cli-host-workbench.md`。
3. M8 production operations：已完成 operations health、audit export、eval runner、可观测/审计 surface、solution 和 `blog/build-agent-from-zero-m8-production-ops.md`。
4. M9 code agent：已完成 `profile-code-agent`、coding profile contract、tool/context/session 复用、research、solution 和 `blog/build-agent-from-zero-m9-code-agent.md`。
5. M10 deep research agent：已完成 `profile-deep-research-agent`、evidence/report profile、research、solution 和 `blog/build-agent-from-zero-m10-deep-research-agent.md`。
6. M12 learning/eval flywheel：已完成 eval fixtures、模块文档闭环、solution 和 `blog/build-agent-from-zero-m12-learning-eval-flywheel.md`。
7. M13-M37 follow-up modules：已完成 review/eval agent、多 agent delegation runtime、memory candidate/governance/JSONL/retrieval/Markdown/review/health/audit/capability descriptor/name/namespace/public export 等扩展模块。
8. Trellis 状态：当前 `.trellis/tasks` 下所有 task 均已归档为 `completed`；本 roadmap 后续只记录新一轮演进，不再把 M0-M37 当作未完成队列。

## 暂缓事项

- 复杂 swarm/team mailbox：M14 已完成 delegate-as-tool 形态；更重的自治团队编排仍需等权限、责任转移、trace isolation 和评估协议继续成熟。
- 自动长期语义记忆：M15-M37 已完成 governed memory 和 JSONL projection 基线；跨 session 自动偏好提炼、向量检索、冲突解决和隐私策略仍需独立设计。
- 插件市场：等 trust model、签名、capability permission、评分和分发边界成熟后再做。
- 企业后台：已有 ops/audit/runtime surface；复杂多租户管理后台、BI 和组织级策略 UX 继续后置。
- 远端 sandbox：等本地 permission runtime、tool execution pipeline、audit/replay 和 host protocol 在更多真实任务中稳定后再做。

## 判断是否偏离路线

每做一个新能力都问：

- 这必须在 core 里吗，还是可以作为 first-party plugin？
- 这个能力是否有 manifest、namespace、enable/disable、reload 语义？
- 这个能力需要 registry 还是 hook？如果需要 hook，它的 phase/effect/permission 是否明确？
- 这个能力是否通过事件暴露事实，而不是让 UI 猜字符串？
- 这个能力是否能被 session replay 重建？
- 这个能力是否有权限和审计边界？
- 替换 provider/tool/context/session store 时，agent loop 是否不用改？

如果答案是否定的，就先不要把它并进 core。Guga 的壁垒不是功能更多，而是 core 足够小、插件边界足够稳、恢复和审计足够可靠。
