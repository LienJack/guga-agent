# Guga Home Config Session Memory

## Goal

把 Guga 的模型配置、历史会话、artifact 和长期记忆统一收敛到用户目录下的 `~/.guga`，形成一个清晰、可恢复、可审计、默认可用的本地工作区。这个能力要延续当前 Guga 的 plugin/profile/bundle 架构：配置和默认路径由 CLI/host 负责解析，session、artifact、memory 继续通过 first-party plugin 接入，而不是把持久化逻辑塞回 core。历史会话要被建模为可恢复的 append-only JSONL 事实源；长期记忆则是从事实源或用户输入中受治理地产生的 projection，不能把两者混为一谈。

## What I already know

- 用户明确希望参考 Claude Code、Pi、OpenCode 等工具，在用户目录生成 `.guga` 文件夹，存放模型配置、过去历史会话和配置文件。
- Claude Code 的历史会话核心是 append-only JSONL transcript，metadata 会持久化并可重挂到尾部；resume 是“读取日志、恢复 metadata、修复链路、接管运行时”的恢复流水线。
- Pi 的历史会话核心是 `~/.pi/agent/sessions/` 下按工作目录分区的 JSONL 文件，entry 带 `id` / `parentId`，支持同文件分支、fork/clone 新文件、compaction、branch summary 和 `session_info` metadata。
- OpenCode 的 session 层包含 session metadata、part system、状态机、子会话关系和持久化，UI/客户端通过服务端事实源投影同步。
- Guga 当前已经有 CLI 配置加载：`GUGA_CONFIG`、项目 `.guga/config.json`、用户 `~/.guga/config.json`、环境变量覆盖和 model aliases；新需求将用户手写配置默认格式切到 TOML。
- 当前 CLI config loader 是 first-hit 语义：找到 `GUGA_CONFIG`、项目配置或用户配置中的第一个就返回；它还不是 OpenCode 风格的多层合并。
- Guga 已有 `@guga-agent/plugin-session-jsonl`，可在 host 提供的 `rootDir` 下写 append-only session/event JSONL。
- Guga 已有 `@guga-agent/plugin-artifact-filesystem`，可在 host 提供的 `rootDir` 下保存 artifact 内容和 manifest。
- Guga 已有 `@guga-agent/plugin-memory-jsonl` 和 memory governance/review/retrieval/curated markdown 相关能力，但当前不是默认用户级 Guga Home 的一部分。
- Guga CLI host factory 已经集中处理 profile、model、provider plugin，是接入默认 `~/.guga` storage plugins 的自然位置。
- M5 requirements 已经把 session/event/artifact/replay 定义为 memory-ready substrate；M17-M25 已经把 memory JSONL、review、health、retrieval、curated markdown 打成独立能力。

## Requirements

- Guga 必须定义统一的 Guga Home 路径解析规则：默认 `~/.guga`，可通过 `GUGA_HOME` 覆盖。
- Guga Home 必须成为 CLI 默认用户级状态根目录，用于用户配置、session、artifact、memory、cache 和 logs。
- 配置文件必须优先支持用户级 `~/.guga/config.toml` 和项目级 `.guga/config.toml`，把 TOML 作为用户手写配置的默认格式。
- 配置加载应从 first-hit 逐步升级为多层合并：内置默认值 < 用户配置 < 项目配置 < `GUGA_CONFIG` < 环境变量 < CLI 参数。
- 模型配置必须支持 aliases、默认模型、provider id、provider mode、provider model id、API key env、base URL。
- 第一版应默认推荐 `apiKeyEnv`，不鼓励把 API key 明文写进 `config.toml`。
- CLI host 创建 runtime 时应默认接入用户级 JSONL session store、filesystem artifact store 和 memory JSONL store。
- Session 和 artifact 默认应按 project key 分区，避免不同仓库的历史互相混杂，同时避免把隐私历史写进项目目录。
- Project key 必须稳定、可读、路径安全；同一个仓库在同一机器上应解析到同一分区。
- 历史 session store 必须支持 append-only event/transcript 写入；entry 应带稳定 id、时间戳和父子关系或等价 lineage，以支持 resume、branch、fork/clone 和未来 search projection。
- Session metadata 必须可轻量读取，例如 title、summary/label、cwd/project key、model/profile、token/cost stats、active leaf、fork parent；session 列表不应为了展示基础信息而全量解析大 transcript。
- Compaction summary、branch summary、model/profile change、tool/error facts 必须作为历史事件追加，而不是覆盖原 transcript。
- 长期 memory 不应等同于历史 transcript；session 历史是事实源，memory 是经 candidate/decision/governance 后生成的受治理 projection。
- 第一版不做自动 memory extraction 或自动 prompt injection；只把用户级 memory store 默认接入并提供 review/retrieval/curated projection 的可用路径。
- CLI 应提供最小可观测命令或输出，让用户知道当前使用的 Guga Home、config source、session store path 和 memory path。
- 权限和隐私边界必须明确：用户级 `.guga` 中的 session、artifact、memory 默认视为敏感本地状态。

