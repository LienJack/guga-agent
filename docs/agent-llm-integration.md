# Agent LLM 接入路线图：从最小可运行到商业级复刻

LLM 接入最容易被低估。很多 agent 原型的第一行代码是 `callOpenAI(messages)`，它确实能跑，但它不是 agent 架构的 LLM 层；它只是一次 HTTP 调用。真正的 LLM 层会逐步承担五类复杂度：provider 差异、streaming 事件、tool/schema 兼容、错误与上下文恢复、以及商业化 provider 平台。

这篇文章的目标不是一次性复刻 `opencode`。更合理的路线是：先让一个 provider call 可靠跑通，再把 adapter、event、capability、retry、provider registry 一层层长出来。每一层都有验收标准，也有明确的“不要提前做什么”。做早了会把 demo 压垮，做晚了会让 runtime、tool executor、context manager 全部被 provider 细节污染。

本文采用 `Article - Deep Dive` 的证据方式：所有关键判断都绑定到真实源码路径。参考源主要来自本地 reference repo，版本锚点记录在 `/Users/lienli/Documents/GitHub/guga-agent/docs/research/intake/source-contract.md`。新增的 `hermes-agent` 不作为 L0 范本，而作为 L4/L5 的 provider 运营、native adapter 和错误分类参考。

## 总路线：LLM 层不是模型调用，而是可演进的模型边界

从架构责任看，LLM 接入要从窄到宽分成六级：

- L0：单 provider call，只证明 agent 能拿到模型输出。
- L1：统一 `LLMClient`，让 runtime 不再直接依赖 OpenAI、Anthropic、Vercel AI SDK 或 LangChain 类型。
- L2：streaming event adapter，把 provider stream 投影成 runtime 能消费的事件。
- L3：tool-call、schema、reasoning、cache、media、usage 等模型能力适配。
- L4：错误归一化，以及 context overflow / compaction / retry 的恢复回路。
- L5：商业级 provider 平台，支持 provider registry、模型发现、动态 SDK、认证、配置、成本与观测。

一个重要边界要先讲清楚：`tool_result` 不一定属于纯 LLM adapter。很多系统里，模型只产出 tool call，工具执行、权限、人类确认、结果落库属于 runtime 或 tool executor。`opencode` 的 `SessionProcessor` 会处理 `tool-call`、权限与 `tool-result` 落会话模型，证据在 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/processor.ts:333` 和 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/processor.ts:394`。`blade-agent-sdk` 的 `runTurn` 也把 streaming+tools 分支交给 `StreamingToolExecutor.collectAndExecute`，见 `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/agent/loop/runTurn.ts:146` 和 `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/agent/loop/runTurn.ts:169`。所以路线图里的 LLM event 可以包含“工具相关事件”，但工具结果的产生者通常不该是 provider adapter 本身。

另一个边界是错误分类：权限拒绝更像 runtime/tool 层事件，不是 provider error。模型 API 失败、限流、上下文溢出、tool call parse 失败，才更像 LLM/provider error。把权限拒绝塞进 provider error，会让 retry 策略误判成“换模型再试”。

## L0：单 provider call，目标是打通而不是抽象

L0 要做的事情很少：写一个最小函数，把 `system/user/assistant` messages 发给一个固定 provider，拿回文本，接到 agent loop。它可以是 `generateText`、`streamText`、OpenAI SDK、Anthropic SDK 或 LangChain 的一次调用。这个阶段的价值是验证产品假设：prompt 是否能让 agent 做事，tool 是否真的需要，context 是否会马上爆。

参考 `blade-agent-sdk` 的价值，不是照搬整个 `VercelAIChatService`，而是看它如何把 provider 初始化集中在一个位置。`VercelAIChatService.createModel` 根据 `provider` 选择 OpenAI、Anthropic、Gemini、Azure 或 OpenAI-compatible，路径是 `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/services/VercelAIChatService.ts:146`。这说明即使在早期，也不要把 provider 初始化散落在 agent loop、CLI command、API handler 里。

验收标准很朴素：一个固定模型能完成单轮文本响应；失败时能把原始错误打到日志；调用代码只出现在一个文件或一个 service 里；测试或手工验证覆盖“正常返回、AbortSignal 中断、空响应”三种情况。

不要提前做：不要做 provider registry；不要设计十几个模型能力字段；不要支持并行 tool calls；不要为了未来多 provider 引入复杂插件系统。L0 的抽象越多，越容易在没有真实压力时做错。

