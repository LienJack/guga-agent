# CC Switch Core Management Context Pack

## 问题边界

本包用于后续研究 Guga Agent 的本地 AI CLI 管理能力，重点覆盖：

- 多应用 provider 配置管理与一键切换。
- MCP / Prompts / Skills 的统一 SSOT 与同步。
- 本地 proxy、格式转换、故障转移与健康状态。
- Codex / Claude Code / Gemini / OpenCode / OpenClaw / Hermes 会话扫描与恢复。
- Tauri 桌面应用的 Commands -> Services -> Database / file adapters 分层。

本包不覆盖 CC Switch 的 UI 视觉实现、发行流程、赞助商内容、截图资产和完整用户手册。

## 参考项目与版本

| 项目 | 本地路径 | Commit | Repomix | Graphify |
| --- | --- | --- | --- | --- |
| `cc-switch` | `/Users/lienli/Documents/GitHub/agent-ref/cc-switch` | `3c3d417457a4c3420139488c19718b7415641584` | `docs/research/repomix/cc-switch-token-tree.txt`, `docs/research/repomix/cc-switch-context.1.xml` | `/Users/lienli/Documents/GitHub/agent-ref/cc-switch/graphify-out/graph.json`, `/Users/lienli/Documents/GitHub/agent-ref/cc-switch/graphify-out/GRAPH_REPORT.md` |

## 必读分析材料

- `docs/research/reference-project-workflow.md`：Guga 使用 Repomix、Graphify、Context Pack 的分层查询流程。
- `docs/research/context-packs/cc-switch-core-management.files.txt`：本包证据入口清单。
- `/Users/lienli/Documents/GitHub/agent-ref/cc-switch/README_ZH.md`：产品能力、存储模型、分层架构和目录说明。
- `/Users/lienli/Documents/GitHub/agent-ref/cc-switch/graphify-out/GRAPH_REPORT.md`：focused AST 图谱报告；当前更适合作为源码导航层，不适合作为完整语义结论来源。

## 必读源码文件

- `src-tauri/src/services/provider/mod.rs`：provider CRUD、switch、回填、排序、universal provider 和 live config 同步入口。
- `src-tauri/src/services/provider/live.rs`：把数据库 provider 写回 Claude / Codex / Gemini / OpenCode / OpenClaw / Hermes live 配置的关键适配层。
- `src-tauri/src/services/mcp.rs`：统一 MCP server SSOT，同步或移除到各 app live 配置。
- `src-tauri/src/mcp/*.rs`：各应用 MCP 文件格式适配器，尤其 Codex TOML、Claude/Gemini/OpenCode/Hermes 差异。
- `src-tauri/src/services/skill.rs`：Skills SSOT、仓库发现、安装、备份、同步方式和存储位置。
- `src-tauri/src/proxy/mod.rs`、`src-tauri/src/proxy/forwarder.rs`、`src-tauri/src/proxy/provider_router.rs`：本地 proxy 模块边界、请求转发、熔断/故障转移路由。
- `src-tauri/src/proxy/providers/*.rs`：Claude / Codex / Gemini / Copilot 等 provider adapter、请求转换、流式响应处理。
- `src-tauri/src/session_manager/mod.rs` 与 `src-tauri/src/session_manager/providers/*.rs`：多 provider 会话扫描、消息读取、删除和恢复命令。
- `src-tauri/src/app_config.rs`：跨应用开关结构，例如 `McpApps`、`SkillApps` 与 `AppType` 支持边界。
- `src/lib/api/*.ts`、`src/hooks/useProviderActions.ts`、`src/hooks/useMcp.ts`、`src/hooks/useSkills.ts`：前端到 Tauri command 的类型化调用和业务 hooks。

## 关键抽象

- `AppType`：把 Claude、Codex、Gemini、OpenCode、OpenClaw、Hermes、Claude Desktop 等目标应用显式枚举，所有同步逻辑都围绕它分发。
- `ProviderService`：provider 管理 facade，负责数据库记录、当前 provider 切换、live 配置写入、导入回填和 universal provider。
- `McpService`：MCP 的统一服务层，数据库存储统一结构，再按 `AppType` 同步到各应用原生配置格式。
- `SkillStorageLocation` / `SyncMethod` / `SkillApps`：Skills 的 SSOT 目录、同步方式和应用启用状态分离，支持 symlink/copy fallback。
- `ProxyService` + `RequestForwarder` + `ProviderRouter`：本地 HTTP proxy 不是简单转发器，而是集成 provider 选择、格式转换、故障转移、熔断器、session id、流式处理和状态统计。
- `SessionManager`：每个 provider 有独立 scanner/parser，但上层返回统一的 `SessionMeta` 和 `SessionMessage`。

## 已确认事实

