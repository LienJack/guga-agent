# Agent Context 管理：从最小可运行演进到商业级复刻

如果只想做一个能回答两三轮问题的 agent，`messages.push(...)` 就够了；如果要做一个能跑长任务、能恢复、能解释自己为什么还记得某件事的商业级 agent，context 管理就不能再是 prompt 的附属品。它必须成为 agent runtime 的一条主线：谁进入模型、谁留在账本、谁被摘要、谁被裁剪、谁只作为文件引用存在，都要有明确规则。

这篇文章不把目标写成“一步到位的长期记忆系统”。更可复用的路线是从最小可运行开始，每一层只解决当前最痛的问题，同时为下一层留下正确接口：L0 先让消息连续，L1 分出 system/history/pending，L2 治理 token 和工具输出，L3 做主动压缩与 reactive compact，L4 建事件账本和会话恢复，最后才进入 L5 商业级 context 平台。

参考项目给出的共同结论是：context 的复杂度不是来自“摘要算法”，而是来自边界。`blade-code` 用 `ConversationState` 把 root system prompt 从可压缩 history 里分离出来，证据在 `/Users/lienli/Documents/GitHub/agent-ref/blade-code/packages/cli/src/agent/loop/ConversationState.ts:8` 和 `:110`；`opencode` 把 compaction 做成 session 协议中的 message/part，而不是一次临时字符串拼接，证据在 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/compaction.ts:211` 与 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/message-v2.ts:732`；`deepagentsjs` 说明工具输出不能只靠“聊天摘要”解决，大结果应被写入后端文件，再给模型一个可读预览和路径引用，证据在 `/Users/lienli/Documents/GitHub/agent-ref/deepagentsjs/libs/deepagents/src/middleware/fs.ts:1326` 到 `:1395`。新增的 `hermes-agent` 则把这条线推到产品态：`ContextCompressor` 在 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/agent/context_compressor.py:346`，loop 内压缩入口在 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/run_agent.py:10194`，session DB/log 持久化在 `run_agent.py:4586` 和 `:5130`。

## Guga 的取舍校准：账本要早，长期记忆要晚

Context 路线最容易误读成“L4 才需要持久化”。对 Guga 来说，更稳的判断是：完整 session resume 可以在 L4 做，但 append-only JSONL 或等价 event log 应该从 P0 就开始写。否则后续 compaction、tool result eviction、usage、debug replay 都没有事实源。

- **P0 先做结构，不先做摘要**：`system/history/pending`、tool_call/tool_result 配对、append-only event log 比 LLM summary 更关键。
- **P1 优先治理工具输出**：长任务爆窗通常先来自测试日志、搜索结果、文件读取，而不是闲聊历史。大结果 preview + path 引用应早于长期记忆。
- **P1 再做主动/被动 compact**：压缩要作为 loop decision 和 UI event 出现，不能是静默字符串替换。
- **P2 才做 memory/retrieval 平台**：session memory、user memory、FTS/向量检索都必须建立在可恢复账本和明确优先级之上。

证据强度：`ConversationState` 分层、tool result 预算、append-only transcript 是多项目 `Fact`；Guga 把 JSONL 提到 P0 是 `Inference`；压缩阈值、summary 模板和保留窗口是 `Pending Verification`。

## 路线图总览

| 阶段 | 核心问题 | 参照项目 |
| --- | --- | --- |
| L0 内存消息数组 | 让最小 agent 能连续对话 | 所有 agent 原型都会有这一层 |
| L1 system/history/pending 分层 | 防止 system prompt、历史和当前轮消息互相污染 | `blade-code` `ConversationState`、`ContextAssembler` |
| L2 token 预算与工具输出治理 | 避免日志、搜索结果、文件读取撑爆上下文 | `blade-code` `SnipCompaction`、`OutputTruncator`；`deepagentsjs` `fs.ts`；`opencode` prune |
| L3 主动压缩与 reactive compact | 长任务超窗时可继续，而不是直接失败 | `opencode` `overflow.ts`/`prompt.ts`/`compaction.ts`；`blade-code` loop；`blade-agent-sdk` hooks |
| L4 事件账本与会话恢复 | 重启后能重建上下文，并知道何时压缩过 | `blade-code` `ContextAssembler`；`opencode` `message-v2`；`cc-haha` `compact_boundary`；`hermes-agent` SessionDB/session log |
| L5 商业级 context 平台 | 支持多模型、多端、审计、策略、检索和评测 | 从上述项目组合抽象，`hermes-agent` 可作为 memory/session_search/context compressor 的产品态参考 |