## Acceptance Criteria

- [ ] `GUGA_HOME` 未设置时，CLI 默认解析 Guga Home 为当前用户的 `~/.guga`。
- [ ] `GUGA_HOME` 设置时，CLI、host factory 和默认 storage plugins 全部使用覆盖后的 home。
- [ ] `~/.guga/config.toml` 可以定义 `models`、`defaultModel`、`defaultProfile`、storage/memory 相关配置。
- [ ] 项目 `.guga/config.toml` 可以覆盖或补充用户级配置，而不是完全屏蔽用户级配置。
- [ ] `GUGA_CONFIG` 指向显式配置文件时可以覆盖用户和项目配置。
- [ ] 环境变量 `GUGA_MODEL`、`GUGA_PROVIDER`、`GUGA_PROVIDER_MODE`、`GUGA_BASE_URL`、`GUGA_API_KEY` 继续具有最高运行时覆盖优先级。
- [ ] `guga --list-models` 和 workbench `/models` 能展示合并后的模型 aliases。
- [ ] 默认 CLI host 创建 session 后，会在用户级 Guga Home 下产生 session/event JSONL，而不是只留在内存中。
- [ ] Session/event JSONL 可以表达 entry id、lineage 或 active leaf 等恢复所需信息；从历史 turn 分支继续时不改写原始 entry。
- [ ] Session 列表可以通过 header、tail metadata、`session_info` projection 或 index 获取基础 metadata，不要求全量解析 transcript。
- [ ] Artifact store 默认写入用户级 Guga Home 的 project 分区。
- [ ] Memory JSONL store 默认写入用户级 Guga Home 的 memory 分区，并能读取 review/health/curated markdown。
- [ ] Tests 覆盖 config merge、home override、project key path safety、default plugin rootDir、invalid TOML error、session lineage/metadata、memory partial-tail diagnostics。
- [ ] README 或 docs 更新，说明 `~/.guga` 目录结构、配置优先级、API key 推荐写法、session/memory 区别。

## Definition of Done

- Tests added/updated for config, path resolution, host factory plugin wiring, and default store roots.
- Lint/typecheck/test/build pass for touched packages.
- CLI README updated with `~/.guga` directory layout and config example.
- No core dependency inversion: core must not depend on CLI or first-party storage plugins.
- Security/privacy notes cover local sensitive files and secret handling.

## Technical Approach

### Recommended direction: User Guga Home + project partitions

Use `~/.guga` as the default user-level home, then partition runtime state by project key for session/artifacts while keeping config and global memory at the home level.

Suggested layout:

```text
~/.guga/
  config.toml
  state.json
  sessions/
    projects/<project-key>/
      events/
      sessions/
      index.json
  artifacts/
    projects/<project-key>/
      content/
      manifests/
  memory/
    memory.jsonl
    curated/
      MEMORY.md
  cache/
    models/
  logs/
  profiles/
    default/
```

