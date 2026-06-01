---
date: 2026-05-28
topic: guga-home-config-session-memory
---

# Guga Home Config Session Memory Requirements

## Summary

Guga 需要把用户级模型配置、历史会话、artifact 和长期记忆统一收敛到默认 `~/.guga` 本地工作区，并通过现有 plugin/profile/bundle 边界接入 CLI 和 host runtime。第一版采用用户级 Guga Home + project 分区：配置和全局 memory 在用户 home，session/artifact 按项目隔离；历史会话作为可恢复的 append-only JSONL 事实源，长期 memory 作为受治理 projection，自动 memory extraction、远端同步和完整 profile 生命周期后置。

---

## Problem Frame

Guga 已经具备 provider bridge、code profile、CLI workbench、JSONL session store、filesystem artifact store 和 memory governance store，但这些能力目前更像独立 package 能力：host 可以传 `rootDir`，CLI 可以读配置文件，memory 可以写 JSONL，却还没有一个产品化默认 home 把它们组织成“用户安装后自然可用”的本地 agent 工作区。

参考项目给出了清晰信号：Claude Code 把会话做成 append-only transcript，并把 resume 设计成日志加载、metadata 恢复和链路修复流程；Pi 把历史会话保存为带 `id` / `parentId` 的 JSONL 树，支持在同一文件内分支、fork/clone 到新文件、通过 `session_info` 和 header 做轻量列表；OpenCode 把 session 作为服务端事实源，包含 session metadata、part system、状态机和子会话关系。Guga 当前的问题不是缺少底层持久化原语，而是缺少默认路径、配置合并、历史会话语义、隐私边界和用户可观察性的产品约定。

---

## Actors

- A1. Guga CLI 用户：在任意项目里运行 `guga`，希望模型配置、历史会话和长期状态能自动复用。
- A2. CLI / workbench host：负责解析配置、选择模型/profile，并把默认 storage roots 注入 runtime。
- A3. Guga runtime / plugin system：通过 first-party plugins 接入 session、artifact 和 memory stores，不把持久化逻辑写回 core。
- A4. 插件和宿主开发者：需要清晰知道默认路径规则，同时仍能覆盖 rootDir 或替换 store 实现。
- A5. 后续 planning / implementation agent：需要从本文档进入实现，不再重新决定用户 home、session 与 memory 的产品边界。

---

## Key Flows

- F1. 用户级配置解析
  - **Trigger:** 用户在项目中运行 `guga`、`guga run` 或 workbench 内模型相关命令。
  - **Actors:** A1, A2
  - **Steps:** CLI 解析 Guga Home；读取用户配置、项目配置、显式配置和环境变量；合并模型 aliases 与默认 profile；输出当前使用的 model/profile/config source。
  - **Outcome:** 用户无需每次传 provider/model flags，也能知道当前配置来自哪里。
  - **Covered by:** R1, R2, R3, R4, R5, R6, R7

- F2. 默认持久化一个会话
  - **Trigger:** CLI host 创建 session 并开始 run。
  - **Actors:** A1, A2, A3
  - **Steps:** Host 解析当前项目的安全 project key；把 session/event store 指向 Guga Home 下的项目分区；runtime 通过 JSONL store 追加 session/event facts；每条可恢复 entry 带稳定 id、父子关系或等价 lineage；metadata、compaction、branch/fork facts 作为事件追加；artifact store 保存大内容引用。
  - **Outcome:** 会话和 artifact 不再只停留在内存里，也不会默认写进仓库目录；历史会话可以轻量列出、恢复、分支，并为长期 memory 提供事实源。
  - **Covered by:** R8, R9, R10, R11, R12, R13, R14, R15, R16

- F3. 读取或治理长期 memory
  - **Trigger:** 用户、host 或 memory capability 请求 review、health、retrieval 或 curated markdown。
  - **Actors:** A1, A2, A3
  - **Steps:** Host 将 memory JSONL store 指向用户级 memory root；memory capability 读取 candidate/decision ledger；生成 review/health/retrieval/curated projection；不自动把 transcript 写成长期记忆。
  - **Outcome:** memory 成为受治理的 projection，而不是未审计的聊天历史副本。
  - **Covered by:** R17, R18, R19, R20

- F4. 诊断当前 Guga Home 状态
  - **Trigger:** 用户运行 status/config/model 相关命令，或 workbench startup/status 需要展示运行状态。
  - **Actors:** A1, A2
  - **Steps:** CLI 展示 resolved Guga Home、config source stack、selected model、session root、artifact root、memory root 和关键隐私提醒。
  - **Outcome:** 用户能定位配置和本地状态，减少“模型为什么不是这个”“历史存在哪里”的不透明感。
  - **Covered by:** R21, R22, R23

