# Agent Hook 设计：把扩展点放进控制流，而不是塞进 EventBus

## 一句话结论

Guga 的 hook 不应该实现成一个更强的 `EventBus`。`EventBus` 适合发布“已经发生的事实”，用于 UI、日志、trace、replay；hook 则必须进入 agent 的控制流，在明确的 phase 上以明确的 result reducer 参与改写、阻断、贡献和审计。

参考 Pi、Claude Code、Blade、OpenCode、DeerFlow/DeepAgentsJS、Hermes 后，可以得到一个稳定判断：

- 观察型扩展可以走事件总线。
- 决策型扩展必须走 HookKernel 或 middleware/execution pipeline。
- hook 的执行顺序不是订阅者自然顺序，而是 `phase -> priority -> load order -> reducer semantics`。
- 每个 phase 都要声明“返回值如何合并”，否则 hook 很快会退化成难以 replay 的 monkey patch。

这份文档是给 Guga 的落地设计参考，不是参考项目导览。它延续 `/Users/lienli/Documents/GitHub/guga-agent/docs/roadmap.md` 里的三分法：`EventBus` 负责事实，`HookKernel` 负责受控扩展点，`CapabilityRegistry` 负责能力声明。

## 项目对比

| 项目 | Hook 路线 | 顺序策略 | Guga 借鉴点 |
| --- | --- | --- | --- |
| Pi agent | 低层 agent loop hook + extension event surface | 对 transform/gate/patch 类事件顺序执行；block/cancel 可短路；资源类事件聚合 | phase 自带 result type；`tool_call`、`tool_result`、`context`、`resources_discover` 很适合成为 Guga 第一批 hook |
| Claude Code | 工具执行 pipeline 内部 hook | 工具调用先分组，安全工具并发，不安全工具顺序；PreToolUse 在权限和执行前进入 pipeline | hook 不挂在事件总线，而放进 tool execution 的关键节点 |
| Blade Agent SDK / Blade Code | `runToolCall` + `ExecutionPipeline` | parse/repair/pre-hook/confirmation/execute/post-hook/history 明确串联 | Guga 的 `tool.call.before`、`tool.execute.before/after`、`tool.result.before` 可以按 pipeline 骨架实现 |
| OpenCode | plugin object + Bus 分离 | Bus 发布事件时偏向异步广播；插件 hook/listener/tool 注册由 server/plugin loader 管 | 不要用 Bus 解决控制流顺序；插件加载和运行时事件要分层 |
| DeerFlow / DeepAgentsJS | ordered middleware | 显式 middleware 列表，依赖顺序写在构造阶段；关键 middleware 必须最后 | 跨切面能力可以用“编排顺序”表达，不要让插件随意插入隐式链 |
| Hermes | Gateway Hooks + Plugin hook callbacks | 轻量 lifecycle hook 和插件决策 hook 分离；`pre_tool_call` first block wins | 区分 fire-and-forget telemetry hook 与会改变行为的 decision hook |

## 参考发现

### Pi：hook 是 typed phase，不只是事件名

Pi 的实现最接近 Guga roadmap 想要的 agent lifecycle hook surface。它同时有两层：

- agent loop 内部 hook：`transformContext`、`beforeToolCall`、`afterToolCall`、`shouldStopAfterTurn`。
- extension/harness 事件：`context`、`before_provider_request`、`before_agent_start`、`tool_call`、`tool_result`、`resources_discover`、`session_before_compact`、`session_before_tree`、`session_start`、`session_shutdown`。

最值得借鉴的是它没有把所有事件当成同一种广播处理，而是给不同事件定义不同 reducer：

- `context`：顺序 transform，每个 handler 看到前一个 handler 改写后的 messages。
- `before_provider_request` / payload：顺序 patch provider request。
- `before_agent_start`：收集 injected messages，并链式改写 system prompt。
- `tool_call`：顺序执行，遇到 block 立即短路。
- `tool_result`：顺序累积 patch，后面的 handler 看到前面 patch 后的 result。
- `resources_discover`：聚合插件贡献的 paths/source。
- `session_before_compact` / `session_before_tree`：允许 cancel 或自定义 compaction/tree 行为。