Suggested config shape:

```toml
default_model = "sonnet"
default_profile = "code"

[[models]]
id = "sonnet"
label = "Claude Sonnet"
provider_id = "ai-sdk"
provider_mode = "anthropic"
model_id = "claude-sonnet-4-5"
api_key_env = "ANTHROPIC_API_KEY"

[storage]
root = "~/.guga"
project_scope = "by-project-key"

[memory]
enabled = true
auto_write = false
```

### Config merge semantics

- Scalars: higher-priority config overrides lower-priority config.
- Objects: shallow/deep merge by section, keeping existing local style simple.
- `models`: merge TOML array-of-tables by `id`; project config can override a user model with the same `id`, or add project-specific aliases.
- Environment variables override the resolved file config.
- CLI flags override environment-derived config where command parsing supports them.

### Storage semantics

- Session/event store remains append-only JSONL through `createJsonlSessionPlugin`.
- Session history should evolve from “durable events exist” into a recoverable history substrate:
  - entries carry stable ids and parent/lineage information or an equivalent active-leaf projection;
  - metadata is persisted as events or an index projection for cheap session listing;
  - compaction and branch summaries are additive events, not transcript rewrites;
  - fork/clone creates a new session with a parent pointer or copied active path, while in-place branching preserves all entries.
- Artifact store remains filesystem-backed through `createFilesystemArtifactPlugin`.
- Memory store remains governed JSONL through `JsonlMemoryStore` and the memory JSONL plugin operations.
- CLI/host factory owns default root selection; plugins remain reusable for tests and third-party hosts that pass their own `rootDir`.

## Decision (ADR-lite)

**Context:** Guga already has the right primitives: config loader, AI SDK provider plugin, code profile, JSONL session store, filesystem artifact store, and memory governance store. What is missing is a productized default home that makes these primitives behave like a real local coding agent rather than isolated package demos.

**Decision:** Adopt `~/.guga` as the default user-level Guga Home, with `GUGA_HOME` override and project-key partitions for session/artifact state. Use TOML as the default user/project config format and upgrade config loading toward OpenCode-style layered merge. Keep session history, artifact content, and long-term memory as separate stores connected through host/runtime plugins. For historical sessions, combine Claude Code's append-only durability, Pi's tree/lineage semantics, and OpenCode's host-owned projection model.

**Consequences:** This gives users a predictable place to configure models and inspect durable state, while preserving Guga's plugin boundaries. The main trade-off is that path resolution and config merge become shared infrastructure, so they need focused tests and clear docs. Full Hermes-style named profiles, remote sync, SQLite FTS, vector memory, and automatic memory extraction should remain deferred.

## Research Notes

### What similar tools do

- Claude Code persists session history as append-only JSONL transcript logs, then makes resume responsible for repairing and reconstructing usable conversation state.
- Claude Code separates durable transcript, session memory, auto memory, and agent memory instead of treating all history as one memory blob.
- Pi persists sessions as JSONL files under `~/.pi/agent/sessions/`, partitioned by working directory. The session file format has a header and typed entries; v2/v3 entries carry `id` and `parentId`, enabling branching without rewriting existing history.
- Pi supports `/resume`, `/tree`, `/fork`, and `/clone`: in-place branch navigation keeps all history in one file, while fork/clone produce new session files with parent/copy semantics. `session_info` and labels provide metadata for listing and naming sessions.
- OpenCode uses a layered configuration system with global config, project config, directory config, environment content, and CLI override; provider, agent, permission, MCP, commands, and plugins are config-addressable surfaces.
- OpenCode sessions are not just message arrays: session info includes project/directory, parent session, title, version, timestamps, permission ruleset, revert metadata, state, and message parts.
- Hermes uses a single home resolver (`HERMES_HOME`) so config, memories, sessions, skills, logs, cron, gateway, and profiles all relocate together.

