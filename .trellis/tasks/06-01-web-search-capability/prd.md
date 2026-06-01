# brainstorm: web search capability

## Goal

为 Guga Agent 规划可由模型调用的 web search 能力，让 agent 能在需要最新资料、外部文档、事实核验或研究发现时检索互联网，并把参考项目 pi、opencode、claude code 的实现经验映射成可执行计划。

## What I already know

* 用户希望先调研 pi、opencode、claude code 的 web search 功能实现，再写计划。
* 用户要求计划放在 `docs/` 下。
* 项目要求研究参考 agent 项目时遵循 7 层研究漏斗，不从原始源码开始。
* 现有文档中已有 tool registry、agent loop、permission runtime、deep research、CLI workbench 等相关规划。
* 调研发现 opencode 明确区分 `websearch` 与 `webfetch`；claude-code 资料中存在 `WebSearchTool`；pi focused context 展示的是 skill/extension 形态的 `brave-search`，不是 core built-in web search。

## Assumptions (temporary)

* MVP 先聚焦“搜索发现”工具，不直接实现完整浏览器自动化。
* 搜索结果需要来源、标题、摘要、URL、时间等结构化字段，并在上下文中可控截断。
* 网络能力需要走权限、配置和审计边界，避免模型无约束访问互联网。

## Open Questions

* 已解决：MVP 先做 `web_search`；`web_fetch` 作为同包 PR2/follow-up。

## Requirements (evolving)

* 调研 pi、opencode、claude code 的 web search / web fetch / provider built-in web search 设计。
* 基于 Guga 现有架构约束提出 2-3 个可行实现路径。
* 在 `docs/` 下输出一份实现计划。
* 推荐方案为 first-party optional extension：`@guga-agent/plugin-web-search`，MVP 提供 `web_search`，后续同包扩展 `web_fetch`。

## Acceptance Criteria (evolving)

* [x] 计划包含参考项目对比、可借鉴模式、不建议照搬、Guga 落点和证据强度。
* [x] 计划明确 MVP 范围、模块拆分、权限/配置、测试策略、风险与后续扩展。
* [x] PRD 记录研究来源和关键决策。

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Out of Scope (explicit)

* 本轮不实现代码。
* 本轮不引入真实搜索供应商密钥或在线调用。
* 本轮不实现完整浏览器控制、网页截图、登录态访问。

## Technical Notes

* Research funnel to use: context packs -> graph/understand if present -> source-analysis -> token trees -> packed context targeted extraction -> raw repos only if still necessary.
* Candidate docs: `docs/research/context-packs/tool-registry.md`, `docs/research/context-packs/agent-loop.md`, `docs/research/repomix/*-token-tree.txt`, `docs/research/source-analysis/learn-opencode/docs/packages/opencode/03-tools-and-capabilities.md`.
* Plan written to `docs/plans/2026-06-01-001-feat-web-search-capability-plan.md`.

## Research Notes

### What similar tools do

* Pi: focused context did not show a core built-in web search tool; it demonstrates `skill:brave-search` and custom `ToolDefinition` registration. This suggests an extension/skill-first posture.
* OpenCode: provides native `websearch` and `webfetch`, plus provider-side hosted web search adapters for Copilot Responses. It separates discovery from retrieval and gates web search through registry/permissions/config flags.
* Claude Code: implements `WebSearchTool` as a first-class read-only tool with adapter backends for API server-side search, Bing, Brave, and Exa. It uses structured `SearchResult`/`SearchOptions` and UI/progress renderers.

### Constraints from Guga

* `packages/core` already owns tool execution authority: schema, permission, hook, timeout, result budget and events.
* Project spec keeps optional ecosystem integrations outside core kernel; web search is external network access, so it should be an optional extension.
* Tests should stay credential-free with injected/mock backend.

### Decision

Use Approach A from the plan: implement `@guga-agent/plugin-web-search` as a first-party optional extension. Keep provider-hosted search and skill/MCP search as complementary backends/follow-ups, not the MVP foundation.