Pi 的一个风险点也很有价值：它的 `beforeToolCall` 可以修改 tool args，而且测试里显示 mutated args 会直接进入执行。Guga 不建议照搬“原地改 args”，而应要求 hook 返回 typed patch，并在 patch 后重新做必要的 schema/permission 校验。

### Claude Code / Blade：tool hook 要在 execution pipeline 里

Claude Code 和 Blade 的共同教训是：工具 hook 不是普通事件，它必须在执行 pipeline 里占据稳定位置。

Claude Code 的工具流大致是：

```text
assistant tool_use
  -> 收集 tool calls
  -> 按 concurrency safety 分组
  -> schema validation / validateInput
  -> PreToolUse hooks
  -> permission ask/allow/deny
  -> tool.call
  -> tool_result
```

Blade 的表达更像一个可复用 skeleton：

```text
parse args
  -> repair params
  -> onBeforeToolExec
  -> confirmation
  -> execute invocation
  -> normalize result
  -> onAfterToolExec
  -> history
```

这说明 Guga 的 `tool.call.before`、`tool.execute.before`、`tool.execute.after`、`tool.result.before` 不应只是 `eventBus.publish("tool_call")`。它们必须出现在 `AgentLoop` / `ToolExecutionPipeline` 的实际控制路径上。

### OpenCode：Bus 是事实通道，不是顺序协议

OpenCode 的 Bus 更像 server 内部的 decoupled communication layer：session/message/permission/pty 等事实发布给本地订阅者和 SSE/UI。它可以 `Promise.all` 地通知监听者，这对 UI 和 telemetry 很合适，但不适合表达“谁先改写 tool args、谁可以阻断执行、阻断后还要不要继续执行后续 hook”。

OpenCode 对 Guga 的启发是分层：

- plugin loader 负责发现、导入、创建 plugin context。
- plugin object 暴露 tools/listeners/auth/message hooks 等能力。
- Bus 负责广播已经发生或需要呈现的 runtime event。

因此 Guga 也应该避免把 `EventBus` 做成万能插件机制。它可以服务 observability，但不要承担 runtime mutation。

### DeerFlow / DeepAgentsJS：跨切面逻辑用显式 middleware 顺序

DeerFlow 的 agent 是一组 middleware 拼出来的，而不是每个扩展点都暴露给插件自由插队。它的顺序类似：

```text
ThreadData
  -> Uploads
  -> Sandbox
  -> DanglingToolCall
  -> Summarization
  -> Todo
  -> Title
  -> Memory
  -> ViewImage
  -> SubagentLimit
  -> Clarification
```

其中 Clarification 必须最后，因为它可能直接 `goto=END` 中断执行。这种设计告诉 Guga：有些扩展不是“插件 hook”，而是 core runtime 的固定 middleware，例如：

- context budget / summarization
- dangling tool call repair
- permission policy
- subagent limit
- artifact/result truncation
- title/memory side effects

Guga 可以保留 HookKernel 给插件，但核心跨切面机制仍应显式编排，不能完全开放成任意第三方插槽。

### Hermes：telemetry hook 和 decision hook 要分开

Hermes 同时有轻量 Gateway Hooks 和插件系统里的 lifecycle callbacks。它的 `pre_tool_call` 可以返回 block，且 first block wins；而普通 hook invocation 会收集非空返回，并隔离错误。

这对 Guga 的启发是：hook 的 effect 类型必须先声明。

- `observe`：只观察，失败不影响 runtime。
- `transform`：返回 typed patch。
- `gate`：返回 allow/deny/pause。
- `contribute`：追加资源或能力候选。

同一个 phase 可以允许多个 effect，但 reducer 必须按 effect 定义清楚。比如 `tool.call.before` 可以先跑 transform，再跑 gate，也可以按 hook priority 混排；无论选择哪种，都要在 contract 中固定下来。

## 可借鉴模式

Guga 最应该吸收的是这四个模式：

1. Pi 的 typed lifecycle phase：一个事件名不够，phase 必须自带 result type 和 reducer。
2. Claude Code / Blade 的 execution pipeline hook：工具 hook 要放在真实执行链路里，而不是旁路监听。
3. OpenCode 的 Bus 分层：事件总线负责事实传播，插件 loader/registry/hook 负责运行时扩展。
4. DeerFlow / Hermes 的显式顺序：核心 middleware 和 decision hook 都要有可解释的排序、短路和失败策略。