有两个边界要先钉住。第一，`opencode` 不是每轮开始前凭空估算“快满了就压缩”，而是在上一轮 assistant 完成后用 token usage 判断 overflow，再在继续下一次模型调用前创建 compaction message；`isOverflow` 在 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/overflow.ts:19`，调用点在 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/prompt.ts:1704` 到 `:1710`。第二，`blade-agent-sdk` 的 compact 多通过 loop hooks 接入：reactive compact 在 `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/agent/AgentLoop.ts:253` 到 `:299`，turn-limit compact 在同文件 `:560` 到 `:582`，不应写成全部由 `ContextManager` 独自完成。

## L0：内存消息数组，先跑起来

L0 的目标只有一个：让 agent 能在单进程里连续对话。你需要一个 `messages: Message[]`，每轮把 system message、历史 user/assistant/tool message 传给模型，模型返回后再把 assistant 文本或 tool call 追加进去。工具执行完成后，把 tool result 作为下一轮模型可见的消息追加回去。

这一层不需要学 `opencode` 的 message part 协议，也不需要立刻上 JSONL。它更像一块基线测试板：消息顺序是否正确，assistant tool call 是否有对应 tool result，用户第二轮问题是否能看到第一轮结果。只要这块跑不通，后面的压缩、恢复、记忆都会把 bug 包起来，变得更难查。

验收标准很朴素：多轮对话能保留最近上下文；一次 tool call 的输入、输出能被下一轮模型看到；你能手动打印最终 messages 并确认顺序是 `system -> user -> assistant(tool_calls) -> tool -> assistant`。为了避免把 L0 做坏，最多只做一个最近 N 条消息的保护阈值，不要把 system prompt 和 history 放在同一个可随意裁剪的数组里。

不要提前做长期记忆、向量库、复杂摘要。L0 的价值是最小可运行，不是最小商业化。这个阶段最容易犯的错，是看见 context 会增长，就立刻写一个“超过 20 条就从头删”的工具；这会在第一次长任务里删掉 system 规则、未完成 tool result 或用户关键约束。

## L1：分出 system、history、pending，context 才有骨架

L1 是 context 管理真正开始的地方。你要把一条扁平 messages 数组拆成三个责任不同的区域：

- `systemMessages`：根系统提示、开发者规则、工具协议，原则上不参与压缩。
- `history`：已经完成并可被压缩、裁剪、摘要的对话历史。
- `pending`：当前轮正在生成或等待工具回流的消息，不能被压缩过程打乱。

`blade-code` 的 `ConversationState` 是最直接的参照。文件开头写明三段式设计，`systemMessages` 排除在压缩之外，`history` 对应原 context messages，`pending` 保存当前轮追加的 assistant 和 tool results，证据在 `/Users/lienli/Documents/GitHub/agent-ref/blade-code/packages/cli/src/agent/loop/ConversationState.ts:8` 到 `:12`。`toLLMMessages()` 只在模型调用前投影为 `systemMessages + history + pending`，证据在同文件 `:105` 到 `:112`。压缩只替换 history，`replaceHistory` 还会过滤 root system prompt，证据在同文件 `:180` 到 `:190`。

这背后的设计意图很清楚：模型输入是投影，不是唯一事实源。system prompt 不能被压缩污染；当前轮 pending 不能因为压缩 history 而丢失；history 可以被替换，但替换动作要有单一入口。`blade-code` 还用 `ContextAssembler` 从 JSONL 事件流重建 session、conversation 和 tool calls，说明 L1 的分层会自然连接到 L4 的会话恢复，证据在 `/Users/lienli/Documents/GitHub/agent-ref/blade-code/packages/cli/src/context/ContextAssembler.ts:27` 到 `:39`。

这一阶段要做的事情是定义 `ConversationState` 或等价对象，提供 `appendUser`、`appendAssistant`、`appendToolResult`、`commitPending`、`replaceHistory`、`toLLMMessages`。如果已有持久化 context，也要把 root system prompt 从历史里提取出来，避免后续压缩误伤。

