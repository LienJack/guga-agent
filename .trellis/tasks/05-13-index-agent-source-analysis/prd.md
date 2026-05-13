# Index agent source analysis research

## Goal

将四套外部源码解析资料整理到 `docs/research` 下，建立稳定入口和面向 LLM 查询的设计理念索引，方便后续围绕 agent 架构、上下文、工具、Provider、记忆、网关等主题检索。

## What I already know

- 用户指定的来源目录位于 `/Users/lienli/Documents/GitHub/agent-ref/`。
- 目标目录是 `/Users/lienli/Documents/GitHub/guga-agent/docs/research`。
- 用户后续主要会大量查询这些资料中的设计理念，而不是源码逐行细节。
- 现有 `docs/research` 已包含 `intake/` 和 `repomix/`，本任务应避免混入已有源码快照资料。

## Requirements

- [ ] 将 `claude-code-analysis`、`deerflow-book`、`hermes-agent-anatomy`、`Hermes-Wiki` 的解析资料放到 `docs/research` 下。
- [ ] 避免复制 `.git`、依赖目录、压缩包、源码镜像等查询噪声。
- [ ] 建立总 index，说明每套资料适合查询什么。
- [ ] 建立面向“设计理念”的主题索引，按问题域路由到相关资料。

## Acceptance Criteria

- [ ] `docs/research` 下存在新的源码解析资料目录。
- [ ] 索引中包含四套资料的来源、重点、查询入口和主题路由。
- [ ] 后续 LLM 可以从索引快速定位相关 Markdown 文件。

## Out of Scope

- 不重写或摘要替代原始解析正文。
- 不把这些资料并入现有 repomix 快照。
- 不复制完整源码库、Git 历史、node_modules 或构建产物。

## Technical Notes

- 已阅读 `.trellis/workflow.md` 和 `.trellis/spec/guides/agent-reference-projects-guide.md`。
- 已阅读 `karpathy-llm-wiki` 技能说明，采用“raw source + compiled index”的知识库整理思想，但落在项目现有 `docs/research` 结构内。