换成 Guga 的实现语言，就是：`HookKernel` 负责“可改变行为的扩展点”，`EventBus` 负责“已经发生的可观察事实”，`CapabilityRegistry` 负责“插件声明和贡献了什么能力”。

## 核心原则

### 1. EventBus 和 HookKernel 分工固定

`EventBus` 发布事实：

- `run.started`
- `message.delta`
- `tool.execution.started`
- `tool.execution.completed`
- `permission.requested`
- `hook.audit`
- `error.raised`

这些事件适合 UI、日志、trace、debugger、metrics、session replay。

`HookKernel` 参与决策：

- 要不要允许这次 tool call？
- 要不要 patch tool args？
- 要不要截断 tool result？
- 要不要给 provider request 增加 system/context patch？
- 要不要取消或定制 compaction？
- 要不要贡献额外 skill/prompt/context path？

判断标准很简单：如果回调返回值会改变后续 agent 行为，就不要放在 EventBus。

### 2. 每个 phase 都要有 result reducer

hook 设计的关键不是“能注册函数”，而是“多个函数返回值怎么合并”。Guga 至少要内置这几类 reducer：

| Reducer | 语义 | 适用 phase |
| --- | --- | --- |
| `observeAll` | 所有 hook 都执行；返回值被忽略或只进 audit；失败隔离 | `session.start`、`run.end`、`model.response.after` |
| `transformChain` | 顺序执行；后一个 hook 看到前一个 hook patch 后的值 | `model.request.before`、`context.assemble` |
| `firstDenyWins` | 顺序执行；第一个 deny/pause 终止后续 gate | `tool.call.before`、`permission.request.before` |
| `patchChain` | 顺序累积 patch；每一步都生成 patch summary | `tool.result.before`、`projection.render.before` |
| `collectContributions` | 聚合 contributions，并保留 source/pluginId | `resources.discover` |
| `firstCancelWins` | 第一个 cancel 终止默认流程；custom result 按规则选择 | `context.compact.before` |

这也是 hook 执行顺序问题的答案：顺序不是 EventBus 的副作用，而是 reducer 的一部分。

### 3. hook 不能直接改 core state

Guga 应禁止插件拿到可变的 `ConversationState`、`ToolRegistry`、`AgentLoop` 实例。hook 只能返回：

- `decision`：allow/deny/pause/cancel。
- `patch`：typed patch，例如 prompt patch、args patch、result patch。
- `contribution`：资源、能力候选、context item。
- `annotation`：给 UI、trace、audit 用的元信息。

这样做会牺牲一点插件自由度，但换来三个核心能力：

- 可以审计。
- 可以 replay。
- 可以在 session replacement / fork / reload 后让 stale context 失效。

### 4. deterministic order 是 contract，不是实现细节

推荐 Guga 使用固定排序：

```text
phase
  -> priority desc
  -> loadTier asc
  -> pluginLoadIndex asc
  -> hookRegisterIndex asc
```

其中：

- `priority`：hook 自己声明，默认 `0`。
- `loadTier`：core < project < user < cli。
- `pluginLoadIndex`：插件加载器给出的稳定顺序。
- `hookRegisterIndex`：同一插件内注册顺序。

debug view 或 trace 里要能解释：“为什么这个 hook 在那个 hook 前面执行”。如果解释不出来，后续排查 tool 被谁改写会很痛苦。

### 5. fail policy 按 phase 区分

不要全局规定“hook 失败就忽略”或“hook 失败就中止”。推荐：

| Effect / Phase | 默认失败策略 | 原因 |
| --- | --- | --- |
| `observe` | fail open | metrics/debug 不应影响 agent |
| `contribute` | fail open + 记录缺失 contribution | 单个资源插件失败不应阻断核心流程 |
| `transform` | fail open，但丢弃该 hook patch | 避免错误 patch 污染 provider/tool |
| `gate` on dangerous tool | fail closed when mandatory | 安全策略不可静默失效 |
| `gate` on non-dangerous tool | fail open 或 pause，取决于 hook permission | 需要兼顾可用性 |
| `context.compact.before` | fail open 使用默认 compaction | 避免 session 因 compaction 插件卡死 |