验收标准应覆盖四类顺序：普通 user/assistant 对话；assistant tool_calls 加 tool result；当前轮 pending 在 commit 前不会进入 history；压缩 history 后 system prompt 仍在模型输入最前面。不要提前做向量数据库，也不要维护一个不断拼接的大字符串 prompt。L1 要保的是结构，而不是“更会总结”。

## L2：治理 token 和工具输出，先处理真正的爆点

多数 agent 第一次超上下文，不是因为用户聊天太多，而是因为工具输出太大：`rg` 扫出几千行、测试日志刷屏、构建输出滚动、文件读取一次塞进几万字符。L2 的重点不是“压缩聊天”，而是给工具结果建立预算、裁剪、摘要、落盘和重读机制。

`blade-code` 有两个层次值得借。第一是 `SnipCompaction`，它不调用 LLM，而是识别旧的 assistant(tool_calls) 与后续 tool result 组成的工具轮次，保留最近 N 轮，把更早的工具交互替换成 snip 标记，证据在 `/Users/lienli/Documents/GitHub/agent-ref/blade-code/packages/cli/src/context/SnipCompaction.ts:19` 到 `:27` 和 `:111` 到 `:133`。第二是 shell 输出截断：`OutputTruncator` 按命令类型配置 aggressive/moderate/conservative 策略，测试、lint、diff 保留更多，安装、docker、find 等输出更激进，证据在 `/Users/lienli/Documents/GitHub/agent-ref/blade-code/packages/cli/src/tools/builtin/shell/OutputTruncator.ts:24` 到 `:54`、`:56` 到 `:123`，实际截断入口在 `:137` 到 `:190`。

`deepagentsjs` 给出另一种商业化方向：大结果不只是截断，而是驱逐到后端文件系统。`FilesystemMiddleware` 的 `wrapToolCall` 在工具返回后检查 `toolTokenLimitBeforeEvict`，如果 tool message 字符数超过阈值，就写入 `/large_tool_results/{sanitizedId}`，再把给模型的消息替换成带 file path 和 head/tail preview 的文本，证据在 `/Users/lienli/Documents/GitHub/agent-ref/deepagentsjs/libs/deepagents/src/middleware/fs.ts:1326` 到 `:1395`。注意主体在 `fs.ts:1320` 附近，`fs.ts:1214` 只是 middleware 创建入口。

`opencode` 也有工具输出治理。它在 compaction 模块里为旧 tool part 做 prune：从后往前保护最近一段 token，超过保护区的已完成工具输出会标记 compacted，证据在 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/compaction.ts:319` 到 `:365`。模型投影时，已 compacted 的旧工具结果变成 `[Old tool result content cleared]`，未 compacted 的结果也会经过 `toolOutputMaxChars` 截断，证据在 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/message-v2.ts:795` 到 `:801`。

这一阶段要做：给每种工具定义 result budget；命令输出按命令类型保留 head/tail；搜索和文件读取返回可定位片段；大工具结果写入 `ToolResultStore` 或文件后，只给 LLM 摘要、预览和重读路径；UI 展示文本、LLM 输入文本、审计原始结果分开保存。

验收标准是：一条 5MB 日志不会直接进入模型；截断消息明确告诉模型省略了多少内容；工具结果能通过 path、artifact id 或后续 read 工具重新读取；测试失败的关键错误行不会被 aggressive 截断吃掉。不要只做“对话摘要”而忽视工具输出，也不要把 diff、测试日志、全文搜索结果无脑塞进 history。

## L3：主动压缩与 reactive compact，让长任务不断线

L3 才进入通常意义上的 context compaction。这里要同时支持两种路径：主动压缩和 reactive compact。主动压缩是在还没失败前，根据模型 context、保留输出预算、当前 token usage 或估算值决定是否 compact；reactive compact 是 provider 已经返回 prompt too long 或 context overflow 后，把失败当作可恢复分支，压缩后重试当前轮。