## L1：统一 LLMClient，挡住 SDK 类型泄漏

L1 的目标是定义自己的接口，例如：

```ts
interface LLMClient {
  complete(input: ModelTurnInput, signal?: AbortSignal): Promise<ModelTurnOutput>;
}
```

这里的关键不是接口长什么样，而是 agent loop 只能依赖你的 `ModelTurnInput` / `ModelTurnOutput`，不能依赖 provider SDK 的 message、tool、usage、metadata 类型。`blade-agent-sdk` 的 `VercelAIChatService` 已经在做这件事：`convertMessages` 把内部 `Message` 转成 AI SDK message，`convertTools` 把 JSON Schema tool 转成 AI SDK tool，`convertOutputFormat` 转 schema output，证据在 `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/services/VercelAIChatService.ts:251`、`:338`、`:366`。这就是 L1 最值得借鉴的点。

`deer-flow` 的 `create_chat_model` 展示了 Python/LangChain 版的同一思想：模型构造从配置读取 `use`、thinking、reasoning、stream_usage，再返回统一的 `BaseChatModel`，路径 `/Users/lienli/Documents/GitHub/agent-ref/deer-flow/backend/packages/harness/deerflow/models/factory.py:50`。它提醒我们，统一接口不只是 TypeScript 的事情；只要 agent runtime 不想被 provider 绑死，就需要一个模型工厂或 client 边界。

验收标准：agent loop 不 import provider SDK；所有 provider message/tool/schema 转换集中在 adapter；能替换同协议 provider，例如 OpenAI official 与 OpenAI-compatible；usage 字段即使不完整，也通过自己的类型表达“不可靠/缺失”。

不要提前做：不要把 streaming、tool execution、compaction 都塞进 `LLMClient.complete`；不要让 `AIMessage`、`BaseMessage`、`LanguageModelV3` 这类框架类型穿透到 runtime；不要为了“统一”把所有 provider 的私有能力抹平，私有能力应该先放进 provider metadata 或 capability。

## L2：Streaming Event Adapter，让 runtime 消费事件而不是 SDK stream

L2 开始，LLM 层要从“返回最终文本”升级为“产生事件”。对 agent 来说，streaming 不是逐字显示，而是运行时状态机：文本增量、reasoning 增量、tool 输入开始、tool call 完成、usage、finish、error 都会改变 UI、会话模型和下一步控制流。

`blade-agent-sdk` 的 `stream` 方法是一个早期形态：它消费 AI SDK `result.fullStream`，把 `text-delta`、`reasoning-delta`、`tool-call`、`finish` 转成自己的 `StreamChunk`，见 `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/services/VercelAIChatService.ts:587` 和 `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/services/VercelAIChatService.ts:619`。这适合 L2 起步：保留 provider stream 的核心语义，但不把 SDK event 直接抛给上层。

`opencode` 更成熟。`LLM.run` 先解析 provider、config、auth、system，再调用 `streamText`，证据在 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/llm.ts:76` 和 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/llm.ts:337`。而 `SessionProcessor.process` 并不关心 provider SDK，它只消费 `llm.stream(streamInput)` 的事件，并用 `handleEvent` 把事件落到会话状态，见 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/processor.ts:727`。`reasoning-delta` 更新 reasoning part，`tool-input-start` 创建 pending tool part，`tool-call` 转 running，`tool-result` complete，`text-delta` 更新 text part，分别见 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/processor.ts:254`、`:286`、`:333`、`:394`、`:584`。

验收标准：定义自己的 `LLMEvent`；stream adapter 能输出 `text_delta`、`reasoning_delta`、`tool_call`、`usage`、`finish`、`error`；runtime 可以在不知道 provider 的情况下更新消息状态；stream 中断不会留下无法结束的 active text/reasoning/tool part。

不要提前做：不要把事件落库写进 LLM adapter。`opencode` 的分层值得学：`session/llm.ts` 负责出流，`session/processor.ts` 负责会话状态。也不要在 L2 就承诺所有 provider 都有一致的 reasoning、usage、tool input delta；事件类型要允许“缺失”和“降级”。

## L3：Tool-call、schema 与模型能力适配，开始承认模型并不一样

