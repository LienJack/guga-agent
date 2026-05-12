# Agent Tool 管理：从最小可运行到商业级复刻

工具管理的难点，不是让模型“会调函数”，而是让每一次外部行动都处在可声明、可授权、可调度、可回放的运行时边界里。一个 Agent 项目早期最容易犯的错，是在 L0 刚跑通 `read_file()` 之后，立刻把 Bash、插件、远端权限、artifact、并发执行全塞进去。表面上能力变多了，实际上系统还没有回答最基本的问题：模型看见的工具是否真实可用？谁能批准副作用？多个工具能不能同时跑？大结果该给模型还是给文件？UI、日志和下一轮模型上下文各自拿什么？

这篇文章采用 `Article - Deep Dive` 的交付方式，但目标不是做源码导览，而是给出一条“从最小可运行一路演进到商业级复刻”的阶段路线图。路线从 L0 手写一个工具函数开始，到 L1 抽出 `ToolDefinition / ToolRegistry`，L2 建立 `ExecutionPipeline`，L3 把权限和副作用边界放进 runtime，L4 做调度、并发与锁，最后 L5 让结果回流到模型、UI、artifact 和插件体系。

本文的参考证据来自本地参考仓库，版本锚点以当前工作区检出为准。重点路径包括：

- `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/agent/loop/planToolExecution.ts`
- `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/agent/loop/runToolCall.ts`
- `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/tools/execution/ExecutionPipeline.ts`
- `/Users/lienli/Documents/GitHub/agent-ref/blade-code/packages/cli/src/tools/registry/ToolRegistry.ts`
- `/Users/lienli/Documents/GitHub/agent-ref/blade-code/packages/cli/src/acp/Session.ts`
- `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/tool/registry.ts`
- `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/processor.ts`
- `/Users/lienli/Documents/GitHub/agent-ref/deepagentsjs/libs/deepagents/src/middleware/fs.ts`
- `/Users/lienli/Documents/GitHub/agent-ref/deer-flow/backend/app/channels/manager.py`
- `/Users/lienli/Documents/GitHub/agent-ref/cc-haha/src/remote/RemoteSessionManager.ts`
- `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/tools/registry.py`
- `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/toolsets.py`
- `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/tools/approval.py`
- `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/tools/terminal_tool.py`

## 商业级复刻的主线

商业级 Tool Runtime 的核心判断可以压缩成一句话：模型负责提出意图，runtime 负责决定这个意图是否可执行、如何执行、执行结果进入哪里。

这条主线在几个项目里反复出现。`blade-agent-sdk` 把执行链拆成 `planToolExecution`、`runToolCall` 和 `ExecutionPipeline`：先规划并发，再把单次调用送入统一管道，最后由管道处理权限、锁、超时、hook、history 和 result normalization。`blade-code` 把工具注册和 ACP 会话模式放在边界上：`ToolRegistry` 负责向模型暴露什么，`Session` 负责把客户端模式映射为 Blade 权限模式。`opencode` 更强调 session processor：工具调用不是一次函数返回，而是消息 part 的状态机，从 pending 到 running，再到 completed 或 error，并且结果可以带 attachments。`deepagentsjs`、`deer-flow` 和 `cc-haha` 则分别补足了三个商业化边界：大结果不能无限塞回上下文，生成文件要变成可交付 artifact，远端权限请求必须可挂起、可取消、可回复。

因此，不要把路线理解成“功能越来越多”。更准确地说，每一层都在收回一类原本散落在工具函数里的控制权：

- L0 收回“工具调用是否能闭环”的最小事实。
- L1 收回“模型看到什么工具”的声明权。
- L2 收回“工具如何执行”的流程权。
- L3 收回“谁能批准副作用”的安全权。
- L4 收回“多个工具如何相互不踩踏”的调度权。
- L5 收回“结果去哪儿、保留什么、交付什么”的产品权。

## L0：手写一个工具函数，只证明闭环