- Fact: CC Switch 的产品目标是统一管理 Claude Code、Codex、Gemini CLI、OpenCode 和 OpenClaw，提供 provider 切换、MCP/Skills 统一管理、proxy、会话和工作区能力。证据：`README_ZH.md:140-191`。
- Fact: 项目采用 SQLite 作为可同步数据 SSOT，设备级设置放在 JSON；架构说明明确为 Commands -> Services -> DAO -> Database。证据：`README_ZH.md:243-247`、`README_ZH.md:350-355`。
- Fact: 后端核心组件包括 ProviderService、McpService、ProxyService、SessionManager、ConfigService、SpeedtestService。证据：`README_ZH.md:357-364`。
- Fact: `McpService::upsert_server` 会先保存统一 MCP server，再处理取消勾选应用时的 live 移除，最后同步到启用应用。证据：`src-tauri/src/services/mcp.rs:18-49`。
- Fact: MCP 对不同 app 走不同适配器：Claude、Codex、Gemini、OpenCode、Hermes 会同步；OpenClaw 和 Claude Desktop 在当前实现中跳过。证据：`src-tauri/src/services/mcp.rs:110-140`。
- Fact: Skills 服务层声明 v3.10.0+ 统一架构：`~/.cc-switch/skills/` 为 SSOT，安装时进入 SSOT，再同步到各应用目录，数据库记录安装和启用状态。证据：`src-tauri/src/services/skill.rs:1-6`。
- Fact: Skills 同步支持 `Auto`、`Symlink`、`Copy` 三种方式，存储位置支持 `cc_switch` 和 `unified`。证据：`src-tauri/src/services/skill.rs:25-47`。
- Fact: `McpApps` 与 `SkillApps` 都把应用启用状态显式建模，并通过 `enabled_apps()` 返回需要同步的目标应用。证据：`src-tauri/src/app_config.rs:7-74`、`src-tauri/src/app_config.rs:76-164`。
- Fact: SessionManager 并行扫描 Codex、Claude、OpenCode、OpenClaw、Gemini、Hermes，会按最近活跃时间排序，并用 provider-specific parser 加载消息。证据：`src-tauri/src/session_manager/mod.rs:58-112`。
- Fact: 会话删除会 canonicalize source path，并校验待删文件位于 provider root 内，避免任意路径删除。证据：`src-tauri/src/session_manager/mod.rs:141-210`。
- Fact: Proxy 模块拆出 body filter、cache injector、circuit breaker、provider router、providers、response handler、session、SSE、usage 等子模块。证据：`src-tauri/src/proxy/mod.rs:1-58`。
- Fact: `RequestForwarder` 持有 `ProviderRouter`、proxy status、current providers、Gemini shadow store、Codex chat history、failover manager、Tauri app handle、session id 和 rectifier/optimizer 配置。证据：`src-tauri/src/proxy/forwarder.rs:89-122`。
- Fact: Repomix focused context 生成时安全扫描排除了 `src-tauri/src/proxy/http_client.rs` 和 `src-tauri/src/services/webdav.rs`；使用 packed context 做源码确认时需注意这两个文件不在包内。证据：`docs/research/repomix/cc-switch-generation-notes.md`。

## Guga 迁移判断

- Adopt: Guga 可借鉴 `AppType` + per-app adapter 的形状，把“统一意图”与“各工具配置格式”分开，而不是在业务层散落 JSON/TOML 分支。
- Adopt: MCP / Skills / Prompts 适合采用 SSOT + live projection 模式。Guga 内部保存规范化对象，写入外部工具目录时通过 adapter 生成目标格式。
- Adopt: 对会话管理采用 provider-specific scanner + unified meta/message return type，并且删除/恢复操作必须验证 provider root。
- Adapt: ProviderService 当前承担较多职责，Guga 可以保留 facade，但把 live projection、profile selection、credential policy、current provider state 分成更小 service。
- Adapt: Proxy 的 adapter / router / forwarder 分层值得借鉴，但 Guga 不应一次搬入完整整流器、Copilot optimizer、Gemini shadow replay；先落地 provider routing、format transform、stream normalization、failover telemetry。
- Adapt: Skills 的 symlink/copy fallback 很实用，但 Guga 需要把权限、来源信任、签名/校验和、用户确认策略前置，而不是只做文件同步。
- Skip: 桌面 UI、赞助商 preset、完整商用订阅/用量面板不应进入 Guga 核心 agent runtime；可以作为未来产品壳参考。

## 待验证问题

- Provider live 配置写入是否所有路径都满足原子写入和备份策略？需要在 `provider/live.rs` 与 `config.rs` 中逐函数确认。
- Codex / Claude / Gemini 的 MCP 文件格式差异是否可以抽成 Guga 的 `ConfigProjection` trait？
- Skills 同步是否需要记录 projection 状态，以支持“SSOT 已装但某 app 写入失败”的部分失败恢复？
- Proxy failover 与 provider switch 是否应共享同一 current-provider 状态，还是保持 runtime routing 与静态配置切换分离？
- 会话扫描是否应该加入索引缓存，而不是每次直接扫 provider 文件系统？
