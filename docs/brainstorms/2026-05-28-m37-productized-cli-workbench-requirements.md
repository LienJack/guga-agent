# M37 Productized CLI Workbench Requirements

## 一句话结论

Guga CLI 的下一阶段不是继续把 `run` 命令做厚，而是把 `@guga-agent/cli` 做成像 Pi、Claude Code、OpenCode、Blade Code 一样的产品化 coding-agent 入口：用户输入裸 `guga` 就进入终端工作台，默认加载真实 code profile 和文件系统、shell、git、skills/MCP 能力；`guga run` / `guga -p` 保留为 headless/脚本化路径；CLI 与未来桌面端共享同一套 Host protocol。

## 背景

- 用户明确期望 `guga` 像 `pi`、Claude Code、OpenCode、Blade Code 一样直接进入终端模式，开始命令 agent 干活。
- 用户选择了 `1+2`：第一版既要有 TUI-shaped workbench 的产品手感，也要同时落地配置、模型、session、slash command 等产品语义。
- 用户选择了 OpenTUI-style / Pi-style 渲染路线，不走 Ink/React。
- 用户更新决策：可以引入 OpenTUI 以节约 renderer 开发成本；第一版仍先把 workbench adapter 放在 `packages/cli` 内，不先拆 `@guga-agent/tui` 包。
- 用户选择了真实 coding tools 纳入 MVP：第一版必须能真实读写代码、跑命令、展示工具事件和处理权限，而不是只用 mock/provider 验证 UI。

## 用户价值

- 用户安装或进入仓库后，只需运行 `guga`，即可在当前工作目录启动一个可交互 coding agent。
- 用户不需要每次传 provider/model/profile flags；模型从配置文件读取，工作台内可切换。
- 用户能在 agent 工作时继续输入、排队 follow-up、abort、回答权限/交互请求。
- 未来桌面端可以复用同一 Host protocol 和 session/event/interaction 语义，而不是复制一套 agent loop。

## Requirements

- `guga` 无子命令时默认进入交互式 coding-agent terminal workbench。
- `guga run "<prompt>"` 继续作为 headless/脚本化路径。
- 增加或规划 `guga -p "<prompt>"` 作为 Pi/Claude-style one-shot alias。
- 默认 profile 是 `code`，并加载真实 code-agent bundle。
- 默认 code-agent bundle 使用现有 `@guga-agent/profile-code-agent`，包含 filesystem、shell、git、skills、MCP、ops/audit/eval 相关插件和权限策略。
- CLI 从配置文件读取模型和 provider，优先级为 `GUGA_CONFIG` > 项目 `.guga/config.json` > 用户 `~/.guga/config.json` > env/default。
- 配置文件支持 model aliases、默认模型、provider mode、provider model id、API key env、base URL。
- `guga --list-models` 和 workbench 内 `/models` 能列出配置模型。
- Workbench 内 `/model <id>` 能切换模型。
- Workbench 内 `/profile <id>` 能切换 `code`、`deep-research`、`review` 等 profile。
- Workbench 内支持 `/help`、`/status`、`/clear`、`/new`、`/resume`、`/fork`、`/permissions`、`/mcp`、`/exit` 的最小命令路由。
- Workbench 显示 startup screen：项目路径、session、profile、model、配置来源、常用 slash commands。
- Workbench 显示 transcript、assistant streaming text、tool lifecycle、permission/interaction prompt、queue 状态、abort 状态。
- 运行中输入应进入 queue/follow-up/steering，而不是丢失。
- 在 runtime 尚无 mid-run steering 注入点时，`steer` 必须以 deferred 状态可见保留，不能自动转换为 follow-up，也不能静默丢弃。
- Escape/Ctrl-C 类快捷键能 abort 当前 run，并保持 session 不损坏。
- 权限和 interaction request/response 必须走 shared Host protocol，CLI 只是一个 client。
- CLI workbench 必须经 HostClient 抽象访问 host surface；可以使用 in-memory HostClient，但不能让 renderer/workbench 直接调用 HostRuntime 私有方法。
- Host protocol 需要 `/protocol` version/features、permission response、SSE `afterSeq` replay、run cancellation、interaction cancellation、queue lifecycle 的 contract tests。
- Renderer 第一版以 OpenTUI 为主路径，在 `packages/cli` 内实现 Guga workbench adapter。
- Renderer 需要保留 deterministic state/view 测试 seam；对 OpenTUI 的 terminal integration 做轻量 adapter 测试，后续可抽到 `@guga-agent/tui`。
- 引入 OpenTUI 前需要验证 Node/Bun runtime 与包发布兼容性；如果 OpenTUI 当前版本仍要求 Bun-only，需要明确 Guga CLI 的运行时策略或 fallback。
- 非 TTY 环境要给出可读失败或退回 headless 指引。