每个 hook 都必须有 `timeoutMs` 和 `AbortSignal`。超时也是失败，不能无限等待。

## Guga Hook 模型

推荐先把 HookKernel 做成 core contract，而不是直接做完整 PluginHost。第一版可以只支持内存注册，等 PluginHost 成熟后再接 manifest、permissions、reload。

```ts
type HookEffect = "observe" | "transform" | "gate" | "contribute";

type HookDecision =
  | { type: "allow" }
  | { type: "deny"; reason: string }
  | { type: "pause"; reason: string }
  | { type: "cancel"; reason: string };

type HookAnnotation = {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  data?: Record<string, unknown>;
};

type HookPatch<T> = {
  patch?: Partial<T>;
  annotations?: HookAnnotation[];
};

type AgentHook<TEvent, TResult> = {
  id: string;
  pluginId?: string;
  phase: AgentHookPhase;
  priority?: number;
  effect: HookEffect;
  timeoutMs?: number;
  mandatory?: boolean;
  deterministic?: boolean;
  run(
    event: Readonly<TEvent>,
    ctx: HookContext,
    signal: AbortSignal,
  ): Promise<TResult | undefined>;
};
```

`HookContext` 不应暴露 runtime 内部对象，只暴露稳定 facade：

```ts
type HookContext = {
  runtimeId: string;
  sessionId: string;
  runId?: string;
  pluginId?: string;
  now(): Date;
  emitAudit(event: HookAuditEvent): void;
  readResource(uri: string): Promise<unknown>;
  getCapabilitySnapshot(): CapabilitySnapshot;
  assertFresh(): void;
};
```

`assertFresh()` 是为了处理 plugin reload、session fork、session replacement。旧 context 继续操作新 session，是插件系统里非常隐蔽的一类 bug。

## 第一批 phase

M1 不需要一次做完所有 phase。建议第一批只做最能证明模型正确性的节点：

| Phase | Effect | Reducer | 作用 |
| --- | --- | --- | --- |
| `session.start` | `observe` | `observeAll` | 初始化插件运行态、trace、资源缓存 |
| `session.shutdown` | `observe` | `observeAll` | 释放插件资源 |
| `resources.discover` | `contribute` | `collectContributions` | 贡献 skills、prompt templates、themes、context files、MCP servers |
| `model.request.before` | `transform` | `transformChain` | patch provider request、system prompt、context items |
| `tool.call.before` | `transform` / `gate` | `transformChain` + `firstDenyWins` | patch tool args、做 policy 检查 |
| `tool.result.before` | `transform` | `patchChain` | 截断、脱敏、artifact 化、加 annotation |
| `run.end` | `observe` | `observeAll` | 记录 usage、summary、debug telemetry |

第二批再加入：

| Phase | Effect | Reducer | 作用 |
| --- | --- | --- | --- |
| `context.assemble` | `contribute` / `transform` | `collectContributions` + `transformChain` | 插件贡献或裁剪 context 来源 |
| `context.compact.before` | `gate` / `transform` | `firstCancelWins` / `patchChain` | 取消、定制或标注 compaction |
| `context.compact.after` | `observe` / `transform` | `observeAll` / `patchChain` | 标注 compacted result |
| `model.response.after` | `observe` | `observeAll` | usage、trace、projection metadata |
| `tool.execute.before` | `gate` | `firstDenyWins` | 权限、锁、沙箱策略 |
| `tool.execute.after` | `observe` / `transform` | `observeAll` / `patchChain` | 结果规范化、错误标注 |
| `permission.request.before` | `gate` | `firstDenyWins` | 插件参与 allow/deny/pause |
| `permission.resolve.after` | `observe` | `observeAll` | 权限落账、审计 |
| `projection.render.before` | `transform` | `patchChain` | UI renderer / message annotation |

## Tool hook 主流程

Guga 的工具链建议拆成四个 hook，而不是一个巨大的 `tool_call`：

```text
assistant tool_calls
  -> normalize assistant source order
  -> tool.call.before
       - transform args
       - gate policy
  -> schema validation after patch
  -> permission / confirmation / sandbox / locks
  -> tool.execute.before
       - final gate before side effect
  -> execute tool
  -> tool.execute.after
       - observe execution metadata
       - normalize execution error
  -> tool.result.before
       - truncate / redact / artifact reference
       - patch content returned to model
  -> append tool_result messages
  -> EventBus publish completed facts
```