### Constraints from our repo/project

- `packages/cli/src/config.ts` already supports `GUGA_CONFIG`, project `.guga/config.json`, user `~/.guga/config.json`, env overrides, and model aliases; planning should adapt this surface to TOML-first config.
- `packages/cli/src/config.ts` currently returns the first matching config file rather than merging user and project config.
- `packages/cli/src/host-factory.ts` already centralizes profile selection and provider plugin wiring.
- `packages/plugin-session-jsonl` already accepts a host-provided `rootDir`.
- Existing session storage may need an additive schema/projection upgrade for lineage, active leaf, metadata, fork parent and cheap listing. This should be planned as an evolution of the plugin boundary, not a core dependency.
- `packages/plugin-artifact-filesystem` already accepts a host-provided `rootDir`.
- `packages/plugin-memory-jsonl` already provides JSONL-backed memory records and diagnostics.
- Existing roadmap and brainstorm docs place durable session replay before full automatic memory.

### Feasible approaches here

**Approach A: User Guga Home + project partitions** (Recommended)

- How it works: Default to `~/.guga`, use project keys under `sessions/projects/` and `artifacts/projects/`, keep `config.toml` and global memory at the home level.
- Pros: Local-first, predictable, private by default, reuses existing plugins, avoids polluting repos, aligns with Claude/Pi/OpenCode/Hermes patterns.
- Cons: Requires project key logic, config merge tests, and a deliberate session metadata/lineage projection.

**Approach B: Project-local `.guga` first**

- How it works: Continue making project `.guga` the primary root for config, sessions, artifacts, and memory.
- Pros: Easy to inspect next to the codebase; current docs/examples already mention `.guga/sessions`.
- Cons: High risk of accidentally writing private transcript/artifacts into repos; cross-project user preferences and memory become fragmented.

**Approach C: Profile-isolated home from day one**

- How it works: Make `~/.guga/profiles/<name>` the true root for config, session, artifact, memory, skills, logs, and cache.
- Pros: Strong isolation for different personas/workflows; close to Hermes.
- Cons: Too much first-version surface area; profile lifecycle, clone/import/export/delete semantics would distract from the core storage default.

## Expansion Sweep

### Future evolution

- Named profiles can later promote `profiles/default/` into full Hermes-style isolated homes without changing the top-level home resolver.
- Search can later be added as a projection over session JSONL, for example SQLite FTS or semantic search, without replacing the append-only event source.
- Branch-aware resume can start with minimal lineage and active leaf support, then grow toward Pi-style tree navigation once the CLI has a richer session picker.

### Related scenarios

- `guga --list-models`, `/models`, `/model`, `/profile`, `/status`, and future `guga config doctor` should all report the same resolved config and home state.
- Future desktop/web hosts should consume the same host/runtime storage roots rather than inventing a separate app data directory.

### Failure and edge cases

- Invalid config TOML must remain actionable and point to the file path.
- Project key generation must prevent path traversal and handle renamed/moved folders predictably.
- Partial or corrupt JSONL must report diagnostics rather than silently dropping history or memory.
- Session resume must tolerate partial final lines, interrupted tool calls, stale metadata, and incompatible non-persistable dependencies by reporting actionable recovery diagnostics.
- API keys should prefer environment variables; if explicit keys are supported in config, docs must flag the risk.

## Out of Scope

- No automatic memory extraction from every turn.
- No automatic memory prompt injection beyond existing governed memory retrieval/projection surfaces.
- No SQLite, vector DB, graph DB, or remote sync in this task.
- No full historical session search in the MVP; only metadata/list/resume semantics needed for a future search projection.
- No complete Pi-style visual tree navigator in the MVP; persist the facts needed to add it later.
- No complete named profile lifecycle (`create`, `clone`, `export`, `import`, `delete`) in the MVP.
- No multi-writer conflict resolution or team sync.
- No migration of existing project `.guga` data unless planning identifies a low-risk compatibility shim.
- No changes that make `packages/core` depend on CLI or first-party storage plugins.

