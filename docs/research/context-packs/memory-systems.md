# Memory Systems Context Pack

## 问题边界

本包用于后续研究 Guga Agent 的长期记忆、用户画像、事实图谱、会话上下文注入和 memory tool / SDK 集成。它覆盖三个 memory 参考项目：

- `graphiti`：graph-native temporal memory / knowledge graph runtime。
- `mem0`：vector-store-centered memory SDK，带 LLM、embedder、reranker、entity store 和多语言/插件入口。
- `zep`：托管 memory / user graph 产品形态，重点在 SDK integration、turn-time context injection、user/thread graph 和 agent framework adapter。

本包只做研究入口和已确认事实沉淀，不给出 Guga 最终 memory 架构决策。

## 参考项目与版本

| 项目 | 本地路径 | Commit | Repomix | Graphify |
| --- | --- | --- | --- | --- |
| `graphiti` | `/Users/lienli/Documents/GitHub/memo-ref/graphiti` | `34f56e65e0fe2096132c8d16f3a1a4ac9300a5f6` | `docs/research/repomix/graphiti-context.1.xml`, `docs/research/repomix/graphiti-token-tree.txt` | `docs/research/graphs/graphiti/graph.json`, `docs/research/graphs/graphiti/GRAPH_REPORT.md`, `docs/research/graphs/graphiti/graph.html` |
| `mem0` | `/Users/lienli/Documents/GitHub/memo-ref/mem0` | `88934304c6e4e1e8472ac791a1095aea185e8002` | `docs/research/repomix/mem0-context.1.xml`, `docs/research/repomix/mem0-token-tree.txt` | `docs/research/graphs/mem0/graph.json`, `docs/research/graphs/mem0/GRAPH_REPORT.md` |
| `zep` | `/Users/lienli/Documents/GitHub/memo-ref/zep` | `faf2acec4f2ec777a27d8fe0411619bc913a9660` | `docs/research/repomix/zep-context.1.xml`, `docs/research/repomix/zep-token-tree.txt` | `docs/research/graphs/zep/graph.json`, `docs/research/graphs/zep/GRAPH_REPORT.md`, `docs/research/graphs/zep/graph.html` |

## 必读分析材料

- `docs/research/reference-project-workflow.md`：使用 Repomix、Graphify 和 Context Pack 的分层查询流程。
- `docs/research/context-packs/memory-systems.files.txt`：本包的证据入口清单。

## 必读源码文件

### Graphiti

- `graphiti_core/graphiti.py`：`Graphiti` facade，负责注入 graph driver、LLM、embedder、reranker，并提供 `add_episode` / `search` 等主入口。
- `graphiti_core/nodes.py`：`EpisodicNode`、`EntityNode`、`CommunityNode` 等图节点模型。
- `graphiti_core/edges.py`：`EpisodicEdge`、`EntityEdge`、`CommunityEdge` 等图边模型。
- `graphiti_core/search/search_config.py`、`graphiti_core/search/search_filters.py`：搜索结果和过滤契约。
- `graphiti_core/driver/driver.py`、`graphiti_core/driver/operations/*`：图数据库抽象和节点/边/search operations。

### mem0

- `mem0/memory/main.py`：`Memory` / `AsyncMemory` 主 runtime，覆盖 add/search/get/update/delete、实体抽取、向量写入和历史记录。
- `mem0/configs/base.py`：`MemoryConfig`、`MemoryItem` 等配置和返回模型。
- `mem0/utils/factory.py`：`LlmFactory`、`EmbedderFactory`、`VectorStoreFactory`、`RerankerFactory`。
- `mem0/vector_stores/base.py`：vector store 插件接口。
- `mem0/memory/storage.py`：本地 history DB 管理。
- `mem0-ts/src/oss/src/memory/index.ts`：TypeScript OSS memory runtime 对照。

### Zep

- `integrations/python/zep_adk/src/zep_adk/context_tool.py`：`ZepContextTool`，在 ADK LLM request lifecycle 中持久化用户消息并注入 Zep context。
- `integrations/python/zep_adk/src/zep_adk/graph_search_tool.py`：显式 graph search tool。
- `integrations/python/zep_crewai/src/zep_crewai/graph_storage.py`：`ZepGraphStorage`，用于 project / shared graph storage。
- `integrations/python/zep_crewai/src/zep_crewai/user_storage.py`：`ZepUserStorage`，用于 user graph 和 thread context。
- `examples/typescript/memory/memory_example.ts`、`examples/typescript/graph/user_graph_example.ts`：SDK 使用形态。