L0 的目标很小：让模型触发一个真实动作，并把结果作为 observation 写回下一轮消息。这个阶段不需要 registry，不需要插件，不需要权限弹窗，甚至不需要漂亮的 UI。你只需要手写一个工具，例如 `read_file`，写死 JSON schema，解析模型返回的 tool call，执行函数，再用 tool call id 把 tool result 对回去。

要做什么：

- 定义一个最小工具，例如 `read_file({ path })`。
- 手写 schema，保证模型知道参数名和类型。
- 执行模型返回的 tool call，并把结果写回 messages。
- 保留 `tool_call_id`，确保工具请求和工具结果能一一对应。
- 失败时返回结构化 observation，而不是让异常炸穿 agent loop。

参考哪个项目或源码：

- 这一层不建议直接复刻完整框架，而是把 `blade-agent-sdk` 的 `runToolCall` 当作后续目标来反推最小闭环。`/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/agent/loop/runToolCall.ts:115` 开始的 `runToolCall` 展示了单次工具调用最终应该变成什么样：解析参数、修复参数、发出 `tool_started`、调用 execution pipeline、归一化异常并发出 `tool_result / tool_completed`。
- `opencode` 的 session processor 也能作为 L0 状态意识的参考。`/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/processor.ts:286` 在 `tool-input-start` 时创建 pending tool part，`processor.ts:333` 在 `tool-call` 时转为 running。这说明即使是最小闭环，也应该保留“请求已经出现”和“执行已经开始”的区分。

验收标准：

- 模型能调用 `read_file` 读取一个允许范围内的文件，并基于文件内容继续回答。
- 工具失败会返回结构化错误 observation，下一轮模型能看见失败原因。
- `tool_call_id` 和 `tool result` 能稳定对应，不会把 A 工具的结果塞给 B 工具。
- 日志至少能看到工具名、输入、成功或失败、耗时。

不要提前做什么：

- 不要开放任意 shell。L0 的目标是闭环，不是能力最大化。
- 不要做插件系统。插件需要权限、schema 校验、版本和 sandbox，没有这些只是在扩大风险面。
- 不要让工具直接写 UI。工具只产出结果，UI 展示应该晚一层统一处理。
- 不要把所有工具说明手写进 prompt；L0 可以临时写死，但必须知道 L1 会替换掉它。

L0 的边界很重要。它证明“模型到工具再到模型”的回路成立，但不证明系统已经安全。只要工具能产生副作用，L0 就结束了，下一步必须先做声明中心，而不是继续堆工具。

## L1：ToolDefinition 与 ToolRegistry，建立单一声明源

进入 L1 后，系统要解决的第一个商业问题是“模型看到的工具，必须和 runtime 真正能执行的工具一致”。如果 prompt 里手写一份工具说明，代码里再维护一份 schema，迟早会出现模型调用了不存在的参数、禁用工具仍被模型看见、Plan 模式里模型继续尝试写文件这类问题。

这一层的核心抽象是 `ToolDefinition` 和 `ToolRegistry`。`ToolDefinition` 不只是 name、description、schema，还应该带上 effect、permission、concurrency、result budget 和 execute。`ToolRegistry` 则负责注册、去重、索引、按模式过滤，并生成给模型的 function declarations。

可以从一个保守类型开始：

```ts
type ToolEffect = "read" | "write" | "execute" | "external";

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: unknown;
  effect: ToolEffect;
  permission: "auto" | "ask" | "deny";
  concurrency: "parallel" | "exclusive";
  resultBudget: number;
  execute(input: unknown, ctx: ToolContext): Promise<ToolResult>;
};
```

要做什么：

- 实现 `ToolRegistry.register()`、`get()`、`has()`、`listForModel()`。
- 工具 schema、prompt 描述和 execute 都来自同一个 `ToolDefinition`。
- 给工具打 effect 标签：read、write、execute、external。
- 按运行模式过滤工具暴露，例如 plan 模式只暴露只读工具。
- 为后续 deferred tools 预留字段，但先不做动态加载。