---

## Requirements

**Guga Home and configuration**

- R1. Guga 必须定义统一的 Guga Home：默认是当前用户的 `~/.guga`，并允许通过 `GUGA_HOME` 覆盖。
- R2. CLI 必须优先支持用户级 `~/.guga/config.toml` 和项目级 `.guga/config.toml`，把 TOML 作为用户手写配置的默认格式。
- R3. 配置加载必须从 first-hit 语义升级为多层合并：内置默认值、用户配置、项目配置、显式配置、环境变量和 CLI 参数按优先级叠加。
- R4. 模型配置必须支持 aliases、默认模型、provider id、provider mode、provider model id、API key env、base URL 和 TOML 注释。
- R5. Project config 可以覆盖或补充用户 config，但不应因为项目配置存在就完全屏蔽用户模型 aliases。
- R6. 第一版必须优先推荐通过环境变量引用 API key；若配置文件支持明文 key，文档必须明确提示风险。
- R7. `guga --list-models` 和 workbench `/models` 必须基于合并后的 TOML 配置展示模型 aliases。

**Default local storage**

- R8. CLI host 创建 runtime 时，默认必须接入用户级 JSONL session/event store。
- R9. CLI host 创建 runtime 时，默认必须接入用户级 filesystem artifact store。
- R10. Session 和 artifact 默认必须按当前项目分区，避免不同仓库的历史和大内容混杂。
- R11. Project 分区键必须稳定、路径安全，并能防止路径穿越。
- R12. 默认 session/artifact 存储不应写进项目目录，除非用户或宿主显式配置 project-local store。
- R13. 历史会话必须以 append-only JSONL 或等价事件日志作为事实源，不以可变的内存消息数组作为唯一持久化形态。
- R14. Session entry 必须携带稳定 id、时间戳和父子关系或等价 lineage，以支持 resume 修复、分支、fork/clone 和未来 session search。
- R15. Session metadata（例如 title、summary、label、model/profile、cwd/project key、token/cost stats、active leaf 或 fork parent）必须作为可轻量读取的持久化信息保存，避免 session 列表需要全量解析大 transcript。
- R16. Compaction summary、branch summary、model/profile change、tool/error facts 必须作为历史事件追加，而不是覆盖原 transcript；历史会话恢复应从这些事件重建可继续运行的上下文。

**Memory boundary**

- R17. CLI host 创建 runtime 时，默认应接入用户级 memory JSONL store 或等价 first-party memory capability root。
- R18. 长期 memory 必须保持受治理：candidate、decision、review、health、retrieval 和 curated projection 与 session transcript 区分。
- R19. 第一版不得默认从每个会话自动抽取长期 memory。
- R20. 第一版不得默认把长期 memory 自动注入模型上下文；retrieval / projection 应保持显式 capability 或后续 context policy 决策。

**Observability and safety**

- R21. CLI startup、status 或 config diagnostic surface 必须能展示 resolved Guga Home、config source、selected model、session root、artifact root 和 memory root。
- R22. Invalid config TOML、缺失显式配置文件、非法 project key、store 读取异常都必须给出可操作诊断。
- R23. 用户级 `.guga` 中的 session、artifact 和 memory 默认必须被视为敏感本地状态；文档必须说明隐私和提交风险。

**Architecture boundaries**

- R24. `packages/core` 不得依赖 CLI 或 first-party storage plugins 来获得默认 Guga Home。
- R25. First-party storage plugins 必须继续接受 host-provided rootDir，保持可测试、可替换和 third-party host 可复用。
- R26. 完整 named profile 生命周期可以预留路径和概念，但不得成为本任务的 MVP 完成条件。

---

## Acceptance Examples

