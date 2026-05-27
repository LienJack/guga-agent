# Agent 长期记忆与持久化调研

## 一句话结论

Guga 不应该把“长期记忆”做成一个单一 Memory 模块。参考 `pi`、`graphiti`、`mem0`、`zep` 以及 9 个 agent 参考项目后，更稳的架构是把记忆拆成三层：会话持久化负责可恢复的事实原始记录，显式长期记忆负责少量可治理的用户/项目事实，检索与上下文注入负责在每一轮模型调用前把相关内容带回工作上下文。

换句话说，先让系统“记得自己发生过什么”，再让系统“学会哪些事实值得长期保存”，最后再做“如何把记忆以最小噪声注入 prompt”。这三件事如果混在一个 facade 里，短期看 API 简洁，长期会把权限、溯源、压缩、搜索、删除、评估和调试全部缠在一起。

## 研究范围与证据

本轮使用 `arch-insight` 的 `Article - Deep Dive` 路径，输出目标是为 Guga 后续 memory 架构设计提供可复用判断，而不是复述各项目 README。研究对象分两组：

第一组是 9 个 agent 参考项目：`blade-agent-sdk`、`blade-code`、`cc-haha`、`claude-code`、`deepagentsjs`、`deer-flow`、`hermes-agent`、`opencode`、`pi`。范围与版本锚点见 `docs/research/intake/source-contract.md`。其中 `pi` 是本轮重点，因为它没有把 memory 做成语义图谱，而是把 agent 会话本身做成可恢复、可分支、可压缩的 durable tree。

第二组是 3 个专门的 memory 参考项目：`graphiti`、`mem0`、`zep`。版本锚点来自 `docs/research/context-packs/memory-systems.md`：`graphiti` 为 `34f56e65e0fe2096132c8d16f3a1a4ac9300a5f6`，`mem0` 为 `88934304c6e4e1e8472ac791a1095aea185e8002`，`zep` 为 `faf2acec4f2ec777a27d8fe0411619bc913a9660`。

证据使用 7 层漏斗：优先 Context Packs，其次 Graphify graph/report，再看 source-analysis，必要时只打开 repomix 或原仓库中的关键文件。本文的关键判断均标注为 `Fact`、`Inference` 或 `Pending Verification`。

## 先分清三种“记忆”

很多 agent memory 讨论会混用三个概念，导致架构一开始就偏。

第一种是会话持久化：用户说了什么，模型回了什么，工具调用了什么，压缩发生在哪一轮，当前 branch/leaf 在哪里。它的目标不是“智能”，而是可恢复、可审计、可重放。`pi`、Claude Code、OpenCode、Hermes 在这一层都很重视 append-only 或 server-source-of-truth 的状态模型。

第二种是显式长期记忆：用户偏好、项目约定、反复出现的约束、稳定事实、被确认的决策。它的目标不是保存一切，而是保存少量高价值、可删除、可追踪来源、可解释为什么被写入的事实。DeerFlow、Hermes、Claude Code 的 memory files，以及 `mem0` 的 extracted memory 都属于这一类。

第三种是检索与上下文注入：当模型准备生成下一轮响应时，系统从历史、图谱、向量库或 session search 中找回相关内容，并按预算注入。`zep` 的设计价值正在这里：它不是把 memory 做成普通可调用工具，而是在 LLM request lifecycle 中自动持久化用户消息并注入 context。

这三层应该共享事件 ID、source、scope 和 trace，但不应该共享同一个写入策略。会话日志默认写入，长期记忆需要策略门控，检索注入需要预算与相关性门控。

## 全项目对比