`opencode` 的主动路径很值得细看，因为它不是“每轮前粗估一下”。`overflow.ts` 先计算 usable input：如果模型有 input limit，就从 input limit 里扣 reserved；否则从 context limit 里扣 max output tokens，证据在 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/overflow.ts:8` 到 `:17`。`isOverflow` 用上一轮 assistant tokens 的 total/input/output/cache 计算是否触线，证据在同文件 `:19` 到 `:25`。调用点在 prompt loop：当 `lastFinished.summary !== true` 且 `compaction.isOverflow(...)` 为真，就创建 auto compaction task 并 continue，证据在 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/prompt.ts:1704` 到 `:1710`。

`opencode` 的 compaction 机制还展示了“摘要不是全部”。它会寻找历史里已完成的 compaction，拿上一份 summary 作为 anchor；再按 tail budget 选择 head/tail，保留最近若干 turn 或 turn 的后半截；最后把 head 转成模型消息，把 tail 序列化进 compaction prompt，证据在 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/compaction.ts:122` 到 `:161`、`:268` 到 `:317`、`:411` 到 `:435`。如果 overflow 是由上一请求触发，它还会 replay 最近那个用户消息，保证 compact 后继续处理的是同一用户意图，证据在同文件 `:388` 到 `:404` 和 `:496` 到 `:523`。

`blade-code` 代表 reactive compact 的朴素落点：LLM 调用 catch 到 `prompt_too_long` 后，调用 `reactiveCompaction.tryReactiveCompact(...)`，成功后替换 `context.messages` 与 `ConversationState.history`，然后 `continue` 重试当前 turn，证据在 `/Users/lienli/Documents/GitHub/agent-ref/blade-code/packages/cli/src/agent/loop/executeLoopGenerator.ts:588` 到 `:610`。`blade-code` 的 `CompactionService` 还定义了 `CompactionResult`：summary、pre/post token、filesIncluded、compactedMessages、boundaryMessage、summaryMessage，证据在 `/Users/lienli/Documents/GitHub/agent-ref/blade-code/packages/cli/src/context/CompactionService.ts:44` 到 `:66`。压缩成功后保留最近一段消息并过滤孤儿 tool message，证据在同文件 `:172` 到 `:210`；边界消息和 summary message 分开创建，证据在同文件 `:386` 到 `:433`。

`blade-agent-sdk` 则更适合作为 SDK 形态参照。它把 reactive compact 接成 `recoveryHooks.reactiveCompact`，loop 只负责识别 overflow、发出 recovery 事件、调用 hook、成功后重试当前 turn，证据在 `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/agent/AgentLoop.ts:253` 到 `:299`。轮次上限后的 compact 也通过 `onTurnLimitCompact` 注入，loop 收到 `compactedMessages` 后才替换会话内容，证据在同文件 `:560` 到 `:582`。这说明 SDK 不一定要把所有压缩策略写死在 `ContextManager`，更好的边界是 loop 暴露恢复点，产品层注入具体 compaction。

`hermes-agent` 的 `ContextCompressor` 更接近商业级压缩器。它的 `SUMMARY_PREFIX` 在 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/agent/context_compressor.py:37` 明确告诉后续模型：摘要只作为 reference，不是新的 active instruction；这能避免压缩摘要把系统规则、用户新指令或安全边界“伪装成更高优先级”。它还在 `context_compressor.py:224` 用 `_summarize_tool_result()` 为 terminal、read_file、patch、web_search、delegate_task 等工具生成不同摘要，在 `:519` 的 `_prune_old_tool_results()` 先做无需 LLM 的旧工具结果清理和去重，在 `:1118` 的 `_sanitize_tool_pairs()` 修复压缩后孤儿 tool_call/tool_result 配对。这个实现给 L3 一个更高标准：压缩不是“把历史总结成一段话”，而是保护指令优先级、工具配对完整性、head/tail 边界和多模态 token 预算。

这一阶段要做：设计 `ContextBudgeter`，计算可用 input、输出保留和压缩阈值；设计 `CompactionService`，输出 summary、保留 tail、移除记录、pre/post token、触发原因；把 compact 作为可见事件发给 UI；provider overflow 时 compact/retry 当前轮；压缩后插入明确的 compaction message 或 part。

验收标准是：超长上下文不会直接失败；压缩前后 token 数可记录；summary 至少保留用户目标、约束、已完成步骤、当前阻塞点、关键文件路径、下一步；最近用户消息、当前 pending tool result、未闭合 tool call 不会被压缩掉；UI 能显示“正在压缩/压缩完成”。不要把全部历史压成一段 summary 后丢弃结构化事件，也不要静默压缩。

