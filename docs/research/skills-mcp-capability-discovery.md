# Skills, MCP, And Capability Discovery Research

## 一句话结论

Guga M6 应采用“core 只扩 contract 和所有权追踪，skills/MCP 作为 first-party plugins 落地”的路线：skills 使用 metadata -> body -> assets 的渐进加载；MCP 先做 stdio，并把 MCP tool 归一成普通 `ToolDefinition` 走同一 permission/hook/result pipeline；capability discovery/diff 应成为 runtime 可解释能力，而不是 CLI/UI 临时拼字符串。

## 项目对比

| 项目 | Skills 模式 | MCP 模式 | Capability / Namespace 启发 | 证据强度 |
| --- | --- | --- | --- | --- |
| Claude Code | 多来源扫描，YAML frontmatter，项目/用户/策略目录，条件路径激活；技能可包含 prompt-time shell，但 MCP 来源禁用 shell 展开 | 支持 stdio/sse/ws/http，工具命名为 `mcp__server__tool`，描述截断，并发连接控制，认证缓存 | 内建优先、MCP 工具命名可解释、远程来源更严格 | Fact: `docs/research/source-analysis/claude-code-analysis/analysis/04c-skills-implementation.md`, `docs/research/source-analysis/claude-code-analysis/analysis/04d-mcp-implementation.md` |
| OpenCode | 扫描 `.opencode/skill(s)` 与 Claude skill 目录，解析 `name/description/location`，可按 agent 配置加载 | stdio MCP client，把 MCP tools 注册进 Tool Registry | 兼容 Claude 格式，MCP 作为普通 tool registry source | Fact: `docs/research/source-analysis/learn-opencode/docs/internals/skill.md`, `docs/research/source-analysis/learn-opencode/docs/internals/mcp-implementation.md` |
| Hermes Agent | 明确 progressive disclosure：`skills_list` 看元数据，`skill_view` 读完整正文；插件技能用 `plugin:skill` qualified name | stdio/http MCP，工具以 `server:tool` 登记，插件可注册 tool/hook/command/skill | 插件技能命名空间、`/reload-skills`、`/reload-mcp` 和动态 deregister/re-register 是 M6 reload 的近似参考 | Fact: `docs/research/source-analysis/hermes-wiki/concepts/skills-system-architecture.md`, `docs/research/source-analysis/hermes-wiki/concepts/mcp-and-plugins.md`, `docs/research/source-analysis/hermes-wiki/concepts/tool-registry-architecture.md` |
| DeerFlow | Skill 是目录 + `SKILL.md`；三层加载：name/description 常驻，正文按需，脚本/模板/引用执行时读取 | `extensions_config.json` 兼容 Claude Desktop MCP 配置；stdio/sse/http；配置 mtime 失效缓存 | 配置化启停、缓存失效、环境变量解析适合后续 M8，但 M6 可以先收窄到 stdio | Fact: `docs/research/source-analysis/deerflow-book/chapters/16-mcp-extensions.md`, `docs/research/source-analysis/deerflow-book/chapters/17-skills-system.md` |
| Guga 当前基线 | core 已有 plugin host、capability registry、permission/tool pipeline、hook kernel、durable store/replay contracts | 尚无 concrete MCP client | registry 已能 list/remove 多类能力，plugin host 已追踪 plugin contributions 并在 shutdown cleanup | Fact: `packages/core/README.md`, `packages/core/src/registry/capability-registry.ts`, `packages/core/src/plugin-host/plugin-host.ts` |

## 可借鉴模式

- Adopt: Skills 渐进加载。M6 应把 `SkillMetadata` 作为常驻 discovery 数据，把 `SkillBody` 作为显式加载动作，把 `assets/references/templates/scripts` 保持为执行期路径资源。Fact: DeerFlow 和 Hermes 都将 metadata 与 body 分层；Claude/OpenCode 也围绕 `SKILL.md` frontmatter 建模。
- Adopt: MCP tools 归一到普通 tool registry。模型不需要知道工具来自 local plugin 还是 MCP server；runtime 需要知道 `source=plugin|mcp|builtin` 以便权限、审计、UI 和 diff 可解释。Fact: Tool Registry Context Pack 总结 Claude/Hermes/OpenCode 都把 MCP 和本地工具合并为统一工具池。
- Adopt: 稳定 MCP 命名规则。优先采用 `mcp__server__tool`，它比 `server:tool` 更适合 function/tool name 约束，也和 Claude Code 事实标准一致。Fact: Claude MCP analysis；Inference: 对 Guga 的 provider/tool schema 更友好。
- Adopt: Capability owner tracking。Guga 的 `PluginHost` 已经记录 plugin contributions，M6 可以把这个变成正式 discovery/diff 的事实来源。Fact: `PluginContribution` 已记录 providers/models/tools/hooks/policies/stores。
- Adapt: Plugin reload。Hermes 的 `/reload-skills` 和 tool registry deregister/re-register 证明热重扫有价值；Guga M6 不必先做完整 marketplace reload，可以先实现 owner-scoped cleanup + reinitialize 或 runtime restart equivalent。Fact + Inference。
- Adapt: MCP transport。Claude/DeerFlow/Hermes 覆盖多传输，但 M6 应先 stdio。多传输带来 OAuth、session expiry、remote auth cache、IDE allowlist 等 M8/M11 级复杂度。Fact: 多项目已有多传输；Inference: Guga 当前最小闭环不需要。
- Adapt: Description and schema budgeting。Claude 截断 MCP tool description 以防 OpenAPI 生成器塞入 15-60KB 描述；Guga 应把 tool description/result budget 作为 MCP normalization 的计划项。Fact: Claude MCP analysis。

