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
| `repomix` | 用于源码级实现规划的 packed source context 和 token tree。 |