这里的关键顺序是：

1. `tool.call.before` 发生在模型提出 tool call 之后、真实执行之前。
2. args patch 后必须重新做 schema validation。
3. dangerous tool 的 `gate` 应在 permission/confirmation 前后都可出现，但语义不同：
   - `tool.call.before`：判断这次调用是否允许进入权限流程。
   - `tool.execute.before`：判断即将发生的副作用是否仍然允许。
4. `tool.result.before` 只改“回流给模型/投影给 UI 的结果”，不应该伪造底层 execution record。
5. `EventBus` 在关键节点发布事实，但这些事实不驱动是否继续执行。

### 并发工具的顺序

参考 Pi 和 Claude Code，Guga 可以采用：

- preflight hooks 顺序执行，保证 gate/patch deterministic。
- 被允许且声明 concurrency-safe 的工具可以并发执行。
- execution completed event 按完成顺序发布。
- 写入 conversation 的 tool result 按 assistant tool call 原始顺序稳定排序。

这样既不会牺牲并发性能，也不会让模型上下文因为 race condition 变得不可复现。

## Hook result reducer 细则

### `resources.discover`

`resources.discover` 使用贡献聚合，不允许插件直接注册最终能力。

```ts
type ResourceContribution =
  | { kind: "skill"; path: string; source: string }
  | { kind: "promptTemplate"; path: string; source: string }
  | { kind: "contextFile"; path: string; source: string }
  | { kind: "mcpServer"; config: unknown; source: string };
```

HookKernel 聚合 contributions 后交给 ResourceLoader / CapabilityRegistry 解析、去重、冲突检测和审计。

### `model.request.before`

`model.request.before` 是顺序 transform：

```text
request0
  -> hook A patch
  -> request1
  -> hook B patch
  -> request2
```

每个 hook 看到的是当前 request snapshot，而不是原始 request。patch 只能作用于允许的字段，例如 system prompt additions、context item annotations、provider options；不能直接改 conversation history。

### `tool.call.before`

`tool.call.before` 推荐拆成两步 reducer：

```text
transformChain(args)
  -> schema validation
  -> firstDenyWins(policy)
```

也可以把 transform 和 gate 混排，但必须明确“deny 后是否还执行 transform”。为了安全和可解释性，Guga 建议第一版分两段：

1. 所有 args transform 顺序执行。
2. 对 patch 后的 tool call 做 schema validation。
3. gate hooks 顺序执行，第一个 deny/pause 终止。

### `tool.result.before`

`tool.result.before` 使用 patch chain：

```text
result0
  -> redact secret
  -> result1
  -> truncate large content
  -> result2
  -> attach artifact reference
  -> result3
```

这里必须保留原始 execution record，否则调试时会分不清“工具实际返回了什么”和“模型看到的结果是什么”。

### `context.compact.before`

`context.compact.before` 同时支持 gate 和 transform：

- `cancel`：取消本次默认 compaction。
- `patch`：修改 compaction options。
- `custom`：提供自定义 summary/instructions。

第一版建议保守：

- 第一个 `cancel` wins。
- options patch 顺序累积。
- custom summary 只允许一个，多个时按 priority/load order 选择第一个，并记录冲突 audit。

## 审计与 replay

所有会改变行为的 hook 都必须落 `hook.audit`：

```ts
type HookAuditEvent = {
  runId?: string;
  sessionId: string;
  phase: AgentHookPhase;
  hookId: string;
  pluginId?: string;
  effect: HookEffect;
  durationMs: number;
  inputHash: string;
  outputHash?: string;
  decision?: HookDecision;
  patchSummary?: string;
  contributionSummary?: string;
  error?: {
    name: string;
    message: string;
  };
};
```

replay 默认不重跑带副作用的 hook，而是复用记录过的 decision/patch/contribution。只有 hook 显式声明 `deterministic: true`，并且 replay policy 允许时，才可以重跑。