## Acceptance Criteria

- [ ] 裸 `guga` 启动交互式 workbench，无需子命令。
- [ ] Startup screen 展示当前 project、session、profile、model、配置来源和帮助入口。
- [ ] `guga run "<prompt>"` 仍可执行并输出最终结果。
- [ ] `guga -p "<prompt>"` 或等价 one-shot alias 可用。
- [ ] `.guga/config.json`、`~/.guga/config.json`、`GUGA_CONFIG` 按优先级生效。
- [ ] `guga --list-models` 和 `/models` 能列出模型 aliases。
- [ ] `/model <id>` 能切换到配置模型。
- [ ] `/profile code` 能选中默认 coding profile。
- [ ] Bare workbench 能用 `--mock` 跑一轮确定性任务。
- [ ] Bare workbench 能用真实 provider 跑一轮配置模型任务。
- [ ] Bare workbench 能用默认 code profile 触发真实 filesystem/git/shell 工具事件。
- [ ] 需要确认的 write/edit/shell 类操作能在终端中弹出 permission/interaction prompt 并 approve/deny。
- [ ] 运行中输入能变成 queued follow-up/steering，并显示 queue 状态。
- [ ] 无 steering 注入 hook 时，queued `steer` 显示为 deferred，不自动转成 follow-up。
- [ ] Abort 能停止 active run，不破坏 session。
- [ ] Abort 会取消 active run 关联的 pending queue、permission、interaction，并通过 Host events 呈现。
- [ ] Host SDK/HTTP/in-memory transport 通过同一组 protocol contract tests。
- [ ] `GET /protocol` 能返回 version/features，SDK 对不兼容版本 fail-fast。
- [ ] Renderer 使用 OpenTUI 或通过兼容性 spike 明确 fallback，不新增 Ink/React 作为主路线。
- [ ] Renderer 的 frame rendering、key routing、slash command routing、config loading、model selection 有自动化测试。
- [ ] `pnpm -r typecheck`、`pnpm -r test`、`pnpm -r build` 通过。

## Definition of Done

- CLI 行为、配置加载、模型选择、workbench command routing、renderer frame、mock interactive run 有测试。
- 真实 code profile 的工具事件和权限路径至少有一条端到端测试或集成验证。
- README 或 CLI 文档包含 `guga`、`guga run`、`guga -p`、配置文件示例、模型切换、权限说明。
- Host protocol 的 session/run/event/interaction/permission/queue 语义保持桌面端可复用，并以 `docs/solutions/architecture-patterns/host-ui-protocol-v1.md` 为协议依据。
- Host protocol contract suite 覆盖 CLI/OpenTUI 与未来桌面端共享的核心语义，防止协议漂移。
- 可引入 OpenTUI 节约 CLI renderer 成本，但 renderer 不能成为协议层；如后续抽 `@guga-agent/tui`，另开 ADR/任务。

## Technical Approach

### Command surface

- `guga`：默认进入 interactive workbench。
- `guga run "<prompt>"`：保留现有 headless path。
- `guga -p "<prompt>"`：新增 one-shot alias，行为接近 `run`，面向 Pi/Claude-style 习惯。
- `guga --list-models`：列出配置模型。

### Config model

配置优先级：

1. `GUGA_CONFIG`
2. 项目 `.guga/config.json`
3. 用户 `~/.guga/config.json`
4. env/default

配置草案：

