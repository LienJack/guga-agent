# Deep Research Agent Architecture Research

## 一句话结论

M10 应采用 **evidence-ledger-first deep research profile**：先把研究任务分解、来源优先级、证据强度、报告结构变成 typed helpers，再逐步接入 subagent、search、resume 和 artifact 工作流。

## 项目对比

| 项目 | 证据 | Guga 判断 |
| --- | --- | --- |
| DeerFlow Lead Agent | Fact: `docs/research/source-analysis/deerflow-book/chapters/05-lead-agent.md` 描述 lead agent 动态组装模型、工具、中间件和 prompt。 | Adopt profile-level research workflow composition. |
| DeerFlow Sub-Agent | Fact: `docs/research/source-analysis/deerflow-book/chapters/08-subagent-overview.md` 描述 Lead 负责分解、Sub-Agent 上下文隔离、单层委派和 trace_id。 | Defer actual subagents, but adopt self-contained task decomposition and traceable outputs. |
| DeepAgentsJS | Fact: `docs/roadmap.md` records DeepAgentsJS as middleware composition for filesystem, subagents, summarization, skills, memory, HITL, and cache. | Adapt middleware mindset as composable helpers, not framework adoption. |
| Hermes | Fact: `docs/research/source-analysis/hermes-wiki/concepts/session-search-and-sessiondb.md` describes searchable session history with structured summaries. | Adopt searchable/reusable evidence records; defer DB/FTS implementation. |
| Guga research rule | Fact: `AGENTS.md` requires the 7-layer research funnel and output format for reference-project research. | Encode source policy and report format directly in the profile package. |

## 可借鉴模式

- Research should start from curated summaries, not raw source.
- Subtasks must be self-contained if delegated later.
- Evidence records should outlive a single Markdown report.
- Reports must separate Fact, Inference, and Pending Verification.
- Artifact-first output makes later brainstorm/plan work reusable.

## 不建议照搬

- 不照搬 LangGraph runtime；Guga 已有自己的 core loop。
- 不在 MVP 接 DeepAgentsJS 框架；先保留 helper/package 边界。
- 不做 Hermes FTS5 SessionDB；先做 ledger DTO 和 report writer。
- 不让 deep research 自动改代码。

## Guga 落点

1. Create `packages/profile-deep-research-agent`.
2. Export profile metadata and system prompt.
3. Export source policy helpers for the 7-layer funnel.
4. Export evidence ledger helpers.
5. Export Markdown report writer and quality checks.
6. Teach CLI `--profile deep-research`.

## 证据

- Fact: `docs/research/source-analysis/deerflow-book/chapters/05-lead-agent.md` shows workflow composition through model/tools/middleware/prompt/state.
- Fact: `docs/research/source-analysis/deerflow-book/chapters/08-subagent-overview.md` shows single-layer delegation, self-contained prompts, and trace_id.
- Fact: `docs/research/source-analysis/hermes-wiki/concepts/session-search-and-sessiondb.md` shows structured retrieval over prior sessions.
- Fact: `docs/roadmap.md` positions DeepAgentsJS as middleware composition inspiration.
- Inference: The lowest-risk M10 is a structured research profile and report pipeline before external search/subagents.
