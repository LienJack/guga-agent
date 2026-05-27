# 研究索引

这个目录是 Guga Agent 架构研究和参考项目研究的快速入口。

## 主要入口

- [来源契约](./intake/source-contract.md)：规范的参考项目列表和版本锚点。
- [参考项目指南](../../.trellis/spec/guides/agent-reference-projects-guide.md)：使用 `/Users/lienli/Documents/GitHub/agent-ref` 的路由规则。
- [Repomix 快照](./repomix/)：核心参考项目的源码级 packed context 和 token tree。
- [源码分析语料](./source-analysis/index.md)：从本地 `agent-ref` workspace 复制来的人工源码阅读材料。
- [设计理念索引](./source-analysis/design-ideas-index.md)：按主题查询源码分析语料中的设计理念。
- [参考项目省 Token 工作流](./reference-project-workflow.md)：组合 Graphify、Understand-Anything、GitNexus、LLM Context Pack 与 repomix 的查询协议。
- [参考项目索引建设状态](./index-build-status.md)：记录 Repomix token tree、GitNexus、Graphify、Understand-Anything 的当前建设状态。
- [Context Packs](./context-packs/)：用于沉淀高频主题的小型 LLM 上下文包。
- [Memory Systems Context Pack](./context-packs/memory-systems.md)：`graphiti` / `mem0` / `zep` 的长期记忆、图谱、检索和 context injection 研究入口。
- [Skills, MCP, And Capability Discovery](./skills-mcp-capability-discovery.md)：M6 对 skills 渐进加载、MCP stdio、capability discovery/diff、namespace/owner/source 的研究与 Guga 落点。

## 查询方式

如果问题是设计原则或架构理念，先读 [source-analysis/design-ideas-index.md](./source-analysis/design-ideas-index.md)，再只打开其中链接的相关主题文件。

如果问题是实现细节或源码验证，先读 [intake/source-contract.md](./intake/source-contract.md)，再使用 [repomix](./repomix/) 下的相关文件；只有在 packed context 不足时才打开原始参考仓库。

如果问题是“如何更快参考别人的项目”或需要反复横向对比参考项目，使用 [参考项目省 Token 工作流](./reference-project-workflow.md)。