```json
{
  "defaultModel": "sonnet",
  "models": [
    {
      "id": "sonnet",
      "label": "Claude Sonnet",
      "providerId": "ai-sdk",
      "providerMode": "anthropic",
      "modelId": "claude-sonnet-4-5",
      "apiKeyEnv": "ANTHROPIC_API_KEY"
    }
  ],
  "defaultProfile": "code",
  "mcp": {
    "servers": []
  },
  "skills": {
    "roots": []
  }
}
```

### Renderer model

- 放在 `packages/cli` 内，先不抽 `@guga-agent/tui`。
- 采用 OpenTUI core / Pi-style 原生终端路线：component/render frame/input routing，而不是 Ink/React。
- Workbench state 与 OpenTUI adapter 解耦，避免业务状态绑死在某个 renderer API 上。
- MVP 组件：transcript、status line、multiline editor、slash command menu、simple select/overlay、permission prompt。
- Renderer 保留 state/view snapshot 测试 seam；OpenTUI terminal integration 通过 adapter 层隔离。
- 原始终端控制：raw mode、resize、cursor、clear/redraw、最小 synchronized redraw。

### Runtime/capability model

- 默认使用 `packages/profile-code-agent/src/bundle.ts` 的 `createCodeAgentRuntimeOptions()` / `createCodeAgentPlugins()`。
- 真实工具来自 filesystem、shell、git 插件。
- Skills/MCP 根据配置加载。
- Permission policy 使用 code profile 默认策略，CLI workbench 负责将 permission request 显示为交互 prompt。
- CLI 不拥有第二套 agent loop；所有 run/session/event/control 继续走 Host runtime/SDK。

### Shared protocol

- Host protocol 是 canonical：session、run、event stream、queue input、abort、interaction request/response、resume/fork/tree。
- Host UI Protocol v1 以 `docs/solutions/architecture-patterns/host-ui-protocol-v1.md` 为准：REST resources/control + SSE ordered HostEvents，CLI/OpenTUI 和未来桌面端共享同一 HostClient/reducer 边界。
- `/fork` 是同一 session 内创建 branch，不创建 child session。
- `/profile` 默认创建新 session，并在 session metadata 中保留 profile/model 摘要，方便未来桌面 sidebar 复用。
- Stdio/Pi-compatible JSONL 是 adapter，不是内部主协议。
- 桌面端未来消费同一协议，不从 terminal UI 反推状态。

## Decision (ADR-lite)

### Context

Guga 已经有 host runtime、host SDK、stdio adapter、code-agent profile、filesystem/shell/git plugins，但 CLI 第一体验仍偏 `run` 命令和协议 demo。用户希望裸 `guga` 就进入像 Pi/Claude Code/OpenCode/Blade Code 的 coding-agent 工作台。

### Decision

- 采用 OpenTUI / Pi-style 原生终端路线。
- 第一版引入 OpenTUI 作为 renderer 主路径，不使用 Ink/React；Guga 自己只实现 workbench state、adapter、主题和 command/input 逻辑。
- 第一版同时交付 TUI-shaped workbench 和产品语义：config/model/session/slash commands/one-shot alias。
- 第一版必须接入真实 code profile 和 filesystem/shell/git tools，不以 mock TUI 作为产品完成标准。

### Consequences

- CLI 会更像真实产品，而不是协议样例。
- 第一版实现量高于 line REPL，但能避免交付“感觉不对”的体验。
- OpenTUI 能降低自研 renderer 成本，但需要提前验证 Node/Bun packaging 和 terminal lifecycle 兼容性。
- 真实工具和权限路径纳入 MVP，会提高测试和安全要求。

## Implementation Plan

### PR1: CLI command/config semantics

- 整理 `packages/cli/src/commands/run.ts` 当前 exploratory edits。
- 建立 CLI command router：裸 `guga`、`run`、`-p`、`--list-models`。
- 完成 config file loader 和 model alias selection。
- 加 config/model command tests。

### PR2: OpenTUI renderer adapter

- 新增 `packages/cli/src/tui/` 或等价目录。
- 先执行 OpenTUI Node/Bun packaging spike，并产出 go/no-go runtime/fallback 决策。
- 引入 OpenTUI 并实现 terminal abstraction、status line、transcript、editor、key routing。
- 实现 deterministic state/view tests、OpenTUI adapter tests 和非 TTY fallback。
- 裸 `guga --mock` 能启动 workbench 并跑一轮 mock task。