## 关键抽象

- `Episode` vs `Entity` vs `Edge`：Graphiti 明确把原始事件/对话片段、抽取出的实体节点、实体关系边分开，适合研究 temporal knowledge graph。
- `Memory` facade：mem0 用一个 SDK facade 封装 LLM、embedder、vector store、reranker、history DB 和实体 store，适合研究“应用侧 memory API”。
- `User / Thread context`：Zep 的核心集成点是 user graph + thread context，在 turn-time 把 context 注入 outgoing LLM request。
- `Provider factories`：Graphiti 和 mem0 都把 LLM/embedder/database/vector store 作为可替换 provider，而不是把某个供应商写死在 memory 逻辑里。
- `Context injection hook`：Zep ADK adapter 把 memory 作为 request lifecycle hook，而不是让模型主动调用普通 tool；这对 Guga 的 prompt/context policy 很有参考价值。

## 已确认事实

- Fact: Graphiti 的 `Graphiti` 初始化时接收或创建 `GraphDriver`、`LLMClient`、`EmbedderClient`、`CrossEncoderClient`，并把它们汇总到 `GraphitiClients`。证据：`docs/research/repomix/graphiti-context.1.xml` 中 `graphiti_core/graphiti.py` 的 `class Graphiti`。
- Fact: Graphiti 的主模型包含 `EpisodicNode`、`EntityNode`、`EntityEdge`、`SearchResults`、`SearchFilters`，Graphify 查询也把这些列为 memory architecture 的核心节点。证据：`docs/research/graphs/graphiti/graph.json` 与 `docs/research/repomix/graphiti-context.1.xml`。
- Fact: mem0 的 `Memory` 初始化通过 factory 创建 embedder、vector store、LLM、reranker，并持有 SQLite history DB；entity store 是 lazy initialized。证据：`docs/research/repomix/mem0-context.1.xml` 中 `mem0/memory/main.py`。
- Fact: mem0 的实体 store 使用与主 vector store 同类 provider 的独立 collection，并把实体 payload 连接到 `linked_memory_ids`。证据：`docs/research/repomix/mem0-context.1.xml` 中 `_upsert_entity` 和 `entity_store`。
- Fact: Zep ADK 的 `ZepContextTool` 不作为模型可直接调用的普通工具，而是在 `process_llm_request()` 中保存最新用户消息并向 LLM request 追加 context。证据：`docs/research/repomix/zep-context.1.xml` 中 `integrations/python/zep_adk/src/zep_adk/context_tool.py`。
- Fact: Zep CrewAI integration 区分 `ZepGraphStorage` 和 `ZepUserStorage`，前者偏共享 graph storage，后者偏 user graph / thread context。证据：`docs/research/repomix/zep-context.1.xml` 中 `integrations/python/zep_crewai/src/zep_crewai/*_storage.py`。

## Guga 迁移判断

- Adopt: 把 memory 入口设计成小 facade，但内部必须分层：ingest、extract、store、search、rerank、context-render，各层都记录来源和作用域。
- Adapt: Graphiti 的 episode/entity/edge 模型适合 Guga 的长期事实图谱，但一开始不应复制完整图数据库 operation namespace；先保留抽象边界和证据模型。
- Adapt: mem0 的 provider factory 模式适合 Guga，但 vector store、entity store、history DB 不应藏在一个不可观察的大类里；需要事件、trace 和 policy hooks。
- Adopt: Zep 的 turn-time context injection 很适合 Guga 的 context policy/plugin 方向；memory context 应由 runtime 在 LLM request 前组装，而不是完全交给模型决定何时调用。
- Defer: 多框架 adapter、dashboard、benchmark harness、ontology UI 等产品层能力先作为参考，不进入 Guga memory MVP。

## 待验证问题

- Guga memory 是否先支持 graph store，还是先以 vector/event log 为主、graph projection 为派生层？
- Memory write 应该默认自动发生，还是必须经过 policy/permission gate？
- Assistant response 是否进入长期记忆，是否需要像 Zep 的 `ignore_roles` 一样显式控制？
- Context injection 的 budget、recency、relevance、safety policy 如何和现有 context compression pack 对齐？
- Memory artifacts 是否应该进入 session transcript，还是作为外部 store 只留下引用和检索证据？