## Implementation Plan

### PR1: Guga Home path resolver and config merge

- Add a small resolver for `GUGA_HOME`, default home, project key, and standard child paths.
- Upgrade config loading from first-hit to layered merge.
- Add tests for merge order, model alias merge by `id`, env overrides, invalid TOML, legacy JSON behavior, and `GUGA_HOME`.

### PR2: Default storage plugin wiring

- Extend CLI host factory to resolve Guga Home and pass default roots to session, artifact, and memory plugins.
- Preserve test/mock override paths so package tests can still use temp dirs.
- Add integration tests that a CLI-created session writes to the expected user-home project partition.

### PR3: Session metadata and lineage semantics

- Extend or wrap the session JSONL plugin so persisted entries include stable ids, parent/lineage or active-leaf facts, and metadata events/projection.
- Add tests for branch/fork lineage, metadata listing without full transcript parse, compaction/branch summary append behavior, and partial/corrupt JSONL recovery diagnostics.
- Keep artifacts as references rather than inlining large content into transcript entries.

### PR4: CLI visibility and docs

- Add or update CLI status/config output to show resolved home, config source stack, selected model, session root, artifact root, and memory root.
- Update CLI README with `~/.guga` layout and config examples.
- Add smoke instructions for mock and real-provider paths.

### PR5: Memory review path

- Ensure memory JSONL review/health/curated markdown can operate against the default Guga Home memory root.
- Document the distinction between session transcript and governed memory.
- Add tests for partial-tail and corrupt memory diagnostics using the default root resolver.

## Open Questions

- Should the MVP create `~/.guga/profiles/default/` immediately as a reserved structure, or keep `profiles/` empty until named profiles are implemented?
- Should Guga move toward Pi-style one session file per conversation tree, or keep the current `events/` + `sessions/` split and define the latter as metadata/projection?
- Should lightweight session listing prefer Claude-style tail metadata re-append, Pi-style `session_info` entries, an explicit `index.json`, or a hybrid?

## Technical Notes

- Relevant code: `packages/cli/src/config.ts`, `packages/cli/src/config.test.ts`, `packages/cli/src/host-factory.ts`, `packages/cli/src/commands/run.ts`.
- Relevant store plugins: `packages/plugin-session-jsonl`, `packages/plugin-artifact-filesystem`, `packages/plugin-memory-jsonl`.
- Relevant requirements docs: `docs/brainstorms/2026-05-27-m5-session-store-replay-plugins-requirements.md`, `docs/brainstorms/2026-05-28-m17-memory-jsonl-store-requirements.md`, `docs/brainstorms/2026-05-28-m37-productized-cli-workbench-requirements.md`.
- Reference research: `docs/research/source-analysis/claude-code-analysis/analysis/04i-session-storage-resume.md`, `docs/research/source-analysis/claude-code-analysis/analysis/04-agent-memory.md`, `docs/research/repomix/pi-token-tree.txt`, `docs/research/repomix/pi-focused-context.xml`, `docs/research/source-analysis/learn-opencode/docs/internals/config.md`, `docs/research/source-analysis/learn-opencode/docs/internals/session.md`, `docs/research/source-analysis/hermes-wiki/concepts/configuration-and-profiles.md`, `docs/research/source-analysis/hermes-wiki/concepts/session-search-and-sessiondb.md`.
- Spec context to include for implementation/check: `.trellis/spec/backend/index.md`, `.trellis/spec/backend/directory-structure.md`, `.trellis/spec/backend/error-handling.md`, `.trellis/spec/backend/quality-guidelines.md`, `.trellis/spec/guides/cross-layer-thinking-guide.md`, `.trellis/spec/guides/code-reuse-thinking-guide.md`, `.trellis/spec/guides/agent-reference-projects-guide.md`.