| 项目 | 长久化重心 | 适合 Guga 借鉴的部分 | 主要边界 |
| --- | --- | --- | --- |
| `pi` | JSONL session tree、branch、compaction entry | 先建立 durable session substrate，再谈语义记忆 | 不解决跨会话语义事实抽取 |
| `graphiti` | Episode / Entity / Edge 的 temporal graph | 事件保真与事实图谱投影分离 | 图数据库和抽取 pipeline 对 MVP 偏重 |
| `mem0` | Memory facade + vector store + history DB + entity store | 快速应用侧 memory API、scope filter、向量检索 | facade 容易隐藏 policy、trace 和可观测性 |
| `zep` | User graph / thread context / lifecycle injection | turn-time context injection hook、user/thread 分离 | 托管产品形态不应整体内嵌 |
| Claude Code | memory files + append-only JSONL transcript/resume | 文件化记忆层、session resume、压缩边界 | 产品态复杂度高 |
| Hermes | `MEMORY.md` / `USER.md`、MemoryManager、SessionDB/FTS5 | 内置记忆文件、provider 生命周期、历史搜索 | 自改进/RL 能力不适合早期照搬 |
| DeerFlow | `memory.json`、异步队列、confidence threshold | 结构化小记忆、异步写入、过滤工具噪声 | LangGraph/middleware 绑定较强 |
| OpenCode | server-side session/state sync | server source of truth、SSE/JSON Patch 投影 | 语义长期记忆较弱 |
| Blade / DeepAgentsJS | 文件/工具式 memory | 最小可解释实现 | 更像基础能力，不足以覆盖复杂长期记忆 |
| `cc-haha` | shell/remote/session bridge | 会话外壳与远端协同参考 | 不是完整 memory 架构参考 |

`Inference`: 全部项目合起来给出的共同方向很明确：成熟 agent 不会只依赖向量库作为“记忆”。可靠的 memory 体系一定有原始事件底座、显式抽取事实、检索注入策略，以及恢复/压缩后的历史可找回能力。

## pi：把会话做成可恢复的 durable tree

`pi` 的价值不在语义 memory，而在会话持久化模型。它证明了一个 coding agent 的“长期记忆”至少要先从 durable session 做起。

`pi` 的 JSONL session 文件第一行是 session header，包含 `type: "session"`、`version: 3`、`id`、`timestamp`、`cwd` 和可选 `parentSession`。这是一个很小但关键的契约：会话文件不是普通日志，而是带版本、工作目录和父会话关系的状态容器。证据见 `/Users/lienli/Documents/GitHub/agent-ref/pi/packages/agent/src/harness/session/jsonl-storage.ts:8`。

后续每条记录都是 `SessionTreeEntry`，通过 `id` 和 `parentId` 形成树。`JsonlSessionStorage.appendEntry()` 只做追加写入，并把 `currentLeafId` 更新为当前 entry；`setLeafId()` 也不是内存变量赋值，而是追加一条 `leaf` entry，让“当前分支指针变化”本身成为持久事件。证据见 `/Users/lienli/Documents/GitHub/agent-ref/pi/packages/agent/src/harness/session/jsonl-storage.ts:226` 和 `/Users/lienli/Documents/GitHub/agent-ref/pi/packages/agent/src/harness/session/jsonl-storage.ts:250`。

恢复时，`Session.getBranch()` 从 leaf 回溯到 root，`buildSessionContext()` 再把路径 entry 转换成当前模型上下文。这里最值得注意的是 compaction 的处理：一旦路径中存在 compaction entry，构建上下文时会先插入 compaction summary，再只保留 `firstKeptEntryId` 之后的消息和 compaction 之后的新消息。证据见 `/Users/lienli/Documents/GitHub/agent-ref/pi/packages/agent/src/harness/session/session.ts:21`、`/Users/lienli/Documents/GitHub/agent-ref/pi/packages/agent/src/harness/session/session.ts:57` 和 `/Users/lienli/Documents/GitHub/agent-ref/pi/packages/agent/src/harness/session/session.ts:159`。

这给 Guga 的启发是：压缩不应该覆盖旧消息，也不应该只在内存里替换上下文。压缩应当是会话树上的一类 durable entry，包含 summary、first kept entry、tokens before、details 等信息。这样恢复、审计、分支、回滚、历史搜索才有共同基准。

`Fact`: `pi` 的 session 持久化是 append-only JSONL + tree path reconstruction。

`Inference`: 对 Guga 来说，`pi` 是 P0 参考。它解决的是“agent 崩溃、恢复、压缩、分支后是否还能知道自己是谁”的问题，而不是“如何记住用户喜欢什么”的问题。

## graphiti：以事件图谱承载长期事实

`graphiti` 的核心不是向量记忆，而是 temporal knowledge graph。它的 `Graphiti` facade 在初始化时接收或创建 graph driver、LLM client、embedder、cross encoder，并统一放进 `GraphitiClients`。证据见 `/Users/lienli/Documents/GitHub/memo-ref/graphiti/graphiti_core/graphiti.py:137`、`/Users/lienli/Documents/GitHub/memo-ref/graphiti/graphiti_core/graphiti.py:207`、`/Users/lienli/Documents/GitHub/memo-ref/graphiti/graphiti_core/graphiti.py:216` 和 `/Users/lienli/Documents/GitHub/memo-ref/graphiti/graphiti_core/graphiti.py:235`。