- AE1. **Covers R1, R2, R3, R4, R5.** Given 用户级 `config.toml` 中定义了 `sonnet` 和 `fast` 两个模型 aliases，项目 `config.toml` 只覆盖 `sonnet` 的 provider model id，when 用户运行 `guga --list-models`，then 输出仍包含 `fast`，并显示 `sonnet` 使用项目覆盖后的配置。
- AE2. **Covers R1, R8, R9, R10, R12.** Given `GUGA_HOME` 未设置，when 用户在某个仓库运行交互式 `guga` 并创建 session，then session/event 和 artifact 写入用户级 Guga Home 的项目分区，而不是默认写进仓库 `.guga`。
- AE3. **Covers R13, R14, R16.** Given 用户从历史 turn 分支继续，when 新消息被追加，then 原始 entry 不被改写，新 entry 记录父子关系或等价 lineage，active leaf/branch summary 可用于恢复当前分支上下文。
- AE4. **Covers R15, R21.** Given Guga Home 中存在一个很大的历史会话，when 用户列出可恢复 session，then CLI 可以通过 header、tail metadata 或 session_info projection 获取 title、cwd、mtime、model/profile 和 token stats，而不需要全量解析 transcript。
- AE5. **Covers R1, R8, R9, R17.** Given `GUGA_HOME` 指向一个临时目录，when CLI host 创建 runtime，then session store、artifact store 和 memory store 都使用该覆盖目录派生出的 roots。
- AE6. **Covers R18, R19, R20.** Given 一个会话产生了多轮 transcript，when 用户读取 memory review 或 curated memory，then 系统只读取受治理的 memory ledger/projection，不把原始 transcript 自动当作长期 memory。
- AE7. **Covers R21, R22, R23.** Given 项目配置 TOML 无效，when 用户启动 CLI，then CLI 报告具体配置来源和可修复错误，不静默回退到其他配置，也不暴露 API key 值。
- AE8. **Covers R24, R25.** Given third-party host 自己配置 storage roots，when 它创建 runtime，then first-party storage plugins 仍可通过 host-provided rootDir 工作，不依赖 CLI 的默认 Guga Home resolver。

---

## Success Criteria

- 用户可以只配置一次用户级 `~/.guga/config.toml`，之后在不同项目中复用模型 aliases 和默认 profile。
- 用户能清楚知道 Guga 的配置、历史会话、artifact 和长期 memory 默认存在哪里。
- CLI 的真实会话默认具备可恢复、可分支、可轻量列出的事实底座，不再只是内存态演示。
- Session transcript 与长期 memory 的产品边界清楚，后续 memory planning 不需要重新决定“历史是否自动成为记忆”。
- `ce-plan` 可以直接规划 path resolver、config merge、host factory wiring、store roots、session metadata/lineage、diagnostics 和 tests，不需要重新调研 Claude Code/Pi/OpenCode/Hermes 的产品边界。

---

## Scope Boundaries

- 不做自动 memory extraction。
- 不做默认 memory prompt injection。
- 不做 SQLite、FTS、vector DB、graph DB 或远端同步。
- 不做完整历史会话全文搜索；MVP 只要求可恢复、可列出和保留未来 search projection 的元数据。
- 不做自动把历史会话摘要写入长期 memory；compaction/branch summary 仍属于 session history。
- 不做完整 profile lifecycle，例如 create、clone、export、import、delete。
- 不做多 writer conflict resolution、team sync 或跨设备同步。
- 不迁移已有项目 `.guga` 数据，除非 planning 发现低风险兼容 shim。
- 不把 project-local `.guga` 作为默认 session/artifact 存储位置。
- 不让 `packages/core` 依赖 CLI 默认路径解析或 first-party storage plugins。

---

## Key Decisions

- 采用用户级 Guga Home 作为默认工作区：它更接近 Claude Code、OpenCode、Hermes 的 local-first 产品形态，也降低把敏感 transcript 写进仓库的风险。
- Session/artifact 按 project 分区：既避免跨项目混杂，又保留用户级全局状态的可管理性。
- Session history 采用 Claude Code 式 append-only 可靠写入 + Pi 式 lineage/tree 语义 + OpenCode 式 host projection：底层写入简单、恢复层强健、UI/CLI 不直接依赖裸文件细节。
- Memory 采用 governed projection，而不是 transcript 副本：这延续 M15-M25 的 memory governance 路线，避免把历史聊天自动污染长期记忆。
- Config 采用 TOML 并从 first-hit 升级为 layered merge：TOML 更适合用户手写、注释和分区，layered merge 让用户级模型 aliases 和项目级覆盖可以共存。
- Named profiles 先预留不产品化：Hermes 的完整 profile 隔离有价值，但第一版把 home/config/session/memory 默认路径打牢更高杠杆。

---

## Dependencies / Assumptions