这点很重要：如果 replay 时重新执行 `resources.discover`、`model.request.before` 或 `tool.call.before`，插件版本、文件系统、时间、环境变量变化都可能让同一 session 产生不同结果。

## 分阶段落地

### L0：当前 M0 状态

Guga 已经有 `AgentLoop`、`CapabilityRegistry`、`EventBus` 的雏形。M0 的重点是让事件可观察，不需要让插件参与控制流。

### L1：HookKernel 内存版

先实现：

- `AgentHook` 类型。
- `HookKernel.register()` / `unregister()`。
- `HookKernel.emitPhase()`。
- hook 排序。
- timeout / abort / error isolation。
- `hook.audit` event。
- reducer：`observeAll`、`transformChain`、`firstDenyWins`、`patchChain`、`collectContributions`。

第一批 phase：`session.start`、`session.shutdown`、`resources.discover`、`model.request.before`、`tool.call.before`、`tool.result.before`、`run.end`。

### L2：接入 provider request

把 `model.request.before` 放进 provider 调用前：

- 不允许直接改 conversation state。
- 只允许 patch provider request snapshot。
- patch 后生成 audit。
- provider response 仍通过 EventBus 发布事实。

### L3：接入 tool execution pipeline

实现独立的 `ToolExecutionPipeline`，把工具执行从 `AgentLoop` 中拆出稳定骨架：

```text
normalize call
  -> tool.call.before
  -> validate patched args
  -> permission
  -> tool.execute.before
  -> execute
  -> tool.execute.after
  -> tool.result.before
  -> append result
```

这里是 hook 设计的核心验收点。只要工具 pipeline 的顺序、失败、并发、审计都稳，后续插件系统会容易很多。

### L4：context / compaction hooks

再接 `resources.discover`、`context.assemble`、`context.compact.before/after`：

- 资源贡献先进 ResourceLoader，再进 CapabilityRegistry。
- context 贡献要带 source、budget、priority、freshness。
- compaction hook 可以取消或 patch options，但不能直接改 session log。

### L5：PluginHost 与权限

最后再做完整插件生态：

- manifest。
- namespace。
- load order。
- capability diff。
- enable/disable/reload。
- stale context guard。
- plugin permission by phase/effect。
- project/user/CLI plugin precedence。

## 不建议照搬

### 不建议把 EventBus 升级成万能 hook

OpenCode 的 Bus 适合广播，但不适合表达 mutation order。Guga 如果用 `eventBus.subscribe("tool.call", fn)` 来实现阻断/改写，就会马上遇到：

- listener 是并发还是顺序？
- 第一个 deny 后还跑不跑后续 listener？
- 多个 patch 怎么 merge？
- listener 抛错是忽略还是阻断？
- replay 时重新执行 listener 吗？

这些问题本质上都是 HookKernel 的问题，不是 EventBus 的问题。

### 不建议允许 hook 原地 mutate runtime 对象

Pi 的低层 hook 允许 args mutation，这对小系统很方便，但 Guga 如果要支持 plugin reload、audit、replay、permission，就应改成 typed patch。

### 不建议一开始开放任意 middleware 插槽

DeerFlow 的 middleware 顺序很强，但那是 core 自己控制的 ordered list。Guga 早期不应让第三方插件任意插入 `AgentLoop` 中间层，否则会比 hook 更难审计。

### 不建议把 registry 能力也做成 hook 返回值直接生效

`registerTool()`、`registerProvider()`、`registerRenderer()` 这类能力应该进入 `CapabilityRegistry`，不是 hook 里随手改全局 registry。hook 可以贡献 candidate，最终注册和冲突处理由 registry 做。

## 测试清单

HookKernel 第一版至少需要这些测试：

- 同 phase hooks 按 `priority -> loadTier -> pluginLoadIndex -> hookRegisterIndex` 稳定排序。
- `transformChain` 中后一个 hook 能看到前一个 hook 的 patch。
- `firstDenyWins` 遇到 deny 后不再执行后续 gate hook。
- `collectContributions` 保留每个 contribution 的 source/pluginId。
- `tool.call.before` patch args 后重新 schema validation。
- `tool.result.before` patch 不覆盖原始 execution record。
- observe hook 抛错不影响 agent run。
- mandatory gate hook 超时导致 fail closed。
- hook audit 包含 phase、hookId、pluginId、duration、decision/patch summary。
- replay 使用记录过的 decision/patch，不重跑非 deterministic hook。
- session replacement 后旧 `HookContext.assertFresh()` 抛错。
- 并发工具执行时，preflight 顺序稳定，execution 可并发，conversation result 顺序稳定。