它最重要的抽象是把原始事件、抽取实体、实体关系分开。`EpisodicNode` 表示原始 episode，`EntityNode` 表示抽取出的实体，`EntityEdge` 表示事实关系。Graphify 报告也把 `EntityNode`、`EntityEdge`、`EpisodicNode`、`GraphDriver` 标成高度连接节点。这说明它的 memory 模型不是“把一段文本 embedding 后塞进库里”，而是先保留事件，再把事件投影成可查询的实体和边。

这个设计适合需要时间、来源和关系可解释性的场景。例如“用户上周说 A，今天改成 B，哪个是当前有效事实？”、“某个项目约束来自哪次对话？”、“两个实体之间的关系何时形成、是否过期？”这些问题只靠普通向量 top-k 很难可靠回答。

但它也有明显成本。图谱模型需要图数据库、抽取 pipeline、去重、实体合并、关系时效、搜索排序和数据修复。对 Guga 的 early memory MVP 来说，直接引入完整 graph-native runtime 很可能会先增加复杂度，而不是增加可用性。

`Fact`: `graphiti` 明确把 provider、图驱动和 search/rerank 组合在 facade 内，同时保留 episode/entity/edge 的模型边界。

`Inference`: Guga 可以先借鉴它的数据哲学：原始事件不可丢，长期事实是投影。图数据库本身可以延后，先把事件 ID、valid time、source span、entity/fact schema 预留出来。

## mem0：向量记忆 SDK 的工程化路径

`mem0` 是最接近“拿来就能用”的 memory SDK。它的 `MemoryConfig` 明确配置 vector store、LLM、embedder、history DB、reranker，默认 history DB 位于 `~/.mem0/history.db`。证据见 `/Users/lienli/Documents/GitHub/memo-ref/mem0/mem0/configs/base.py:29` 和 `/Users/lienli/Documents/GitHub/memo-ref/mem0/mem0/configs/base.py:42`。

`Memory.add()` 的主流程很完整：先根据 `user_id`、`agent_id`、`run_id` 构造 metadata/filter scope，再解析消息；如果启用 inference，就先找 existing memories，再用 LLM 做单次记忆抽取，随后批量 embedding，按 hash 去重，写入 vector store，写入 SQLite history，并抽取实体写入独立 entity store。证据见 `/Users/lienli/Documents/GitHub/memo-ref/mem0/mem0/memory/main.py:621`、`/Users/lienli/Documents/GitHub/memo-ref/mem0/mem0/memory/main.py:699`、`/Users/lienli/Documents/GitHub/memo-ref/mem0/mem0/memory/main.py:706`、`/Users/lienli/Documents/GitHub/memo-ref/mem0/mem0/memory/main.py:723`、`/Users/lienli/Documents/GitHub/memo-ref/mem0/mem0/memory/main.py:784`、`/Users/lienli/Documents/GitHub/memo-ref/mem0/mem0/memory/main.py:824`、`/Users/lienli/Documents/GitHub/memo-ref/mem0/mem0/memory/main.py:843` 和 `/Users/lienli/Documents/GitHub/memo-ref/mem0/mem0/memory/main.py:865`。

它还有一个很值得借鉴的小边界：search 必须带至少一个 `user_id`、`agent_id` 或 `run_id` filter。证据见 `/Users/lienli/Documents/GitHub/memo-ref/mem0/mem0/memory/main.py:2541` 和 `/Users/lienli/Documents/GitHub/memo-ref/mem0/mem0/memory/main.py:2609`。这件事看似普通，其实是 memory 系统的安全底线：长期记忆必须有 scope，否则跨用户、跨 agent、跨任务污染会非常难查。

`mem0` 的风险也很典型：一个 `Memory` facade 同时处理消息解析、抽取、embedding、向量库、history、entity linking、rerank 和 search，应用接入很顺手，但平台内核会失去很多中间状态的观察和干预点。Guga 如果直接照搬这种大 facade，后续要加权限审批、敏感信息过滤、事实置信度、手动删除、prompt budget、trace 解释，都会变得吃力。

`Fact`: `mem0` 是 vector-store-centered memory runtime，并额外维护 history DB 和 entity store。