参考哪个项目或源码：

- `blade-code` 的 `/Users/lienli/Documents/GitHub/agent-ref/blade-code/packages/cli/src/tools/registry/ToolRegistry.ts:31` 展示了注册内置工具时如何检查重复注册、更新索引并发出事件。`ToolRegistry.ts:173` 通过 `getFunctionDeclarations()` 生成给 LLM 的声明。`ToolRegistry.ts:200` 的 `getFunctionDeclarationsByMode()` 是关键证据：Plan 模式只暴露只读工具，其他模式再走 deferred 过滤。
- `blade-code` 的 `/Users/lienli/Documents/GitHub/agent-ref/blade-code/packages/cli/src/tools/registry/DeferredToolManager.ts:73` 展示了 loaded 工具返回完整 schema、deferred 工具只在系统提示里列名的渐进披露思路。第一版可以不实现，但 L1 的 registry 设计应避免把所有工具永久塞进模型上下文。
- `opencode` 的 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/tool/registry.ts:133` 使用 `InstanceState` 组合 builtin 和 custom tools；`registry.ts:137` 把 plugin tool definition 包装成统一 `Tool.Def`；`registry.ts:304` 的 `tools(input)` 会根据 provider、model 和 agent 信息过滤工具，并允许 plugin 修改 tool definition。
- `hermes-agent` 的 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/tools/registry.py:1` 到 `:15` 直接说明 import chain：工具文件在模块级 `registry.register()`，`model_tools.py` 查询 registry，而不是维护平行数据结构。`ToolEntry` 在 `registry.py:77`，`ToolRegistry` 在 `:151`；它还用 generation counter 和锁处理 MCP 动态刷新，见 `registry.py:158` 到 `:167`。这说明商业级 registry 不只生成 schema，还要面对长进程、多线程和动态工具来源。

验收标准：

- 禁用某个工具后，模型输入中不再出现它的 schema。
- Plan 模式下，写入和执行类工具不会出现在模型可调用工具列表里。
- 工具描述、JSON schema、execute 来源于同一份定义。
- 单元测试覆盖注册、重复注册、注销、按模式过滤、MCP/custom 工具命名冲突。

不要提前做什么：

- 不要把 registry 做成万能插件平台。L1 的目标是声明一致性，不是开放生态。
- 不要只在前端隐藏工具。真正的过滤必须发生在模型请求构造前，执行阶段还要再次校验。
- 不要让工具自己决定是否出现在 prompt 中。暴露策略属于 registry 或 prompt builder。

L1 完成后，系统第一次有了“工具目录”。从这里开始，工具不再是散落的函数，而是可被查询、过滤、审计和后续调度的对象。

## L2：ExecutionPipeline，把函数调用变成受控执行

L2 的目标是建立统一执行管道。没有 pipeline 时，每个工具都会自己处理校验、权限、超时、abort、错误、日志和结果格式；工具越多，行为越不一致。商业系统不能依赖每个工具作者都记得做完所有边界检查。

`blade-agent-sdk` 的 `ExecutionPipeline` 是这一层最值得复刻的骨架。它不是单纯调用 `tool.execute()`，而是在执行前建立 state，解析行为，获取文件锁，进入 scheduler，设置超时，再依次运行 pre hook、参数/权限准备、确认、真正执行、结果归一化、post hook 和 history 写入。

要做什么：

- 在 pipeline 中做参数校验和必要的参数修复。
- 在执行前统一做 permission check，但先保留简单策略，复杂权限放到 L3。
- 支持 `AbortSignal`，用户取消后工具能停止或至少返回 aborted result。
- 支持 timeout，超时返回结构化 error。
- 支持 before/after hooks，用于日志、审计、UI 状态和扩展。
- 统一 `ToolResult`，避免工具随意返回 string、object 或 throw。
- 每次执行写入 execution history 或 audit record。

参考哪个项目或源码：