## L4：事件账本与会话恢复，把 memory 变成可重建系统

商业 agent 不能只靠内存里的 messages。进程会重启，用户会隔天回来，模型输入需要审计，compaction 需要解释。L4 的核心是 event log：用户消息、assistant text、reasoning、tool call、tool result、usage、error、compaction boundary、summary 都以事件或 part 形式落盘，然后从账本重建当前可投影上下文。

`blade-code` 的 `ContextAssembler` 是简洁版参照。它从 `SessionEvent[]` 重建 `SessionContext`、`ConversationContext` 和 `ToolCall[]`，证据在 `/Users/lienli/Documents/GitHub/agent-ref/blade-code/packages/cli/src/context/ContextAssembler.ts:27` 到 `:39`。它在 `part_created` 里处理 text、image、summary，在 tool_call/tool_result part 里重建工具状态，证据在同文件 `:112` 到 `:153` 与 `:170` 到 `:222`。这说明会话恢复不是“读回一串 messages”那么简单，工具状态、summary 和 session 配置都应参与重建。

`hermes-agent` 也给了恢复侧证据：`run_agent.py:4586` 的 `_flush_messages_to_session_db()` 将消息写入共享 SessionDB，`run_agent.py:5130` 的 `_save_session_log()` 保留本地 session log；ACP session 管理器文件头进一步说明会话会持久化到共享 `SessionDB`，让编辑器重连后可以恢复完整 conversation history，见 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/acp_adapter/session.py:1` 到 `:8`。这说明 L4 的账本不只是为了 debug，也是多客户端重连和跨会话检索的基础。

`opencode` 的 `message-v2` 更接近商业协议层。`toModelMessagesEffect` 把持久化的 user/assistant parts 投影成 provider 可接受的 UIMessage：user 的 compaction part 会变成“到目前为止做了什么”的文本，assistant summary 只保留 text part，不同模型回放时会去掉 provider metadata，工具输出会根据 compacted 状态和 provider 能力转换，证据在 `/Users/lienli/Documents/GitHub/agent-ref/opencode/packages/opencode/src/session/message-v2.ts:637` 到 `:745` 和 `:748` 到 `:884`。这给 L4 一个重要启发：账本格式和模型输入格式不必相同，中间需要 projection。

`cc-haha` 说明 compact boundary 也应该进入客户端协议，而不是只存在后端日志里。它把 SDK status `compacting` 转成 informational system message，证据在 `/Users/lienli/Documents/GitHub/agent-ref/cc-haha/src/remote/sdkMessageAdapter.ts:88` 到 `:103`；把 `SDKCompactBoundaryMessage` 转成本地 `subtype: 'compact_boundary'` 的 system message，并携带 compact metadata，证据在同文件 `:125` 到 `:139`。这就是 UI 能解释“这里发生过压缩”的基础。

这一阶段要做：定义 append-only event log；每轮模型调用保存可重建输入或输入引用；compaction 前后的 summary、boundary、pre/post token、filesIncluded、trigger 都落账；提供 `ContextAssembler` 从账本重建 `ConversationState`；保留 compact 前原始事件，但默认不再投影进模型；为 UI 暴露 compact boundary、tool progress、error 和 usage。

验收标准是：进程重启后能恢复目标、最近上下文、工具调用结果和压缩摘要；UI 能显示压缩边界；线上问题可以回放某一轮模型到底看到了什么；summary 与被压缩的原始事件之间有 parent/cutoff/boundary 关系。不要把 summary 当唯一事实来源，也不要只存最终 assistant 文本而丢掉工具、错误和 usage。

## L5：商业级 context 平台，最后再做长期记忆

到了 L5，context 不再只是一个 agent loop 内部模块，而是平台能力。它要面对多客户端、多模型、多租户、长期任务、组织策略、安全审计和效果评测。这里可以开始谈 session memory、project memory、user memory、organization policy、检索式上下文、facts store、context eval，但这些能力必须建立在 L1 到 L4 的边界之上。

`blade-agent-sdk` 的 `ContextManager` 展示了平台雏形：它把 context 分成 system、session、conversation、tool、workspace layers，证据在 `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk/src/context/ContextManager.ts:152` 到 `:180`；支持 memory、persistent、sessionStore、cache、compressor、filter，证据在同文件 `:46` 到 `:108`；保存 message、tool use、tool result 和 compaction 走统一持久化入口，证据在同文件 `:220` 到 `:398`；`getFormattedContext` 先 filter，再按阈值压缩并缓存压缩结果，证据在同文件 `:423` 到 `:460`。它不一定是最终答案，但很好地说明 L5 的方向：context 平台负责存储、过滤、压缩、缓存、查询；agent loop 通过接口消费它。

`hermes-agent` 对 L5 的价值在“context 平台会自然长出长期记忆与跨会话检索”。它在 prompt 层有 `MEMORY_GUIDANCE` 和 `SESSION_SEARCH_GUIDANCE`，分别位于 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/agent/prompt_builder.py:150` 和 `:173`；工具集也把 `memory` 与 `session_search` 作为显式 toolset，证据在 `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent/toolsets.py:193` 和 `:198`。这里要学的不是马上加向量库，而是让长期记忆、历史会话搜索、压缩摘要和当前轮 history 分属不同事实源，再由 context projection 决定哪一部分进入模型。