## 不建议照搬

- 不照搬 Claude Code 的完整 MCP 认证和四传输矩阵。M6 的目标是 capability ecosystem 最小闭环，不是远程 MCP 平台化。Evidence: Fact + Inference。
- 不让 skill body 全量进入 system prompt。OpenCode 的简单注入适合较小场景，但 Guga roadmap 明确要求上下文是投影，skills 应渐进披露。Evidence: Fact from roadmap and context pack; Inference for Guga.
- 不把 plugin skills 默认全部暴露进系统提示。Hermes 的插件技能 opt-in 设计能保护 prompt cache 和主提示大小；Guga 可以先让 discovery surface 可见，但 model context 只放 metadata 或由 context policy 决定。Evidence: Fact from Hermes; Inference for Guga.
- 不让 MCP tool 绕过 `ExecutionPipeline`。如果 MCP client 直接执行工具，permission/audit/replay 会分裂。Evidence: Fact from Guga core README; Inference from runtime boundary.
- 不把 reload 做成“只清 Map”。Guga 还需要 hooks、context policies、stores、plugin shutdown 和 stale context 失效，否则 old plugin handles 可能继续操作 runtime。Evidence: Fact from current `PluginHost.cleanupContributions`; Pending Verification: exact stale context guard implementation.

## Guga 落点

- Core contract additions should be minimal:
  - `SkillMetadata`, `SkillBody`, `SkillAssetRef`, and skill capability registration contract.
  - capability descriptor shape: `type`, `id/name`, `namespace`, `ownerPluginId`, `source`, `status`, `conflict`, `metadata`.
  - capability diff shape: `added`, `removed`, `changed`, `skippedConflicts`.
  - optional owner-scoped registry bookkeeping if current `PluginContribution` stays private to `PluginHost`.
- First-party plugin packages:
  - `packages/plugin-skills`: directory roots, frontmatter parser, metadata discovery, body loader, asset path resolver, invalid skill reporting.
  - `packages/plugin-mcp`: stdio server config, lifecycle, tool listing, name normalization, tool wrapper registration, shutdown cleanup, minimal test server fixture.
- Test priorities:
  - skill metadata discovery does not load body by default.
  - duplicate skill names produce deterministic conflict output.
  - MCP tool appears in discovery and executes through runtime `ToolDefinition`.
  - MCP/local collision is skipped or rejected with an explainable conflict.
  - plugin shutdown/reload removes old tools/skills/hooks/policies from discovery and `requireTool`.
- Planning question to resolve:
  - Whether M6 should expose discovery only as runtime API, or also add a small CLI/server command. Recommendation: runtime API first; CLI/host presentation belongs to M7/M11 unless a smoke demo is needed.

## 证据

- Fact: `docs/research/context-packs/tool-registry.md` identifies common patterns across Claude Code, Hermes, OpenCode, and DeerFlow: unified tool pools, MCP normalization, progressive skills loading, built-in priority, allow/ask/deny permissions, and fail-closed defaults.
- Fact: `docs/research/source-analysis/claude-code-analysis/analysis/04c-skills-implementation.md` documents Claude skill sources, frontmatter fields, path activation, and disabling shell expansion for MCP-sourced skills.
- Fact: `docs/research/source-analysis/claude-code-analysis/analysis/04d-mcp-implementation.md` documents `mcp__server__tool`, stdio/sse/ws/http transports, description truncation, connection concurrency, auth cache, and IDE allowlist.
- Fact: `docs/research/source-analysis/learn-opencode/docs/internals/skill.md` documents OpenCode skill scanning for `.opencode` and `.claude` formats with `name`, `description`, and `location`.
- Fact: `docs/research/source-analysis/learn-opencode/docs/internals/mcp-implementation.md` documents OpenCode stdio MCP client and registering MCP tools into its tool registry.
- Fact: `docs/research/source-analysis/hermes-wiki/concepts/skills-system-architecture.md` documents progressive disclosure, plugin skill qualified names, platform/prerequisite filters, and `/reload-skills`.
- Fact: `docs/research/source-analysis/deerflow-book/chapters/16-mcp-extensions.md` and `docs/research/source-analysis/deerflow-book/chapters/17-skills-system.md` document MCP config, enabled flags, env resolution, cache invalidation, and three-layer skills loading.
- Fact: `packages/core/README.md` says core owns contracts and runtime authority but excludes concrete skills, MCP, plugin manifest scanning, marketplace, reload, and stale context guard.
- Fact: `packages/core/src/registry/capability-registry.ts` already has maps and list/remove methods for providers, models, tools, context policies, event/session/artifact stores, and replay capabilities.
- Fact: `packages/core/src/plugin-host/plugin-host.ts` tracks plugin contributions and removes/restores them during shutdown.
- Inference: Guga can implement M6 with small core contract extensions plus first-party plugin packages, because the current plugin host and registry already contain most lifecycle mechanics.
- Pending Verification: exact MCP SDK dependency and test server fixture should be chosen during `ce-plan`, after checking current TypeScript runtime compatibility and dependency policy.