L3 的核心判断是：模型能力不是 provider 名，也不是模型名字符串，而是一组会影响请求构造和事件解释的能力。最少要表达这些能力：是否支持 tool calls、是否支持 parallel tool calls、是否支持 JSON schema output、是否支持 reasoning/thinking、是否支持 prompt cache、是否支持 image/file input、context/output token 上限、stream usage 是否可靠。

`opencode` 在 `session/llm.ts` 里处理 LiteLLM/Bedrock/GitHub Copilot 这类兼容性问题：当历史里有 tool call 但当前没有 active tools 时，会注入 `_noop` tool 满足代理校验，路径 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/llm.ts:195`。同一文件还通过 `experimental_repairToolCall` 修复大小写不一致的 tool name，无法修复时转成 `invalid` tool，见 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/llm.ts:343`。这些不是“业务逻辑”，而是 provider/model 兼容层的典型职责。

`message-v2.ts` 进一步说明能力适配会发生在历史回放阶段。它把内部 message parts 转成模型消息，并处理 provider 对 tool result media 的支持差异：OpenAI-compatible 只支持 string tool result，Bedrock 只支持部分 media，Gemini 版本也有差异，证据在 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/message-v2.ts:638` 和 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/message-v2.ts:803`。这类逻辑如果散落在 agent loop，后面每加一个模型都会引入回归。

`deer-flow` 给了 reasoning/thinking 的能力适配样本：`supports_thinking` 不满足时直接报错；关闭 thinking 时根据 OpenAI-compatible、vLLM、Anthropic native 等不同形态写入不同字段；`supports_reasoning_effort` 不支持时移除 `reasoning_effort`，路径 `/Users/lienli/Documents/GitHub/agent-ref/deer-flow/backend/packages/harness/deerflow/models/factory.py:88`、`:97`、`:113`。这说明 L3 不是“统一 schema”那么简单，而是要把同一抽象能力映射到不同 provider 的请求格式。

`deepagentsjs` 也值得作为边界样本。它的 Anthropic cache 主要由 `isAnthropicModel(model)` 决定，然后添加 `anthropicPromptCachingMiddleware` 与 cache breakpoint middleware，证据在 `/Users/lienli/Documents/GitHub/agent-ref/deepagentsjs/libs/deepagents/src/agent.ts:217`。`harnessProfile` 更多用于 tool description overrides、额外 middleware、排除 middleware/tool、profile-aware prompt，见 `/Users/lienli/Documents/GitHub/agent-ref/deepagentsjs/libs/deepagents/src/agent.ts:197`、`:205`、`:383`、`:405`。因此不要把“profile 决定 Anthropic cache”写成事实；更准确的说法是：profile 影响 agent harness 行为，cache 是否启用主要看模型是否 Anthropic。

`hermes-agent` 的 Gemini native adapter 是 L3 的强参考，因为它不是简单包一层 OpenAI-compatible API。它把 OpenAI 风格的 tool call、tool result、messages、tools、tool_choice 和 thinking config 转成 Gemini native schema：`_translate_tool_call_to_gemini()` 在 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/agent/gemini_native_adapter.py:228`，`_translate_tool_result_to_gemini()` 在 `:250`，`_build_gemini_contents()` 在 `:276`，`_translate_tools_to_gemini()` 在 `:330`，tool choice 与 thinking config 分别在 `:354` 和 `:372`。streaming 回译也单独处理，`translate_stream_event()` 在 `:618`，`_stream_completion()` 在 `:916`。这说明当 provider 原生协议差异足够大时，adapter 应该是双向翻译层，而不是把差异泄漏给 agent loop。

验收标准：模型配置能表达能力；tool schema 转换有单元测试；至少覆盖“tool name 大小写不一致”“无 active tools 但历史有 tool calls”“provider 不支持 media tool result”“reasoning 开关不支持”四类兼容场景；能力不支持时给出明确错误或降级，而不是让 provider 返回难读的 400。

不要提前做：不要把工具执行塞进 provider adapter；不要把权限拒绝归为 provider error；不要假设 `tool_result` 永远来自 LLM stream；不要把所有 provider 私有字段暴露给业务层。L3 的目标是隔离差异，不是让差异在全系统合法化。

## L4：错误归一化与 overflow/compaction retry，让 agent 能恢复

L4 解决的是“失败之后怎么办”。普通应用可以把 LLM API 错误返回给用户，agent 不行。agent 需要区分：限流是否可重试、网络错误是否可重试、context overflow 是否应该压缩后重试、tool schema parse 是否能 repair、用户 abort 是否要沉默结束、权限拒绝是否要进入 runtime 决策。

`opencode` 的 `SessionProcessor.halt` 先把未知错误 `parse(e)` 成统一错误；如果是 `MessageV2.ContextOverflowError`，设置 `ctx.needsCompaction = true` 并发布错误，然后让 `process` 返回 `"compact"`，证据在 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/processor.ts:698` 和 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/processor.ts:791`。同一个 `process` 管线还接入 `SessionRetry.policy`，在 retry 时设置 session status 为 `retry`，见 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/processor.ts:756`。这就是商业级 agent 必须拥有的控制信号：错误不只是异常，而是下一步动作的输入。