`Inference`: Guga 可以借鉴它的 API ergonomics 和 scope filter，但内部应拆成 `ingest -> extract -> decide -> persist -> retrieve -> render` 六段，每段都产出 trace。

## zep：托管 user/thread graph 与 turn-time 注入

`zep` 最值得 Guga 学的是集成位置。它的 ADK `ZepContextTool` 明确说明：这个 tool 不由模型直接调用，而是覆盖 `process_llm_request()`，在每次 LLM request 发出前持久化最新用户消息，并把 Zep 返回的 context 注入请求。证据见 `/Users/lienli/Documents/GitHub/memo-ref/zep/integrations/python/zep_adk/src/zep_adk/context_tool.py:1`、`/Users/lienli/Documents/GitHub/memo-ref/zep/integrations/python/zep_adk/src/zep_adk/context_tool.py:70` 和 `/Users/lienli/Documents/GitHub/memo-ref/zep/integrations/python/zep_adk/src/zep_adk/context_tool.py:290`。

这个 hook 里有几处工程细节值得保留。第一，identity 从 session state 解析，落到 `user_id` 和 `thread_id`，不是让调用方每次手工传。证据见 `/Users/lienli/Documents/GitHub/memo-ref/zep/integrations/python/zep_adk/src/zep_adk/context_tool.py:147`。第二，资源创建是 lazy 的，用户和 thread 不存在时再创建。证据见 `/Users/lienli/Documents/GitHub/memo-ref/zep/integrations/python/zep_adk/src/zep_adk/context_tool.py:217`。第三，默认路径通过 `thread.add_messages(return_context=True)` 单次调用完成持久化与 context 返回，并支持 `ignore_roles` 控制哪些角色不进入知识图谱 ingestion。证据见 `/Users/lienli/Documents/GitHub/memo-ref/zep/integrations/python/zep_adk/src/zep_adk/context_tool.py:84` 和 `/Users/lienli/Documents/GitHub/memo-ref/zep/integrations/python/zep_adk/src/zep_adk/context_tool.py:357`。第四，context 是 append 到 LLM instruction，而不是作为用户消息混入。证据见 `/Users/lienli/Documents/GitHub/memo-ref/zep/integrations/python/zep_adk/src/zep_adk/context_tool.py:380`。

CrewAI adapter 进一步显示 Zep 把 user/thread 和 generic graph 分开：`ZepUserStorage.save()` 根据 metadata type 把 message 写入 thread，或把 text/json 写入 user graph；`get_context()` 从 thread 取 user context。`ZepGraphStorage` 则面向 generic graph，保存 text/json/message 并搜索组成 context。证据见 `/Users/lienli/Documents/GitHub/memo-ref/zep/integrations/python/zep_crewai/src/zep_crewai/user_storage.py:18`、`/Users/lienli/Documents/GitHub/memo-ref/zep/integrations/python/zep_crewai/src/zep_crewai/user_storage.py:70`、`/Users/lienli/Documents/GitHub/memo-ref/zep/integrations/python/zep_crewai/src/zep_crewai/user_storage.py:172`、`/Users/lienli/Documents/GitHub/memo-ref/zep/integrations/python/zep_crewai/src/zep_crewai/graph_storage.py:18`、`/Users/lienli/Documents/GitHub/memo-ref/zep/integrations/python/zep_crewai/src/zep_crewai/graph_storage.py:61` 和 `/Users/lienli/Documents/GitHub/memo-ref/zep/integrations/python/zep_crewai/src/zep_crewai/graph_storage.py:98`。

`Fact`: `zep` 把 memory 作为 request lifecycle hook，而不是普通 model-callable tool。

`Inference`: Guga 的 memory retrieval 不应只暴露成 `search_memory` 工具。模型当然可以主动查，但 runtime 更应该在每轮模型调用前按 policy 组装 memory context，否则最关键的记忆使用时机被交给模型自觉。

## 其他项目的可借鉴点

Claude Code 的 memory 价值在两端：一端是文件化 memory 层，适合人和 agent 共同编辑；另一端是 append-only transcript/session resume，适合恢复运行时状态。既有分析材料 `docs/research/source-analysis/claude-code-analysis/analysis/04-agent-memory.md` 和 `docs/research/source-analysis/claude-code-analysis/analysis/04i-session-storage-resume.md` 可作为后续细读入口。