### PR3: Workbench protocol integration

- Workbench 通过 Host SDK/Host runtime 创建 session/run。
- 渲染 assistant/tool/queue/error/usage/interaction events。
- 实现 slash commands：help/status/models/model/profile/clear/new/resume/fork/exit。
- 实现 queue follow-up/steering 和 abort。
- 建立 Host protocol contract suite，覆盖 HTTP 和 in-memory HostClient 的 run/queue/permission/interaction/SSE replay/version 语义。

### PR4: Real code profile/tools integration

- 默认加载 code profile bundle。
- 配置 skills/MCP 注入。
- 权限 prompt 接入 terminal overlay 和 shared interaction response。
- 用真实 filesystem/git/shell 工具跑一条端到端验证。

### PR5: Docs, smoke, cleanup

- 更新 CLI README 和 config example。
- 增加 smoke instructions：`guga --help`、`guga --list-models`、`guga -p "Say exactly: ok" --mock`、裸 `guga --mock`。
- 跑 `pnpm -r typecheck`、`pnpm -r test`、`pnpm -r build`。
- 清理/收敛 Trellis PRD 和计划文档。

## Out of Scope

- 完整桌面端 UI。
- ACP/LSP/IDE 深度集成。
- 多用户协作。
- OpenTUI 之外的外部 TUI 依赖选型。
- 第一版抽 `@guga-agent/tui`。
- Claude Code 规模的 teams/tasks/agents/MCP 全控制台。
- Provider marketplace 或自动 provider discovery。

## Risks And Edge Cases

- **权限安全**：真实 shell/write 工具进入 MVP，必须 fail-closed，headless/非交互模式不能静默执行 ask-required 操作。
- **终端兼容**：raw mode、Ctrl-C、Escape、resize、非 TTY、CI 输出需要明确降级。
- **渲染复杂度**：OpenTUI adapter 仍可能膨胀，第一版只做 workbench 必需 primitives，并把业务状态留在 renderer-agnostic 层。
- **事件一致性**：CLI 渲染只能消费 Host events，不能解析 assistant 文本猜 tool/permission 状态。
- **配置错误**：无模型、API key 缺失、无效 alias 要给出可操作错误和 config path。
- **真实工具测试**：需要 mock provider + temporary workspace，避免测试修改真实仓库。

## Evidence

- Fact: `docs/research/context-packs/ui-protocol.md` 建议采用本地 server/SDK/SSE，使 CLI/桌面/IDE 共享协议。
- Fact: `docs/research/context-packs/tool-registry.md` 总结了 builtin + MCP + plugin tools 统一工具池和 allow/ask/deny 权限模型。
- Fact: `docs/research/source-analysis/learn-opencode/docs/internals/cli.md` 描述 OpenCode CLI 启 server、创建 SDK client、启动 TUI。
- Fact: `docs/research/source-analysis/learn-opencode/docs/packages/opencode/02-cli-mastery.md` 将裸 `opencode` 作为交互 TUI，`opencode run` 作为 one-shot。
- Fact: `docs/research/source-analysis/claude-code-analysis/analysis/components/01-component-architecture-overview.md` 和 `02-core-interaction-components.md` 表明 Claude Code TUI 是 Messages + PromptInput 的 agent workbench。
- Fact: `docs/research/repomix/pi-focused-context.xml` 表明 Pi 拆分 `pi-coding-agent`、`pi-agent-core`、`pi-ai`、`pi-tui`，裸 `pi` 进入 interactive mode，`pi -p` 和 `pi --list-models` 是烟测路径。
- Fact: `docs/research/repomix/blade-code-context.1.xml` 表明 Blade Code 启动时合并配置、加载 skills/plugins/subagents/hooks，并通过 MessageArea/InputArea/StatusBar 构成 TUI。
- Fact: `packages/profile-code-agent/src/bundle.ts` 已经聚合 filesystem、shell、git、skills、MCP、ops、audit、eval 插件和 code-agent permission policy。
- Inference: Guga 的最佳落点是 Pi-style product CLI + OpenCode-style shared host protocol，而不是单纯复制某一个参考项目的 UI 或 RPC。