- 依赖已有 CLI 配置入口：`packages/cli/src/config.ts`、`packages/cli/src/config.test.ts`。
- 依赖已有 CLI host factory：`packages/cli/src/host-factory.ts`。
- 依赖已有 session store plugin：`packages/plugin-session-jsonl`。
- 依赖已有 artifact store plugin：`packages/plugin-artifact-filesystem`。
- 依赖已有 memory JSONL 和 governance 能力：`packages/plugin-memory-jsonl`、`packages/plugin-memory-candidates`。
- 假设 first-party plugins 继续由 host 注入 rootDir，而不是反向读取 CLI 全局状态。
- 假设 project 分区键的具体生成策略由 planning 决定，但必须满足稳定、可读、路径安全。
- 假设现有 `plugin-session-jsonl` 可以演进出 entry metadata、lineage、active leaf 或等价 projection；若现有 `events/` + `sessions/` 双文件布局保留，必须明确哪个文件是 append-only 事实源、哪个是索引/projection。
- 假设现有 JSON config 兼容策略由 planning 决定；本文档只确立新用户手写配置的默认格式是 TOML。

---

## Outstanding Questions

### Deferred to Planning

- [Affects R3, R5][Technical] Config merge 的对象字段要采用多深的 merge，`models` 之外的数组字段是否 concat、replace 还是按 id merge？
- [Affects R2, R3][Technical] 现有 `.guga/config.json` 和 `~/.guga/config.json` 应作为 legacy fallback 继续读取、一次性迁移，还是在下一个里程碑后移除？
- [Affects R10, R11][Technical] Project key 具体采用 git root、cwd、package name、hash 或组合策略，才能兼顾可读性、稳定性和路径安全？
- [Affects R13, R14, R15][Technical] Session 历史采用单文件 Pi-style tree JSONL，还是保留现有 `events/` + `sessions/` projection 并在事件层表达 lineage/active leaf？
- [Affects R15, R21][Technical] 轻量 session list metadata 采用 Claude Code tail re-append、Pi `session_info` entry、旁路 index 文件，还是组合策略？
- [Affects R17, R18][Technical] Memory JSONL plugin 当前 operation registration 与 `JsonlMemoryStore` rootDir 如何通过 host wiring 收敛成默认用户级能力？
- [Affects R21][Technical] Guga Home 状态应优先出现在 startup screen、`/status`、`guga config doctor`，还是先复用现有 config source display？
- [Affects R26][Technical] MVP 是否创建空的 `profiles/default` 作为未来预留，还是只保留 `profiles/` 目录和文档说明？

---

## Research References

- `docs/research/source-analysis/claude-code-analysis/analysis/04i-session-storage-resume.md`: `Fact`，Claude Code 使用 append-only JSONL transcript，并把 resume 复杂性放在恢复层。
- `docs/research/source-analysis/claude-code-analysis/analysis/04-agent-memory.md`: `Fact`，Claude Code 区分 transcript、Auto Memory、Session Memory、Agent Memory 和 Team Memory。
- `docs/research/repomix/pi-token-tree.txt`: `Fact`，Pi 研究材料定位到 session format、sessions docs、session manager、JSONL storage 和 branching tests。
- `docs/research/repomix/pi-focused-context.xml`: `Fact`，Pi 将历史会话保存为 `~/.pi/agent/sessions/` 下按 cwd 分区的 JSONL 文件，entry 带 `id` / `parentId`，支持 branch、fork/clone、compaction、branch summary 和 `session_info` metadata。
- `docs/research/source-analysis/learn-opencode/docs/internals/config.md`: `Fact`，OpenCode 采用多层配置，覆盖 provider、agent、permission、MCP、plugins 等产品面。
- `docs/research/source-analysis/learn-opencode/docs/internals/session.md`: `Fact`，OpenCode session 层管理生命周期、消息、工具调用、上下文压缩和状态持久化。
- `docs/research/source-analysis/hermes-wiki/concepts/configuration-and-profiles.md`: `Fact`，Hermes 用 home resolver 和 profiles 隔离 config、memory、sessions、skills、logs 等状态。
- `docs/research/source-analysis/hermes-wiki/concepts/session-search-and-sessiondb.md`: `Fact + Inference`，Hermes 把 session search 作为历史投影，与长期 memory 区分。
- `docs/brainstorms/2026-05-27-m5-session-store-replay-plugins-requirements.md`: `Fact`，Guga 已将 durable session/event/artifact/replay 定义为 memory-ready substrate。
- `docs/brainstorms/2026-05-28-m17-memory-jsonl-store-requirements.md`: `Fact`，Guga 已有 local-first memory JSONL store，且明确不做自动 extraction/retrieval/prompt injection。
- `docs/brainstorms/2026-05-28-m37-productized-cli-workbench-requirements.md`: `Fact`，Guga CLI 已有产品化 workbench、config/model/profile 方向。