Hermes 是更完整的产品态参考。它有内置 `MEMORY.md` / `USER.md`、`MemoryManager`、provider 生命周期、外部 provider 限制、prefetch/sync/on_pre_compress 等 hook，还用 SQLite FTS5 做 `session_search`。这说明成熟 agent 往往同时需要“可编辑记忆文件”和“可搜索历史数据库”。入口见 `docs/research/source-analysis/hermes-wiki/concepts/memory-system-architecture.md` 与 `docs/research/source-analysis/hermes-wiki/concepts/session-search-and-sessiondb.md`。

DeerFlow 的可借鉴点是小而明确的 memory pipeline：结构化 `memory.json`、按 user/agent 分层、confidence threshold、异步队列、防抖、MemoryMiddleware 过滤工具与上传噪声、原子文件写。它适合 Guga 借鉴为早期 curated memory store 的实现方式。入口见 `docs/research/source-analysis/deerflow-book/chapters/11-memory-architecture.md` 与 `docs/research/source-analysis/deerflow-book/chapters/12-memory-pipeline.md`。

OpenCode 更偏 session persistence 和状态同步。server 维护 source of truth，客户端通过 SSE 和 JSON Patch 得到投影。它提醒 Guga：如果后续有 CLI/TUI/Web 多客户端，memory/session 的权威状态最好在 runtime/server，而不是分散到各客户端。入口见 `docs/research/source-analysis/learn-opencode/docs/internals/session.md` 与 `docs/research/source-analysis/learn-opencode/docs/flow/state_sync.md`。

Blade 和 DeepAgentsJS 的价值在简洁：通过 memory tools 或文件式 memory store 给 agent 一个可解释的长期信息入口。它们不够覆盖复杂 memory 架构，但适合作为 Guga P0/P1 的低复杂度 fallback。

## Guga 推荐落地

P0 应先做 durable session substrate。采用 append-only session log 或 tree，所有 user/assistant/tool/compaction/branch/metadata 变化都写成事件。每条事件要有 `id`、`parent_id`、`session_id`、`turn_id`、`timestamp`、`source`、`scope`。压缩只追加 compaction entry，不覆盖原始事件。这里优先参考 `pi`。

P0/P1 做 curated memory store。先用结构化文件或轻量 SQLite 表，不急着上图数据库。memory item 至少包含 `id`、`scope(user/project/agent/run)`、`kind(preference/fact/decision/procedure)`、`content`、`source_event_ids`、`confidence`、`created_at`、`updated_at`、`expires_at?`、`status(active/deleted/superseded)`。写入应经过 policy gate：自动抽取可以建议，最终写入要能解释为什么。

P1 做 turn-time retrieval/injection。借鉴 Zep，把 memory retrieval 放在 LLM request 前的 runtime hook。hook 输入当前 user message、session state、active project、context budget；输出受预算控制的 `<MEMORY_CONTEXT>`，并记录检索 query、命中项、注入长度和被丢弃原因。

P1/P2 做 vector retrieval。借鉴 mem0 的 scope filter：任何 search 必须限定 user/project/agent/run 中至少一个 scope。向量库只负责候选召回，不负责最终 truth。rerank 可以后置，先保证 trace 和删除语义。

P2 再做 graph projection。借鉴 graphiti 的 episode/entity/edge 思路，把 session events 和 curated memory 投影成实体、关系、时间有效性。图谱应是派生层，而不是 Guga memory 的唯一源头。这样早期没有图数据库也不影响会话恢复和基本长期记忆。

一个可执行的模块拆分可以是：

```text
SessionLog
  append(event)
  get_branch(leaf_id)
  append_compaction(summary, first_kept_event_id, tokens_before)

MemoryIngest
  observe(turn_events)
  propose(memory_candidates)

MemoryPolicy
  approve(candidate, scope, sensitivity, confidence)
  suppress(reason)

MemoryStore
  upsert(memory_item)
  tombstone(memory_id)
  list_by_scope(scope)

MemoryRetriever
  search(query, scope, filters, budget)
  rerank(candidates)

ContextInjector
  build_memory_context(request, session_state, budget)
  attach_to_llm_request(context_block)

GraphProjection
  project(events, memory_items)
  search_entities_and_edges(query, scope)
```