`blade-code` 展示了更直观的 compaction 恢复路径。循环开始前调用 `checkAndCompactInLoop`，先做 snip compaction，再在 80% 阈值触发 LLM compaction，路径 `/Users/lienli/Documents/GitHub/agent-ref/blade-code/packages/cli/src/agent/loop/executeLoopGenerator.ts:292` 和 `:318`。如果真正 LLM 调用抛出 prompt too long，它会进入 reactive compaction，成功后 `turnsCount--` 并 `continue` 重试当前轮，见 `/Users/lienli/Documents/GitHub/agent-ref/blade-code/packages/cli/src/agent/loop/executeLoopGenerator.ts:588`。这说明 overflow 不是普通失败，而是一个可以恢复的 loop 分支。

`hermes-agent` 把错误归一化单独做成 `agent/error_classifier.py`，文件头就说明分类结果会驱动 retry、credential rotation、fallback、context compression 或 abort。`ClassifiedError` 在 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/agent/error_classifier.py:67`，`classify_api_error()` 在 `:345`。它区分 rate limit、auth、context overflow、image too large、model not found、format error、long context tier、OAuth long context beta、llama.cpp grammar pattern 等细分原因，并给出 `should_rotate_credential`、`should_fallback`、`retryable` 等恢复提示。这个设计给 L4 一个标准：错误分类不是为了日志好看，而是为了让主循环做不同恢复动作。

验收标准：定义 `LLMError` 或 `ProviderError` 层，至少区分 `ContextOverflowError`、`RateLimitError`、`AuthenticationError`、`AbortError`、`ToolCallParseError`、`UnknownProviderError`；retry policy 根据错误类型决策；overflow 可以触发 compaction 并重试同一轮；compaction 失败有降级策略；所有 retry/compaction 都会产生日志或 runtime event，避免用户以为 agent 卡住。

不要提前做：不要把所有错误都包成 `Error(message)`；不要对权限拒绝做 provider retry；不要在 adapter 内直接修改 conversation history。compaction 需要 context manager 或 session processor 参与，因为它改变的是历史，不是单次 provider 请求。

## L5：商业级 Provider 平台，把“能接模型”升级为“能运营模型”

L5 才是 `opencode` 的 provider 系统真正值得复刻的阶段。它不是为了多写几个 `switch(provider)`，而是为了支撑真实产品里的模型运营：配置 provider、加载认证、发现模型、合并用户配置和默认数据库、动态加载 provider SDK、缓存 language model、处理 baseURL/env/header/timeout/chunk timeout、选择 default/small model。

`opencode` 的 `Provider.Service` 接口已经暴露平台化能力：`getProvider`、`getModel`、`getLanguage`、`closest`、`getSmallModel`、`defaultModel`，证据在 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/provider/provider.ts:950`。初始化阶段从 `models.dev` 建 database，合并 config、plugin、auth、custom provider，见 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/provider/provider.ts:1088`。`resolveSDK` 则处理 SDK 缓存、OpenAI-compatible usage、baseURL 变量替换、apiKey/header、timeout/chunkTimeout、bundled provider 和动态 npm/provider import，见 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/provider/provider.ts:1419`。最后 `getLanguage` 把 provider SDK 转成 `LanguageModelV3` 并缓存，路径 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/provider/provider.ts:1584`。

`hermes-agent` 给 L5 另一个 provider 平台形态：`ProviderProfile` 是声明式 provider 描述，而不是 client 构造器。它在 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/providers/base.py:25` 定义，hook 包括 `prepare_messages()`、`build_extra_body()`、`build_api_kwargs_extras()`、`fetch_models()`，分别在 `:80`、`:88`、`:97`、`:117`。provider registry 在 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/providers/__init__.py:1` 到 `:27` 写明 bundled plugins 与 user plugins 两类来源，用户插件可以覆盖 bundled profile；`register_provider()` 在 `:53`，lazy discovery 在 `:65` 到 `:82`，发现流程在 `:140` 到 `:166`。这条路线适合商业产品：profile 负责声明认证、endpoint、默认模型、hook 和模型发现，client 创建、流式处理、credential rotation 仍留在 agent/provider runtime。

`deepagentsjs` 的 streaming transformer 给 L5 另一个方向：产品级 stream 不一定只是一条 LLM token 流，还可能是多 agent / subagent 的 typed projection。`createSubagentTransformer` 把 `task` tool call 和子 namespace 事件关联成 `run.subagents`，见 `/Users/lienli/Documents/GitHub/agent-ref/deepagentsjs/libs/deepagents/src/stream.ts:157` 和 `/Users/lienli/Documents/GitHub/agent-ref/deepagentsjs/libs/deepagents/src/stream.ts:238`。如果你的商业产品有 subagent、background task、remote tool execution，这种 typed stream projection 会比“所有事件塞进一个 JSON channel”更容易被 SDK 用户消费。

验收标准：provider/model 配置可枚举、可禁用、可覆盖；认证来源可组合；模型能力与价格/usage/cost 可被观测；provider SDK 可缓存并隔离初始化错误；默认模型、小模型、fallback 模型有明确策略；stream event schema 有版本；provider 增加或下线不会要求修改 agent loop。

不要提前做：不要在还没有两个以上真实 provider 压力时复刻完整 provider marketplace；不要让插件系统先于稳定接口出现；不要把成本、鉴权、模型发现和 runtime 状态混在一个 service。L5 的复杂度只有在产品需要“运营模型”时才划算。

## 推荐迁移节奏：每一级只为下一级留下接口，不提前搬复杂度

如果从零实现，我会按下面节奏推进：

第一周只做 L0-L1：一个 provider、一个 `LLMClient`、一个 message/tool/schema 转换层。把所有 SDK 类型锁在 adapter 内，agent loop 只认识自己的类型。

第二阶段做 L2：引入 `AsyncIterable<LLMEvent>`，让 UI/session/runtime 都从统一事件更新。这个阶段先不追求工具边流边执行，只保证 text、reasoning、tool_call、finish、usage 的事件边界正确。

第三阶段做 L3：当第二个 provider 或第一个 OpenAI-compatible 代理接入时，再引入 capability。重点不是 provider 数量，而是“同一能力在不同 provider 下如何请求、如何回放、如何降级”。

第四阶段做 L4：只要 agent 开始处理长任务，就必须做 overflow 与 compaction retry。这里要和 context management 文章/模块协同，LLM adapter 只负责把错误归一化，真正改写历史的是 context/session 层。

最后才做 L5：当产品需要让用户自带 key、切 provider、看成本、支持企业网关、支持模型发现时，再复刻 provider 平台。否则 L5 会变成一套很漂亮但没人真正使用的配置系统。

如果要参考 `hermes-agent`，建议只在 L5 引入它的 `ProviderProfile` 模式：先让两个真实 provider 跑过 L1-L4，再把 provider 能力从代码分支迁移成 profile/plugin。不要第一天就做 `$HERMES_HOME/plugins/model-providers` 这种可覆盖插件目录；那是模型运营阶段的能力，不是最小 agent 的能力。

## 最后的架构判断

LLM 接入的成熟度，不取决于支持了多少 provider，而取决于 provider 差异有没有被关在正确的边界里。L0 追求能跑，L1 追求不泄漏，L2 追求事件化，L3 追求能力适配，L4 追求可恢复，L5 追求可运营。

最容易犯的错有两个：一是长期停在 L0，让 agent loop 被 SDK 类型、provider 错误、tool call 格式拖碎；二是一开始就模仿 `opencode` 的 L5 provider 平台，让还没验证的产品背上商业级复杂度。更稳的路线是阶段演进：每一级解决眼前真实痛点，同时为下一级留下干净边界。

如果只记住一句话：LLM adapter 不是 HTTP wrapper，它是 agent runtime 和模型世界之间的防火墙；但这堵防火墙必须一层层建，不能第一天就修成平台。