如果架构设计请求中出现 "参考全项目"，遵循 [架构设计工作流](../../.trellis/spec/guides/agent-reference-projects-guide.md#架构设计工作流)：

1. 明确子系统和期望架构输出；
2. 使用 [`arch-insight` 风格的设计分析方法](../../.trellis/spec/guides/agent-reference-projects-guide.md#设计分析方法)，建立 intake、主流程、核心抽象、设计取舍和可借鉴边界；
3. 使用 `source-analysis` 收集概念和取舍；
4. 使用 `repomix/*-token-tree.txt` 定位可能相关的源码文件；
5. 使用 `repomix/*-context*.xml` 做源码级确认；
6. 只有在 packed context 不足时，才打开 `/Users/lienli/Documents/GitHub/agent-ref/<project>` 原始文件；
7. 综合成 Guga 专属设计，包含参考发现、决策、阶段、风险和测试。

## 语料地图

| 区域 | 适合查询 |
| --- | --- |
| `source-analysis/claude-code-analysis` | Claude Code 架构、安全姿态、prompt/context/session 机制、tools、MCP、skills、sandbox、multi-agent 行为。 |
| `repomix/claude-code-*` | `claude-code` 源码级验证，适合查官方产品主链路、TUI/CLI、context、permissions、MCP/skills、tools、bridge/server、multi-agent 和 provider 接入。 |
| `source-analysis/deerflow-book` | DeerFlow 的 LangGraph 风格架构、middleware、subagents、memory、sandboxing、MCP、skills、gateway、deployment。 |
| `source-analysis/hermes-agent-anatomy` | Hermes 架构图解、agent loop、tool registry、provider routing、compression、gateway、memory/RL 对比。 |
| `source-analysis/hermes-wiki` | 按子系统直接查询 Hermes 概念页，适合 LLM 快速定位。 |
| `source-analysis/learn-opencode` | OpenCode 学习/源码分析文档，覆盖 monorepo 架构、internals、flows、packages、ACP/LSP/MCP、permissions、tools、SDK、UI 和 clients。 |
| `repomix/pi-*` | `pi` 源码级验证，适合查 TypeScript coding agent harness、JSONL session、compaction、provider/OAuth、CLI/TUI、skills 和 extension 主链路。 |
| `repomix/graphiti-*`, `repomix/mem0-*`, `repomix/zep-*` | memory 参考项目源码级验证，适合查 graph memory、vector memory、user graph、thread context、SDK/tool integration 和 turn-time context injection。 |
| `graphs/graphiti`, `graphs/mem0`, `graphs/zep` | memory 参考项目 Graphify 图谱，适合先定位核心类、社区和跨文件关系。 |
| `repomix` | 用于源码级实现规划的 packed source context 和 token tree。 |

## 模块调研报告

| 模块 | 调研问题 | 参考项目 | 输出文档 | Guga 落点 |
| --- | --- | --- | --- | --- |
| M0 Core Kernel Runtime | 最小 agent loop 如何在没有 CLI/UI/真实 provider/真实工具时独立完成 user -> model -> tool -> model -> final。 | Guga context packs, ReAct/tool registry research | [M0 plan research section](../plans/2026-05-26-001-feat-core-kernel-runtime-plan.md#context--research) | `@guga-agent/core` owns contracts, capability registry, event bus, conversation state, agent loop, and mock-first tests. |
| M1 Plugin Host / Hook Kernel | 能力如何从 core 外部进入 runtime，且行为控制点不退化成普通事件监听。 | OpenCode plugin loading, Hermes hook system, Guga hook docs | [M1 plan research section](../plans/2026-05-26-002-feat-plugin-host-hook-kernel-plan.md#context--research) | Add local `PluginHost`, constrained `PluginContext`, and deterministic `HookKernel`. |
| M2 Provider Runtime / AI SDK Bridge | 真实 provider transport 如何接入，同时不让 SDK 类型污染 core provider contract。 | Provider abstraction context pack, AI SDK bridge implementation | [M2 plan research section](../plans/2026-05-26-003-feat-provider-ai-sdk-bridge-plan.md#context--research) | Core owns provider routing/model events; `@guga-agent/provider-ai-sdk` maps SDK details at the edge. |
| M3 Tool Plugins / Permission Runtime | 模型提出真实工具动作时，runtime 如何统一权限、hooks、调度、超时和结果治理。 | Tool registry context pack, Guga M1 hooks, filesystem/shell/git plugin implementation | [M3 plan research section](../plans/2026-05-26-004-feat-tool-permission-runtime-plan.md#context--research) | Core-owned execution pipeline and permission kernel; first-party filesystem/shell/git tools stay plugins. |
| M4 Context Policy / Projection | 长任务中模型每轮看到的内容如何从消息历史升级为可解释、可预算、可压缩的 projection。 | Context compression pack, context-policy research docs, Guga M3 result policy | [M4 plan research section](../plans/2026-05-27-001-feat-context-policy-plugins-plan.md#context--research) | Model input projection, context source descriptors, compaction, reinjection, and default context policy plugin. |
| M5 Session Store / Replay | session、event、artifact、resume、fork、model-input replay 如何成为 durable workbench substrate。 | Pi, Claude Code, OpenCode, Hermes Agent | [M5 plan research section](../plans/2026-05-27-002-feat-session-store-replay-plugins-plan.md#context--research) | Core exposes persistence/replay contracts; JSONL session, filesystem artifact, and replay audit plugins prove local-first durability. |
| M6 Skills / MCP / Capability Discovery | skills 如何渐进加载、MCP 如何进入统一工具池、capability discovery/diff 如何解释插件能力变化。 | Claude Code, OpenCode, Hermes Agent, DeerFlow | [skills-mcp-capability-discovery.md](./skills-mcp-capability-discovery.md) | Core 提供 descriptor/diff/owner/source contract；`plugin-skills` 和 `plugin-mcp` 作为 first-party 插件落地。 |
| M7/M11 CLI / Desktop / Web Host Architecture | CLI-first host protocol 如何承载 session/run/event/permission/artifact/resume/fork，并让桌面/Web 复用同一 runtime。 | OpenCode, DeerFlow, Hermes Agent, cc-haha, AG-UI research | [cli-desktop-web-host-architecture.md](./cli-desktop-web-host-architecture.md) | 先建 typed host protocol、local server + SSE、SDK、CLI；桌面/Web 做同一事件流的 viewer/control surface。 |
| M8 Production / Operations Runtime | provider health、credential/config、audit export、trust/scope、eval/replay、metrics 如何通过插件和 host surface 落地。 | Hermes Agent, OpenCode, Claude Code, DeerFlow, Guga M6/M7 | [production-operations-runtime.md](./production-operations-runtime.md) | plugin-first production substrate；core 只补稳定 contract，运营数据从事件、capability 和 host protocol 派生。 |
| M9 Code Agent | coding agent 如何成为 profile/plugin bundle，而不是把 core 变成代码专用运行时。 | Claude Code, OpenCode, Pi, Guga M6-M8 | [code-agent-architecture.md](./code-agent-architecture.md) | `@guga-agent/profile-code-agent` owns coding prompt, permissions, repo context, plugin bundle, and test discovery. |
| M10 Deep Research Agent | deep research 如何保持来源顺序、证据强度和报告结构，而不先引入搜索/子代理复杂度。 | DeerFlow, DeepAgentsJS, Hermes Agent, Guga research funnel | [deep-research-agent-architecture.md](./deep-research-agent-architecture.md) | `@guga-agent/profile-deep-research-agent` owns source policy, evidence ledger, report writer, and CLI profile. |
| M12 Learning / Blog / Eval Flywheel | 如何把 research、plan、solution、blog、eval 和 finish 变成每个模块可复用的闭环。 | Guga roadmap, M5-M10 artifacts, Claude Code writing reference | [learning-writing-eval-flywheel.md](./learning-writing-eval-flywheel.md) | `@guga-agent/eval-fixtures` seeds hermetic cross-module evals; docs index and articles become the recovery path for future sessions. |
| M13 Review / Eval Agent | review/eval agent 如何产出 findings-first 审查报告，并保持 core role-neutral。 | Guga M9/M10/M12 profile and ledger patterns, tool/loop risk packs | [review-eval-agent-architecture.md](./review-eval-agent-architecture.md) | `@guga-agent/profile-review-agent` owns review findings, report writer, diagnostics, and CLI profile. |
| M14 Multi-Agent Delegation | 多 agent 能力应先做单层委派工具，还是直接引入 handoff/team/swarm/workflow。 | OpenAI Agents SDK, DeerFlow, Hermes Agent, Claude Code, LangGraph/Mastra, A2A | [multi-agent-delegation-runtime.md](./multi-agent-delegation-runtime.md) | `@guga-agent/plugin-tools-delegation` exposes `delegate_task` as a normal permissioned tool with injected child runner, isolated input, allowlisted tools, and compact ledger metadata. |
| M15 Memory Candidate Ledger | 长期记忆应如何先成为可审计候选投影，而不是自动写入和注入 prompt 的隐藏状态。 | Graphiti, mem0, Zep, Hermes Agent memory boundaries, Guga M5 replay substrate | [memory-candidate-ledger.md](./memory-candidate-ledger.md) | `@guga-agent/plugin-memory-candidates` validates governed candidates, scans safety risks, sorts ledgers, and renders only accepted safe candidates. |
| M16 Memory Governance Store | memory candidate 如何经由显式接受、拒绝、替换决策变成 active memory item，而不引入自动写入或检索。 | Guga M15 candidate ledger, Hermes curated memory, mem0 scope filters, Guga memory architecture research | [memory-governance-store.md](./memory-governance-store.md) | `@guga-agent/plugin-memory-candidates` adds decision validation, governed active-item projection, scope-bounded listing, and `memory.governance` discovery. |
| M17 Memory JSONL Store | memory candidates 和 governance decisions 如何落盘为可恢复、可审计的本地事实，而不改变治理语义。 | Guga M5 JSONL session substrate, M15/M16 memory contracts, Guga memory architecture research | [memory-jsonl-store.md](./memory-jsonl-store.md) | `@guga-agent/plugin-memory-jsonl` appends validated candidates/decisions, detects JSONL corruption, and reopens records through the governed memory ledger. |
| M18 Scoped Memory Retrieval | governed memory 如何在不使用 embeddings 和不自动注入 prompt 的前提下，先提供 scope-required deterministic retrieval。 | Guga M16/M17 memory substrate, mem0 scope-filter lesson, Guga memory architecture research | [memory-scoped-retrieval.md](./memory-scoped-retrieval.md) | `@guga-agent/plugin-memory-candidates` adds active-safe lexical retrieval with required scope, match reasons, optional kind/tag filters, and bounded rendering. |
| M19 Memory Markdown Export | governed memory 如何先投影成可人工审阅的 Markdown，而不是直接自动改写 `MEMORY.md`。 | Hermes curated memory files, Guga M16-M18 memory layers, Guga memory architecture research | [memory-markdown-export.md](./memory-markdown-export.md) | `@guga-agent/plugin-memory-candidates` renders active safe memory items grouped by scope/kind with bounded content, metadata, tags, and source refs. |
| M20 Memory Review Report | governed memory 如何先形成健康度和待审队列报告，而不是直接进入自动导入、文件写入或 prompt 注入。 | Guga M15-M19 memory layers, Guga memory architecture research | [memory-review-report.md](./memory-review-report.md) | `@guga-agent/plugin-memory-candidates` creates a typed review report and bounded Markdown audit view over active, superseded, rejected, undecided, unsafe, and diagnostic memory state. |
| M21 Memory Review Capability | memory review report 如何进入 capability discovery，同时保持 read-only audit 语义。 | Guga M15/M16 capability descriptors, M20 memory review report | [memory-review-capability.md](./memory-review-capability.md) | `@guga-agent/plugin-memory-candidates` exposes `memory.review` as a first-party plugin-owned operation descriptor with memory read-only trust scope. |
| M22 Memory JSONL Review Report | durable memory JSONL 如何一键读成 review report，同时保留 corrupt/partial-tail 语义。 | Guga M17 JSONL store, M20 review report | [memory-jsonl-review-report.md](./memory-jsonl-review-report.md) | `@guga-agent/plugin-memory-jsonl` adds `readReviewReport()` to project durable records through governance into the typed memory review report. |
| M23 Memory JSONL Review Markdown | durable memory JSONL 如何直接提供可展示的 Markdown audit view，而不写入文件。 | Guga M20 review renderer, M22 JSONL review report | [memory-jsonl-review-markdown.md](./memory-jsonl-review-markdown.md) | `@guga-agent/plugin-memory-jsonl` adds `readReviewMarkdown()` to return the typed report, bounded Markdown, and JSONL diagnostics from durable records. |
| M24 Memory Review Health | memory review report 如何提供 healthy / needs_review / blocked 的小型状态信号，避免各 host 自行解释 count。 | Guga M20 review report, M22/M23 durable review surfaces | [memory-review-health.md](./memory-review-health.md) | `@guga-agent/plugin-memory-candidates` adds `createMemoryReviewHealth()` and `renderMemoryReviewHealthBlock()` for deterministic audit gating. |
| M25 Memory JSONL Review Health | durable memory JSONL 如何直接提供 review health signal，同时保留 JSONL diagnostics。 | Guga M22 JSONL review report, M24 memory review health | [memory-jsonl-review-health.md](./memory-jsonl-review-health.md) | `@guga-agent/plugin-memory-jsonl` adds `readReviewHealth()` to return report, health, and JSONL diagnostics from durable records. |