- `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/agent/loop/runToolCall.ts:121` 解析工具参数，`runToolCall.ts:123` 调用 `repairToolCallParams`，`runToolCall.ts:135` 触发 `onBeforeToolExec`，`runToolCall.ts:148` 调用 `executionPipeline.execute()`，`runToolCall.ts:185` 把异常归一化为 `ToolResult`，`runToolCall.ts:201` 将 result effects 映射为运行时更新。
- `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/tools/execution/ExecutionPipeline.ts:151` 是统一入口 `execute()`。`ExecutionPipeline.ts:181` 构建 `PipelineExecutionState`，`ExecutionPipeline.ts:216` 解析 tool kind 并进入 scheduler，`ExecutionPipeline.ts:226` 的 `executeWithPipeline()` 串起 pre hook、prepare、confirmation、execute invocation、normalize、post hook 和 history。
- `opencode` 的 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/processor.ts:181` 用 `completeToolCall()` 把结果写回 tool part；`processor.ts:207` 用 `failToolCall()` 把错误写成 error state。这是 pipeline 和会话状态协作的好参考。

验收标准：

- 工具超时后返回 error state，并记录 timeout 信息。
- 用户取消时，长工具能收到 abort signal；如果不能立即停止，也必须返回可识别的 aborted/error result。
- 工具抛异常不会让整个 agent loop 无结构崩溃。
- 每次工具执行都有 execution id、tool name、params、result、start/end time、session context。
- hooks 失败不会掩盖原始工具错误，至少要能记录 hook failure。

不要提前做什么：

- 不要把权限弹窗写进具体工具函数内部。工具可以声明风险，是否询问用户由 pipeline/permission manager 决定。
- 不要让每个工具自己决定如何写回 messages。消息、UI、日志、artifact 是 result normalization 之后的分发问题。
- 不要在 L2 就追求复杂并发。先保证单次调用生命周期一致，再进入 L4。

L2 的意义是把“执行”从业务函数里抽出来。此后新增工具只需要描述自己能做什么和如何执行，通用治理能力由 pipeline 提供。

## L3：权限系统与副作用边界，runtime 不能相信模型自证安全

商业 Agent 的风险主要来自副作用：写文件、执行命令、发网络请求、调用外部系统、删除资源。L3 要建立一个原则：模型可以解释为什么要执行，但不能自我授权。授权必须由 runtime 根据模式、规则、路径、安全策略和用户确认来决定。

这一层要把权限模式、工具 effect、路径安全、session-level approval、远端权限桥接都放进 runtime。注意 ACP mode 的映射边界：`blade-code` 在构建 `ChatContext` 时把 ACP 会话模式注入为 Blade 权限模式，证据是 `/Users/lienli/Documents/GitHub/agent-ref/blade-code/packages/cli/src/acp/Session.ts:314`；具体映射逻辑在 `Session.ts:486`，`yolo -> PermissionMode.YOLO`，`auto-edit -> AUTO_EDIT`，`plan -> PLAN`，默认走 `DEFAULT`。不要只引用中间注释或 UI 文案，真正影响执行的是这两个位置。

要做什么：

- 定义权限模式，例如 `default / auto-edit / plan / yolo`。
- 将工具 effect 映射为默认策略：read 可自动，write/execute 默认 ask，危险操作可 deny。
- 做路径安全检查：禁止越界写文件、读密钥、写系统目录、执行危险命令。
- 支持 session-level allow always，但缓存范围必须清楚，不能意外持久化。
- 权限请求要有 request id，可 approve、deny、cancel。
- 权限决策写入日志和 UI 事件，后续可以审计。

参考哪个项目或源码：

- `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/tools/execution/ExecutionPipeline.ts:124` 构建 permission config，`ExecutionPipeline.ts:130` 建立 rule handler，`ExecutionPipeline.ts:131` 建立 path safety handler，`ExecutionPipeline.ts:134` 组合外部 permission handler 和 mode handler。
- `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/tools/execution/ExecutionPipeline.ts:464` 的 `prepareExecution()` 执行工具级校验和权限检查；`ExecutionPipeline.ts:513` 调用规则权限处理器；`ExecutionPipeline.ts:555` 再跑路径安全处理器；`ExecutionPipeline.ts:567` 的 `resolveConfirmation()` 负责将需要确认的请求交给 handler。
- `/Users/lienli/Documents/GitHub/agent-ref/blade-code/packages/cli/src/acp/Session.ts:643` 的 `requestPermission()` 展示了 ACP 会话如何把 permission request 转给 IDE；`Session.ts:667` 使用 session approvals 缓存 allow always；`Session.ts:720` 等待客户端 permission response；`Session.ts:746` 明确 ACP 的 Always Allow 只在本次会话内存缓存，不触发 Blade 持久化。
- `/Users/lienli/Documents/GitHub/agent-ref/cc-haha/src/remote/RemoteSessionManager.ts:189` 处理远端 `can_use_tool` control request，把 request 放入 `pendingPermissionRequests` 并通知回调；`RemoteSessionManager.ts:247` 用 `respondToPermissionRequest()` 把 allow/deny 结果作为 control response 发回远端；`RemoteSessionManager.ts:160` 处理远端取消 pending permission prompt。
- `opencode` 的 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/processor.ts:382` 在检测到重复工具调用循环时触发 `permission.ask()`，说明权限系统不只服务文件写入，也可以服务运行时风险治理。
- `hermes-agent` 的 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/tools/approval.py:1` 到 `:8` 把 dangerous command approval 的职责写清楚：检测、提示、per-session state、永久 allowlist。它用 contextvars 保存当前审批 session，见 `approval.py:26` 到 `:83`；硬阻断列表从 `approval.py:147` 开始；gateway 阻塞队列在 `approval.py:470` 到 `:489`；注册/取消/解析 gateway approval 分别在 `approval.py:492`、`:504`、`:517`；真正检测危险命令的入口在 `approval.py:888`。`tools/terminal_tool.py:1839` 到 `:1845` 则展示 terminal 工具收到 `approval_required` 后返回结构化状态，而不是继续执行。

验收标准：

- 写文件、执行命令、外部副作用默认需要明确权限，除非当前模式明确允许。
- Plan 模式下，写入和执行类工具即使被构造出来也会被 runtime 拒绝。
- 权限请求有 request id，UI/远端客户端可 approve、deny、cancel。
- `allow always` 有明确作用域，至少区分 once、session、persistent。
- 权限拒绝、取消、超时都能回流为结构化 tool result，而不是挂死 agent loop。
- 所有权限决定进入日志或 audit record。

不要提前做什么：

- 不要让模型说“这个操作安全”就执行。模型只能给理由，不能给授权。
- 不要只做前端弹窗。runtime 必须强制执行权限决策，绕过 UI 也不能执行危险操作。
- 不要把 `yolo` 当默认开发模式。它适合受控环境或测试，不适合作为商业默认。
- 不要把 session allow always 偷偷持久化到全局配置，除非产品明确提供这个语义。

L3 完成后，工具系统才开始具备商业安全底线。此前所有“能执行”的能力都只是 demo 能力。

这里需要特别强调 `hermes-agent` 的一个商业级细节：session approval 和 permanent allowlist 是两个不同产品语义。`/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/tools/approval.py:558` 的 `approve_session()` 只批准当前 session；`approval.py:624` 到 `:666` 才是永久 allowlist 的保存路径；`approval.py:564` 到 `:606` 又提供 session-scoped yolo。复刻时不要把“本次会话允许”偷偷写成全局允许，这会把一个可控 UX 便利变成持久安全风险。

## L4：调度、并发与锁，让工具多起来也不互相踩踏

当模型一次返回多个 tool calls 时，最直觉的实现是全部串行执行。这样最安全，但慢。另一个极端是全部并行执行。这样快，但写文件、执行命令、外部副作用可能互相踩踏。商业级调度的重点不是“并行或串行”二选一，而是按工具行为、参数和资源边界做计划。

`blade-agent-sdk` 的 `planToolExecution` 给了一个非常关键的边界：并不是只要 `readonly` 就并行，而是要“只读且并发安全”才进入并行候选。证据在 `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/agent/loop/planToolExecution.ts:58`：只有 `(behavior?.isReadOnly && behavior.isConcurrencySafe)`，或者没有动态 behavior 但工具 kind 是 readonly 且未声明 concurrency unsafe，才会进入 `readonlyCalls`。这意味着并发安全不是模型说了算，也不是工具名看起来像 read 就自动成立。

要做什么：

- 给工具提供 `resolveBehavior(tool, params)`，允许按参数判断是否只读、是否并发安全、是否 destructive。
- 规划 mixed execution：先并行跑 read-only/concurrency-safe，再串行跑 write/execute。
- 在 pipeline 层接入 scheduler，按 readonly/write/execute 分桶限流。
- 对文件操作引入路径级锁：同文件写互斥，同文件读可共享，不同文件可并行。
- 保持结果顺序稳定：并发执行不应打乱消息回填和 UI 状态。

参考哪个项目或源码：

- `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/agent/loop/planToolExecution.ts:29` 定义 `planToolExecution()`。`planToolExecution.ts:34` 在单工具或 Plan 模式下直接 serial；`planToolExecution.ts:48` 将 calls 分成 readonly 和 non-readonly；`planToolExecution.ts:83` 生成 mixed groups。
- `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/tools/execution/ExecutionPipeline.ts:195` 在执行前解析工具行为并决定文件锁模式；`ExecutionPipeline.ts:207` 对 `file_path` 获取锁；`ExecutionPipeline.ts:216` 根据 tool kind 进入 scheduler。
- `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/tools/execution/ConcurrencyScheduler.ts:37` 给 readonly、write、execute 设置默认并发限制，其中 execute 默认 3；`ConcurrencyScheduler.ts:80` 的 `schedule()` 负责按桶排队。
- `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/tools/execution/FileLockManager.ts:1` 明确同一文件支持共享读锁和独占写锁；`FileLockManager.ts:158` 判断能否立即授予锁；`FileLockManager.ts:195` 用队列释放和唤醒后续请求，避免同一文件并发写。
- `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/run_agent.py:10564` 的 `_execute_tool_calls_concurrent()` 是产品态并发工具执行参考；它和 `run_agent.py:10965` 的 `_execute_tool_calls_sequential()` 分开，说明并发不是工具函数内部的小优化，而是 loop 层的执行策略。复刻时要保证并发结果回填仍按 tool call id 和原始顺序对齐，否则下一轮模型会收到错位 observation。

验收标准：

- 两个只读且并发安全的工具可以并行。
- 两个写同一文件的工具不会同时执行。
- 一个读文件和一个写同一文件时，锁语义可解释且测试覆盖。
- mixed plan 可被记录和单元测试验证。
- 并发执行失败不会破坏最终 tool result 与 tool call id 的对应关系。
- execute 类工具有限流，不能一次启动无限 shell 或外部任务。

不要提前做什么：

- 不要相信模型会自己安排安全顺序。模型返回的 tool call 顺序只是意图，不是执行计划。
- 不要把所有工具永久串行。商业级体验会被慢工具拖垮。
- 不要只按工具名判断并发安全。`grep` 可能只读，`read_database` 也可能压垮外部服务；行为要允许动态判断。
- 不要把锁写进每个文件工具内部。锁属于 execution runtime 的资源治理。

L4 的本质是把工具调用从“列表”变成“计划”。计划可以解释、测试、审计，也可以随着产品复杂度继续扩展。

## L5：结果回流、Artifact 与插件，让工具产物成为产品能力

L5 解决的是工具执行之后的事情。一个工具结果通常同时有四个消费者：模型需要压缩后的 observation，UI 需要可展示状态，日志需要审计信息，用户需要文件、图片、报告、patch 等 artifact。如果所有结果都塞成一段纯文本返回给模型，系统很快会遇到上下文爆炸、UI 难展示、文件不可下载、审计不可回放的问题。

这一层要把 `ToolResult` 标准化为多通道结果：`llmContent` 给模型，`display` 给 UI，`metadata` 给日志和状态机，`attachments/artifactIds` 给交付系统，`error` 给失败处理。插件和 MCP 工具也应该接入这套结果模型，不能绕过权限、预算和 sandbox。

要做什么：

- 标准化 `ToolResult`：
  - `success`
  - `llmContent`
  - `display`
  - `metadata`
  - `attachments`
  - `error`
  - `artifactIds`
- 大文本结果进入文件或 artifact，只给模型回传摘要、路径和可继续读取的引用。
- 图片、报告、patch、生成文件不要塞进纯文本 observation，而要成为 attachment/artifact。
- 支持插件工具和 MCP 工具，但它们必须经过 registry、permission、pipeline、result normalization。
- 支持 deferred tools：当前不可见的工具可以被列名或按需加载，但完整 schema 不必常驻上下文。

参考哪个项目或源码：

- `opencode` 的 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/processor.ts:394` 处理 `tool-result`，会过滤并规范化 file attachments；`processor.ts:412` 组合 output、metadata 和 attachments；`processor.ts:444` 调用 `completeToolCall()` 将工具状态落为 completed。错误路径在 `processor.ts:448`，最终进入 `failToolCall()`。
- `opencode` 的 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/tool/registry.ts:137` 将 plugin tool 包装成统一工具定义；`registry.ts:160` 执行 plugin tool；`registry.ts:164` 通过 truncate 处理大输出，并在 `registry.ts:168` 到 `registry.ts:172` 写入 `truncated` 与 `outputPath` metadata。
- `deepagentsjs` 的 `/Users/lienli/Documents/GitHub/agent-ref/deepagentsjs/libs/deepagents/src/middleware/fs.ts:1327` 是大结果 eviction 的关键边界：如果没有 `toolTokenLimitBeforeEvict` 就直接返回，否则执行工具后检查 ToolMessage 长度；`fs.ts:1360` 将超大结果写入 `/large_tool_results/{id}`，再用 preview 替换直接塞回上下文的巨量内容。
- `deer-flow` 的 `/Users/lienli/Documents/GitHub/agent-ref/deer-flow/backend/app/channels/manager.py:333` 从 AI message 的 tool calls 中寻找 `present_files`，读取 `args.filepaths` 作为本轮新 artifact。注意这里不是读全局累计 artifacts，而是从最后一个 human message 之后收集本轮产物。
- `blade-agent-sdk` 的 `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/tools/execution/ResultArtifactStore.ts:10` 展示了把工具结果持久化到 `.blade-tool-results` 或临时目录的最小 artifact store；`ExecutionPipeline.ts:106` 持有 `ResultArtifactStore`，说明 artifact 存储属于执行管道的一部分，而不是 UI 临时拼接。
- `blade-code` 的 `/Users/lienli/Documents/GitHub/agent-ref/blade-code/packages/cli/src/tools/registry/ToolRegistry.ts:316` 注册 MCP 工具，`ToolRegistry.ts:293` 暴露 deferred tools listing。这两个点说明商业工具体系最终会同时面对外部工具接入和上下文预算治理。
- `hermes-agent` 的 `toolsets.py` 展示了工具可见性的控制面：核心工具、memory、session_search、gateway、Home Assistant、kanban、MCP server toolset 都按集合组合。`memory` 与 `session_search` 的定义分别在 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/toolsets.py:193` 和 `:198`，gateway toolset 在 `toolsets.py:519`，MCP server toolset 还会从平台 registry 动态展开，见 `toolsets.py:623`。这给 L5 一个迁移判断：插件化之前先做 toolset 化，因为 toolset 是工具能力、prompt 说明、权限模式和上下文预算之间的共同开关。