`Inference`: 这套分层比直接集成 `mem0` 或 `zep` 更慢一点，但更适合 Guga 这种需要长期演进 agent runtime 的项目。因为它把“保存事实”“判断是否该保存”“如何检索”“如何注入”拆开了。

## 不建议照搬

不建议一开始就把 graph database 作为 memory 的唯一真实来源。`graphiti` 很强，但它适合已经明确需要 temporal facts、实体关系和 provenance 的产品；Guga 早期更需要可靠 session substrate 与小型 curated memory。

不建议把所有逻辑藏进一个 `Memory.add/search` 大类。`mem0` 的接入体验很好，但 Guga 内核更需要中间过程可观察：抽取了什么、为什么写入、哪个 policy 放行、注入时为什么选中它、删除后还有没有残留。

不建议把 memory 只做成 model-callable tool。`search_memory` 工具有用，但如果 memory 是否使用完全靠模型主动调用，系统会在最需要记忆的地方失手。Zep 的 lifecycle hook 更接近 runtime 该承担的职责。

不建议默认把所有 assistant/tool 内容都进长期记忆。Zep 的 `ignore_roles`、DeerFlow 的 tool/upload noise filtering 都在提醒同一件事：长期记忆写入必须有角色、来源和敏感信息策略。工具输出尤其容易把临时文件、报错、密钥片段、无关日志污染记忆库。

不建议把 context compression 当作 memory。压缩摘要是为了让当前会话继续运行，不等于跨会话长期事实。压缩摘要可以成为 memory extraction 的输入，但不能直接等同于 durable memory。

## 待验证问题

`Pending Verification`: Guga 当前 agent loop 的 LLM request lifecycle hook 位置需要确认。memory injector 应插在 prompt assembly 之后还是 context compression 之前，取决于现有 runtime 的消息构造顺序。

`Pending Verification`: Guga 是否已有 session/event schema。如果已有，应优先扩展现有 schema，而不是新建平行 memory log。

`Pending Verification`: memory write 是否需要用户确认。对 coding agent 来说，项目约定和用户偏好可能可以自动候选、用户确认；普通会话事实可以先只进 session search，不进 curated memory。

`Pending Verification`: Guga 是否要支持多客户端/远端会话。如果需要，SessionLog 的 source of truth 应尽早放到 runtime/server 侧，避免客户端各自维护记忆状态。

## 证据索引

`pi`

- `/Users/lienli/Documents/GitHub/agent-ref/pi/packages/agent/src/harness/session/jsonl-storage.ts:8`：session header 契约。
- `/Users/lienli/Documents/GitHub/agent-ref/pi/packages/agent/src/harness/session/jsonl-storage.ts:226`：leaf 变化作为 durable entry 追加。
- `/Users/lienli/Documents/GitHub/agent-ref/pi/packages/agent/src/harness/session/jsonl-storage.ts:250`：append-only session entry 写入。
- `/Users/lienli/Documents/GitHub/agent-ref/pi/packages/agent/src/harness/session/session.ts:21`：`buildSessionContext()` 从 path entries 构造上下文。
- `/Users/lienli/Documents/GitHub/agent-ref/pi/packages/agent/src/harness/session/session.ts:57`：compaction summary 替代旧上下文，并保留 first kept 之后消息。
- `/Users/lienli/Documents/GitHub/agent-ref/pi/packages/agent/src/harness/session/session.ts:159`：`appendCompaction()` 持久化压缩事件。

`graphiti`

- `/Users/lienli/Documents/GitHub/memo-ref/graphiti/graphiti_core/graphiti.py:137`：`Graphiti` facade。
- `/Users/lienli/Documents/GitHub/memo-ref/graphiti/graphiti_core/graphiti.py:207`：driver 注入或创建。
- `/Users/lienli/Documents/GitHub/memo-ref/graphiti/graphiti_core/graphiti.py:216`：LLM/embedder/reranker 初始化。
- `/Users/lienli/Documents/GitHub/memo-ref/graphiti/graphiti_core/graphiti.py:235`：`GraphitiClients` 聚合。
- `docs/research/graphs/graphiti/GRAPH_REPORT.md`：Graphify 高连接节点显示 `EntityNode`、`EntityEdge`、`EpisodicNode`、`GraphDriver` 是核心结构。

`mem0`