## Guga 落点

Guga 可以把 hook 作为 M1/M3 之间的核心骨架，而不是等完整插件系统再做。推荐落点：

1. M1：实现内存版 `HookKernel`，只支持 core/test 注册 hook。
2. M1：让 `resources.discover`、`model.request.before`、`tool.call.before`、`tool.result.before` 先跑通 reducer 和 audit。
3. M3：拆出 `ToolExecutionPipeline`，把 tool hook 放进真实工具控制流。
4. M4：接入 context/compaction hooks。
5. M5：再引入 PluginHost、manifest、权限、reload 和 stale context guard。

这条路线的好处是：Guga 早期就能回答“hook 顺序、失败、阻断、replay 怎么办”，但不会过早背上完整插件 marketplace 的复杂度。

## 证据索引

- Fact: Guga roadmap 已把 `EventBus`、`HookKernel`、`CapabilityRegistry` 分成三层，并列出首批 phase，见 `/Users/lienli/Documents/GitHub/guga-agent/docs/roadmap.md:97`。
- Fact: Guga roadmap M1 计划实现 `HookKernel`，首批支持 `session.start`、`session.shutdown`、`resources.discover`、`model.request.before`、`tool.call.before`、`tool.result.before`，见 `/Users/lienli/Documents/GitHub/guga-agent/docs/roadmap.md:239`。
- Fact: Pi agent loop 内部有 `transformContext`、`beforeToolCall`、`afterToolCall`、`shouldStopAfterTurn` 等 hook，见 `/Users/lienli/Documents/GitHub/guga-agent/docs/research/repomix/pi-focused-context.xml:8411`、`:8731`、`:8834`。
- Fact: Pi harness 设计把 `context`、provider request、`before_agent_start`、`tool_call`、`tool_result`、session-before events 等分成不同 reducer 语义，见 `/Users/lienli/Documents/GitHub/guga-agent/docs/research/repomix/pi-focused-context.xml:1451`、`:1616`、`:1669`、`:1680`、`:1707`。
- Fact: Pi 把工具、命令、快捷键、flags、renderers、providers 等视为 registry/capability，而不是普通 hook 事件，见 `/Users/lienli/Documents/GitHub/guga-agent/docs/research/repomix/pi-focused-context.xml:1831`。
- Fact: Claude Code 的工具调用分析显示 hook 位于 tool execution pipeline 内，PreToolUse hooks 在权限/执行前参与流程，见 `/Users/lienli/Documents/GitHub/guga-agent/docs/research/source-analysis/claude-code-analysis/analysis/04b-tool-call-implementation.md:37`、`:278`、`:316`。
- Fact: OpenCode Bus 文档显示 bus 主要用于 decoupled communication、SSE/UI/event publish，而不是决策型控制流，见 `/Users/lienli/Documents/GitHub/guga-agent/docs/research/source-analysis/learn-opencode/docs/internals/bus.md:60`。
- Fact: DeerFlow middleware pipeline 明确依赖顺序，Clarification 必须最后，因为它可能中断执行，见 `/Users/lienli/Documents/GitHub/guga-agent/docs/research/source-analysis/deerflow-book/chapters/06-middleware-pipeline.md:20`、`:290`、`:314`。
- Fact: Hermes 区分 Gateway Hooks 和插件 lifecycle callbacks，`pre_tool_call` 可以 block 且 first block wins，见 `/Users/lienli/Documents/GitHub/guga-agent/docs/research/source-analysis/hermes-wiki/concepts/hook-system-architecture.md:14`、`:157`、`:205`。
- Inference: Blade Agent SDK / Blade Code 的 `ExecutionPipeline` 与 `runToolCall` 适合作为 Guga tool execution skeleton；现有 Guga 研究文档已把它归纳为 parse/repair/pre-hook/confirmation/execute/post-hook/history，见 `/Users/lienli/Documents/GitHub/guga-agent/docs/research/agent-tool-management.md`。