验收标准：

- 工具生成文件后，UI 能拿到 artifact 元数据和下载入口。
- LLM 看到的是适合推理的 observation，而不是完整原始输出。
- 超大工具结果会被 eviction 到文件或 artifact，并保留摘要与可追溯路径。
- attachments 有类型、mime、url/path、filename 等结构化字段，并经过大小和格式校验。
- 插件/MCP 工具无法绕过权限系统、超时、结果预算和审计。
- 工具结果可 replay：给定历史记录和 artifact 引用，能复原用户当时看到的关键状态。

不要提前做什么：

- 不要第一版开放任意插件。插件是 L5 能力，不是 L1 的注册便利。
- 不要把 artifact 只写成“文件已生成”的文本。用户和 UI 需要可解析、可下载、可审计的元数据。
- 不要让插件直接把大结果塞进模型上下文。所有外部工具都必须经过 result budget 和 eviction。
- 不要把 artifact store 绑定死在前端。artifact 是 runtime 产物，前端只是消费者。

L5 完成后，工具系统才真正从“模型调用函数”进入“产品交付系统”。此时工具产物不只是下一轮 prompt 的上下文，而是可以被用户打开、下载、审计、复现和再次引用的资产。

## 推荐的最终形态

如果按这条路线演进，最终可以收敛成一组边界清晰的对象：