- `/Users/lienli/Documents/GitHub/memo-ref/mem0/mem0/configs/base.py:29`：`MemoryConfig`。
- `/Users/lienli/Documents/GitHub/memo-ref/mem0/mem0/configs/base.py:42`：默认 history DB。
- `/Users/lienli/Documents/GitHub/memo-ref/mem0/mem0/memory/main.py:621`：metadata/filter scope 构造。
- `/Users/lienli/Documents/GitHub/memo-ref/mem0/mem0/memory/main.py:699`：V3 phased batch pipeline。
- `/Users/lienli/Documents/GitHub/memo-ref/mem0/mem0/memory/main.py:706`：existing memory retrieval。
- `/Users/lienli/Documents/GitHub/memo-ref/mem0/mem0/memory/main.py:723`：LLM extraction。
- `/Users/lienli/Documents/GitHub/memo-ref/mem0/mem0/memory/main.py:784`：hash dedup。
- `/Users/lienli/Documents/GitHub/memo-ref/mem0/mem0/memory/main.py:824`：vector batch persist。
- `/Users/lienli/Documents/GitHub/memo-ref/mem0/mem0/memory/main.py:843`：history records。
- `/Users/lienli/Documents/GitHub/memo-ref/mem0/mem0/memory/main.py:865`：entity linking。
- `/Users/lienli/Documents/GitHub/memo-ref/mem0/mem0/memory/main.py:2541`：search API。
- `/Users/lienli/Documents/GitHub/memo-ref/mem0/mem0/memory/main.py:2609`：search filter 必须包含 user/agent/run scope。

`zep`

- `/Users/lienli/Documents/GitHub/memo-ref/zep/integrations/python/zep_adk/src/zep_adk/context_tool.py:1`：`ZepContextTool` lifecycle hook 说明。
- `/Users/lienli/Documents/GitHub/memo-ref/zep/integrations/python/zep_adk/src/zep_adk/context_tool.py:70`：`ZepContextTool` 类定义。
- `/Users/lienli/Documents/GitHub/memo-ref/zep/integrations/python/zep_adk/src/zep_adk/context_tool.py:84`：`ignore_roles` 控制 graph ingestion。
- `/Users/lienli/Documents/GitHub/memo-ref/zep/integrations/python/zep_adk/src/zep_adk/context_tool.py:147`：identity resolution。
- `/Users/lienli/Documents/GitHub/memo-ref/zep/integrations/python/zep_adk/src/zep_adk/context_tool.py:217`：lazy resource creation。
- `/Users/lienli/Documents/GitHub/memo-ref/zep/integrations/python/zep_adk/src/zep_adk/context_tool.py:290`：`process_llm_request()`。
- `/Users/lienli/Documents/GitHub/memo-ref/zep/integrations/python/zep_adk/src/zep_adk/context_tool.py:357`：`thread.add_messages(return_context=True)`。
- `/Users/lienli/Documents/GitHub/memo-ref/zep/integrations/python/zep_adk/src/zep_adk/context_tool.py:380`：context 注入 LLM prompt。
- `/Users/lienli/Documents/GitHub/memo-ref/zep/integrations/python/zep_crewai/src/zep_crewai/user_storage.py:18`：`ZepUserStorage`。
- `/Users/lienli/Documents/GitHub/memo-ref/zep/integrations/python/zep_crewai/src/zep_crewai/user_storage.py:70`：save 路由 message/json/text。
- `/Users/lienli/Documents/GitHub/memo-ref/zep/integrations/python/zep_crewai/src/zep_crewai/user_storage.py:172`：thread context 获取。
- `/Users/lienli/Documents/GitHub/memo-ref/zep/integrations/python/zep_crewai/src/zep_crewai/graph_storage.py:18`：`ZepGraphStorage`。
- `/Users/lienli/Documents/GitHub/memo-ref/zep/integrations/python/zep_crewai/src/zep_crewai/graph_storage.py:61`：generic graph save。
- `/Users/lienli/Documents/GitHub/memo-ref/zep/integrations/python/zep_crewai/src/zep_crewai/graph_storage.py:98`：generic graph search。

`全部项目入口`

- `docs/research/intake/source-contract.md`：9 个 agent reference 的路径、版本锚点和解释边界。
- `docs/research/context-packs/memory-systems.md`：`graphiti`、`mem0`、`zep` 的 context pack。
- `docs/research/context-packs/context-compression.md`：会话压缩、恢复和 session 持久化参考。
- `docs/research/source-analysis/design-ideas-index.md`：全部专题分析材料索引。