这一阶段要做的不是“再加一个 memory 表”，而是把 context 拆成几类事实源：会话流水、项目事实、用户偏好、组织策略、工具 artifact、权限记录、测试结果、关键文件引用。模型输入只是这些事实源在某个模型、某个 agent、某个权限模式下的一次 projection。安全策略和组织规则必须是不可被 summary 覆盖的高优先级层；历史任务和知识库召回必须有来源路径；压缩策略要能按模型 context、成本和质量评测调整。

验收标准是：长任务跨天恢复仍知道目标、进度、未完成事项和关键文件；切换模型后 context projection 仍合法；每次模型调用都能审计输入来源；压缩策略有 regression eval，能测试摘要后 agent 是否仍能继续任务；敏感信息、密钥、隐私数据有过滤和审计；多客户端看到一致的 compact boundary 和会话状态。

不要提前把 L5 的能力塞进 L0。没有 L1 分层，长期记忆会污染 system prompt；没有 L2 工具输出治理，向量检索也救不了爆窗；没有 L3/L4，压缩只会制造不可追溯的遗忘。商业级 context 平台的关键不是“记得更多”，而是“知道什么该进入这一轮模型输入，以及为什么”。

## 推荐复刻顺序

如果你要从零复刻一个商业级 agent context 系统，推荐按这个对象序列推进：

1. `ConversationState`：先实现 `systemMessages/history/pending` 与 `toLLMMessages()`。
2. `ContextBudgeter`：计算模型可用 input、输出保留、阈值和触发原因。
3. `ToolResultStore`：治理大工具输出，支持 preview、artifact path、重新读取。
4. `OutputTruncator` / `SnipCompaction`：先做本地轻量裁剪，少调用 LLM。
5. `CompactionService`：生成 summary、tail、boundary、pre/post token、fallback。
6. `ContextAssembler`：从事件账本恢复 session、conversation、tool calls、summary。
7. `ContextAuditLog`：保存每轮 projection 的来源、版本、模型和策略。
8. `ContextPlatform`：再扩展 memory、retrieval、policy、eval、multi-client sync。

如果按 Guga 当前阶段排序，可以落成：

| 优先级 | 先做什么 | 暂时不做什么 |
| --- | --- | --- |
| P0 | `ConversationState`、tool 配对保护、append-only JSONL、基础 token/usage 记录、最近窗口保护 | LLM 摘要、向量库、跨会话 memory |
| P1 | `ToolResultStore`、head/tail 截断、reactive compact、compact boundary event、session resume skeleton | 摘要质量审计、FTS5 历史搜索、复杂 ContextEngine |
| P2 | 主动 compact、防抖/熔断、post-compact 文件/计划复灌、context audit/replay、memory/retrieval | 多租户策略平台、长期事实库自动提炼 |

最终要守住一个原则：summary 是续航手段，不是事实源；messages 是模型输入投影，不是完整账本；工具输出是 context 最大风险源，不是普通聊天文本；compact 是用户和系统都应看得见的事件，不是悄悄发生的字符串替换。按这个顺序演进，最小 agent 能跑，长任务能续，商业系统也能解释自己为什么没有忘。