- `ToolDefinition`：工具声明、schema、effect、预算、execute。
- `ToolRegistry`：注册、索引、过滤、给模型生成声明，管理 builtin/custom/MCP/deferred tools。
- `PermissionManager`：权限模式、规则、路径安全、用户确认、session approval、远端 permission bridge。
- `ExecutionPipeline`：参数校验、权限、锁、超时、hook、执行、history、result normalization。
- `ToolScheduler`：并发计划、桶限流、mixed plan、结果顺序保持。
- `FileLockManager`：路径级读写锁，避免同文件写冲突。
- `ToolResultNormalizer`：把结果拆给模型、UI、日志、artifact。
- `ArtifactStore`：文件、图片、报告、patch 和大结果 eviction 的持久化与索引。
- `SessionProcessor`：把工具状态同步到会话消息、UI 事件和 replay 日志。

这里最值得迁移的不是某个类名，而是控制权分布：声明权在 registry，执行权在 pipeline，授权权在 permission manager，调度权在 scheduler，交付权在 artifact store。只要这些权力边界没有分清，工具越多，系统越脆。

## 迁移顺序与风险判断

适合大多数团队的迁移顺序是：

1. 先做 L0，用一个只读工具证明模型工具闭环。
2. 再做 L1，把工具声明从 prompt 里收回到 registry。
3. 做 L2，把所有工具统一接入 pipeline。
4. 做 L3，把写入、执行和外部副作用纳入 runtime 权限。
5. 做 L4，只让只读且并发安全的调用并行，其余串行或加锁。
6. 做 L5，把结果拆成模型 observation、UI display、metadata、attachments 和 artifact。

两个边界条件需要保留批判性。

第一，`blade-agent-sdk` 的路线偏 runtime 完整，适合要做 IDE agent、CLI agent、企业内 agent 平台的团队。如果只是一个内部脚本型 agent，完整复刻 L3 到 L5 可能过重，但仍建议至少保留 effect、permission 和 result budget 三个字段。

第二，`opencode` 和 `blade-code` 都展示了插件、custom tools、MCP/deferred tools 的吸引力，但插件不是早期增长捷径。插件会把 schema 不一致、权限绕过、输出过大、依赖环境不稳定等问题放大。只有当 L1 到 L3 已经稳定，L5 的插件化才值得开放。

最终结论很简单：商业级 Tool 管理不是让模型拥有更多手，而是让每只手都知道边界。先从一个函数跑通闭环，再把声明、执行、权限、调度和交付逐层收回 runtime。这样复刻出来的不是 demo，而是可以被授权、观察、恢复、审计和扩展的行动系统。
