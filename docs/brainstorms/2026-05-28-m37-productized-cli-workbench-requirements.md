# M37 Productized CLI Workbench Requirements

## 一句话结论

Guga CLI 的下一阶段不是继续把 `run` 命令做厚，而是把 `@guga-agent/cli` 做成像 Pi、Claude Code、OpenCode、Blade Code 一样的产品化 coding-agent 入口：用户输入裸 `guga` 就进入终端工作台，默认加载真实 code profile 和文件系统、shell、git、skills/MCP 能力；`guga run` / `guga -p` 保留为 headless/脚本化路径；CLI 与未来桌面端共享同一套 Host protocol。

## 背景

- 用户明确期望 `guga` 像 `pi`、Claude Code、OpenCode、Blade Code 一样直接进入终端模式，开始命令 agent 干活。
- 用户进一步明确：当前 CLI 交互体验很糟糕，第一版必须有可持续输入框；输入 `/` 时必须弹出命令提示，而不是只靠用户记忆命令。
- 用户选择了 `1+2`：第一版既要有 TUI-shaped workbench 的产品手感，也要同时落地配置、模型、session、slash command 等产品语义。
- 用户选择了 OpenTUI-style / Pi-style 渲染路线，不走 Ink/React。
- 用户更新决策：可以引入 OpenTUI 以节约 renderer 开发成本；第一版仍先把 workbench adapter 放在 `packages/cli` 内，不先拆 `@guga-agent/tui` 包。
- 用户选择了真实 coding tools 纳入 MVP：第一版必须能真实读写代码、跑命令、展示工具事件和处理权限，而不是只用 mock/provider 验证 UI。

## 用户价值

- 用户安装或进入仓库后，只需运行 `guga`，即可在当前工作目录启动一个可交互 coding agent。
- 用户不需要每次传 provider/model/profile flags；模型从配置文件读取，工作台内可切换。
- 用户能在 agent 工作时继续输入、排队 follow-up、abort、回答权限/交互请求。
- 用户输入 `/` 时能看到可发现的命令列表，输入后继续过滤，能通过键盘选择并执行或补全参数。
- 用户在一个真实编辑器里输入 prompt：支持多行、历史、粘贴、光标移动和中文输入法，而不是 readline 式单行临时输入。
- 未来桌面端可以复用同一 Host protocol 和 session/event/interaction 语义，而不是复制一套 agent loop。

## 交互调研补充

- **Claude Code**：TUI 的中枢是 `Messages + PromptInput`。`PromptInput` 不是普通文本框，而是会话控制台：它承担 slash、history、typeahead、附件、model、permission、task/status 等编排。Guga 第一版不需要照搬全量控制面，但输入区必须承担“下一步动作编排”的职责。
- **Pi**：交互模式强调底部 editor、slash/file autocomplete、queue、steer/follow-up、abort 和 session tree。运行中输入不是丢弃或等待当前轮结束，而是进入可见队列；Escape/abort 会清理当前 run 相关队列，但不破坏 session。
- **OpenCode**：裸 `opencode` 进入 TUI，`opencode run` 是 one-shot；TUI 由本地 server + SDK/SSE 驱动。输入区支持 `/` slash popover 和 `@` context popover，命令带 title、description、source/keybind，可来自 builtin/custom/MCP/skill 等来源。
- **Guga 取舍**：采用 Pi-style 原生终端编辑器和运行中输入语义，采用 OpenCode-style HostClient/SDK 驱动与 command popover，采用 Claude Code-style `Messages + PromptInput` 工作台分层；不复制任何一个项目的完整 UI 平台。

## 完整交互迁移清单

**入口与启动**

- [ ] 裸 `guga` 进入交互式 workbench。
- [ ] `guga run "<prompt>"` 保持 one-shot/headless。
- [ ] `guga -p "<prompt>"` 对齐 Pi/Claude-style one-shot alias。
- [ ] `guga --list-models` 可在不进入 TUI 的情况下列出模型。
- [ ] 非 TTY/CI 环境给出可读降级：提示使用 `run`/`-p`/`--headless`。
- [ ] 启动失败能区分 config、provider、auth、TTY、profile、workspace 权限问题。

**启动页与全局壳层**

- [ ] Startup screen 展示项目路径、session、branch、profile、model、provider、配置来源。
- [ ] Startup screen 展示可发现入口：`/help`、`/model`、`/profile`、`/resume`、`/permissions`。
- [ ] 全局布局稳定包含 transcript、status/footer、bottom prompt editor、overlay 层。
- [ ] 窗口 resize 后 transcript、editor、popover、selector 不错位。
- [ ] 状态栏持续显示 run 状态、model/profile、token/usage 概要、queue/permission 待处理状态。

**Transcript 与消息区**

- [ ] 渲染 user、assistant、system/status、tool、permission、error、compact/retry 等 typed events。
- [ ] Assistant streaming delta 实时显示，而不是等 run 完成后批量打印。
- [ ] Tool call 生命周期可见：pending、running、completed、failed、denied、aborted。
- [ ] 长 tool output 默认折叠，保留展开/查看完整输出入口。
- [ ] Shell/terminal output 与普通 assistant 文本视觉区分。
- [ ] 文件读写、diff、patch、test result 有可扫描的摘要展示。
- [ ] 错误、retry、context overflow、compaction 状态以事件驱动展示，不解析 assistant 文本猜状态。
- [ ] Transcript 能在长会话下滚动、保留底部输入区，并不因新事件打断用户编辑。

**底部 Prompt Editor**

- [ ] Editor 持久可见，idle、streaming、tool-running、permission-pending 都可聚焦。
- [ ] 支持多行输入、软换行、可发现的新行快捷键。
- [ ] 支持基础编辑：左右移动、行首/行尾、删除字符、删除词、清空到行首/行尾。
- [ ] 支持历史导航，且不会在多行编辑中误触历史。
- [ ] 支持大段粘贴，粘贴内容不破坏布局；超长粘贴有摘要或折叠策略。
- [ ] 支持中文/日文/韩文 IME 候选窗口定位。
- [ ] 支持非 ASCII、宽字符、emoji、ANSI/OSC 输入清理或安全渲染。
- [ ] 支持草稿保留：打开/关闭 overlay、权限 prompt、abort 后不丢输入。
- [ ] 支持空输入保护：空 Enter 不误发。

**Slash Command 发现与执行**

- [ ] 输入 `/` 立即打开命令提示菜单。
- [ ] 继续输入时按 fuzzy/filter 实时过滤。
- [ ] 命令项展示 name/trigger、title、description、source、keybind、参数需求。
- [ ] 命令来源至少区分 builtin、profile、skill、MCP、plugin/custom。
- [ ] 支持上下选择、Enter 选择、Escape 关闭、Tab 或等价方式补全。
- [ ] 关闭后焦点回到 editor，原输入不丢失。
- [ ] 缺参数命令进入补参数/selector 状态，不直接执行。
- [ ] 破坏性或会话切换命令需要 confirm 或明确 selector，不因按 Enter 误触。
- [ ] 冲突命令有稳定优先级或 disambiguation 展示。
- [ ] `/help` 展示当前 profile 下实际可用命令，而不是静态文案。

**必备 Slash Commands**

- [ ] `/help`：展示命令、快捷键、输入规则。
- [ ] `/status`：展示当前 session/run/profile/model/config/queue/permission 状态。
- [ ] `/clear`：清屏或清当前视图，不破坏 durable session。
- [ ] `/new`：新建 session。
- [ ] `/resume`：选择并恢复历史 session。
- [ ] `/fork`：从当前 session/turn 创建分支。
- [ ] `/tree`：查看或切换 session tree/branch。
- [ ] `/models`：列出可用模型。
- [ ] `/model`：打开模型 selector 并切换。
- [ ] `/profile`：打开 profile selector 并切换。
- [ ] `/permissions`：查看或调整当前权限模式/规则。
- [ ] `/mcp`：查看 MCP servers/tools 状态。
- [ ] `/tools`：查看当前可用工具与来源。
- [ ] `/skills`：查看可用 skills 与来源。
- [ ] `/compact`：手动触发上下文压缩或显示压缩状态。
- [ ] `/follow`：显式把输入作为 follow-up 入队。
- [ ] `/abort`：取消 active run。
- [ ] `/exit` 或 `/quit`：退出 workbench。

**Context Mention 与补全**

- [ ] `@` 入口规划为 context mention，至少共享 slash 菜单的 overlay/fuzzy-list 基座。
- [ ] 文件路径补全支持相对路径、`~/`、当前 workspace。
- [ ] 文件、目录、最近文件、active/open files 可作为候选来源。
- [ ] Skill、agent/profile、MCP resource 可后续接入同一 mention 机制。
- [ ] 选择 mention 后以可读 chip/文本形式插入 editor，并能删除/编辑。

**运行中输入与队列**

- [ ] Idle 状态提交创建新 prompt/run。
- [ ] Running 状态普通提交默认作为 steering 输入。
- [ ] 显式 `/follow` 或快捷键作为 follow-up 入队。
- [ ] Queue strip 显示 pending items 的模式、短预览、顺序、deferred/active 状态。
- [ ] 用户能取消单个 queued item 或清空当前 run 相关 queue。
- [ ] Runtime 尚无 mid-run steering 注入点时，steer 显示 deferred，不静默改成 follow-up。
- [ ] Abort 清理 active run 相关 steer/follow-up/permission/interaction，但不破坏 session。
- [ ] next-turn 类输入如未来加入，必须与 steer/follow-up 在 UI 上可区分。

**快捷键与焦点模型**

- [ ] Enter 在 editor 提交；在 selector/permission 中确认当前选项。
- [ ] Alt/Shift/Ctrl+Enter 的换行行为有明确 fallback 和提示。
- [ ] Escape 优先关闭 topmost overlay，再取消当前交互，再 abort active run。
- [ ] Ctrl-C 与 Escape 的行为差异清楚：中断/退出/abort 不互相误触。
- [ ] Tab 在 editor 中触发补全；在 selector 中按设计移动或补全，不能吞输入。
- [ ] Arrow keys 在 editor、history、popover、selector、transcript scroll 中按焦点路由。
- [ ] 焦点栈恢复稳定：overlay 关闭后回到之前的 editor/selector。
- [ ] `/hotkeys` 或 `/help` 能查看当前有效快捷键。

**权限与通用交互**

- [ ] Permission request 作为高优先级 overlay 显示工具、参数摘要、风险、来源。
- [ ] 支持 allow once、allow session、deny，以及可选 reason。
- [ ] Shell/write/edit/git 等 ask-required 操作在 headless/非交互下 fail-closed。
- [ ] 普通 interaction 支持 select、confirm、input、editor、notify、setStatus。
- [ ] Interaction/permission response 通过 Host protocol 返回，不做 renderer-local side effect。
- [ ] 多个 pending permission/interaction 有队列或堆叠策略，不覆盖彼此。

**模型、Profile、配置与认证**

- [ ] `/model` selector 展示 alias、provider、model id、可用性、配置来源。
- [ ] 模型切换在当前 run 中若不能立即生效，应显示 next-turn 或 deferred 语义。
- [ ] `/profile` selector 展示 code、deep-research、review 等 profile 与默认工具集说明。
- [ ] Profile 切换的 session 语义明确：新 session、当前 session metadata 更新或需确认。
- [ ] 配置错误显示具体来源：`GUGA_CONFIG`、项目 config、用户 config、env/default。
- [ ] API key 缺失、base URL 错误、provider 不可用时给出可执行修复方向。
- [ ] 登录/登出或 provider auth 入口可通过 slash command 后续接入。

**Session、Resume、Fork 与历史**

- [ ] `/resume` 展示 session 列表：title/summary、cwd、profile/model、last run、更新时间。
- [ ] `/fork` 从当前 turn/branch 创建 fork，显示 lineage。
- [ ] `/tree` 展示 branch tree，并支持切换。
- [ ] `/new` 新建 session 时保留当前 cwd/profile/model 默认值。
- [ ] Session resume 后恢复 transcript、metadata、visible queue/permission 状态。
- [ ] Session history 搜索、命名、导出/import 可作为后续扩展，但命令位预留。

**工具、MCP、Skills 与能力发现**

- [ ] `/tools` 展示工具名、来源、权限模式、是否 enabled。
- [ ] `/mcp` 展示 server 状态、工具数、错误、重载入口。
- [ ] `/skills` 展示 skill 来源、可用状态、触发方式。
- [ ] Startup 或 `/status` 显示 capability diff 摘要，方便用户知道当前 agent 能做什么。
- [ ] Tool/MCP/skill 错误进入 transcript/status，不污染 editor 输入。

**Shell、Diff、文件与测试反馈**

- [ ] Shell 命令显示 cwd、命令、状态、耗时、exit code。
- [ ] 长 shell 输出折叠，保留 tail 和查看完整输出入口。
- [ ] 文件写入/edit 显示路径、摘要、diff 或变更规模。
- [ ] Git 状态、测试运行、lint/typecheck 输出有结构化摘要。
- [ ] Tool result 与 assistant 总结在视觉上可区分。

**错误、通知与恢复**

- [ ] Provider error、network error、permission denial、tool failure、abort、timeout 各有不同状态。
- [ ] 可恢复错误给出重试、切模型、改配置、resume 的入口。
- [ ] 自动 retry/compaction 有可见状态和完成/失败事件。
- [ ] Crash 或异常退出后再次启动可提示 resume 最近 session。
- [ ] 退出前如有 pending input/permission/run，提示确认或明确处理。

**Headless、Stdio 与未来客户端一致性**

- [ ] Headless 输出最终答案、失败原因、可选 debug events，不启动 TUI。
- [ ] TUI、HTTP SDK、stdio adapter 共享 Host protocol 语义。
- [ ] Slash command、permission、interaction、queue、abort 都能映射为 Host command/event。
- [ ] Pi-compatible JSONL 是 adapter，不成为第二套内部协议事实。
- [ ] 桌面/Web 未来可消费同一 session/run/event/interaction 语义。

**测试与验收覆盖**

- [ ] Editor 单测覆盖编辑、历史、粘贴、宽字符、IME cursor smoke。
- [ ] Slash popover 单测覆盖过滤、选择、关闭、补参数、冲突来源。
- [ ] Focus stack 单测覆盖 editor/popover/selector/permission/Escape 恢复。
- [ ] Queue 单测覆盖 steer、follow-up、deferred、abort cleanup。
- [ ] Host contract tests 覆盖 run streaming、input、abort、permission、interaction、SSE replay。
- [ ] Mock interactive smoke：裸 `guga --mock` 可启动、输入、slash、运行、abort、退出。
- [ ] Real provider smoke：配置模型后一轮真实 prompt 可流式返回。
- [ ] Real tools smoke：filesystem/shell/git 至少一条权限与工具事件路径可验证。
- [ ] Docs 覆盖 entry commands、editor 快捷键、slash commands、permissions、config。

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
- Workbench 底部必须有持久可见的 multiline prompt editor，作为主要输入框，而不是每轮临时 readline prompt。
- Prompt editor 必须支持 Enter 提交、可发现的换行快捷键、历史导航、基础光标编辑、大段粘贴处理、IME 光标定位和非 ASCII 输入。
- 输入框内容以 `/` 开头时必须打开 slash command 提示菜单；继续输入时菜单实时过滤，展示命令名、描述、来源和可用快捷键。
- Slash command 提示菜单必须支持键盘上下选择、Enter 确认、Escape 关闭、Tab 或等价动作补全；关闭菜单后焦点回到 editor。
- Slash command registry 必须能合并 builtin commands、profile commands、skill/MCP/plugin contributed commands，并标明来源；冲突命令必须有稳定优先级或清晰 disambiguation。
- Slash command 提交语义必须明确区分“立即执行命令”和“插入/补全命令文本等待用户补参数”；需要参数的命令不能因为用户按 Enter 误执行危险动作。
- Workbench 应支持 OpenCode-style `@` context mention 入口作为第一版可选但推荐能力：至少规划 file/context mention 与 slash 菜单共享同一 overlay/fuzzy-list 基座。
- Workbench 显示 startup screen：项目路径、session、profile、model、配置来源、常用 slash commands。
- Workbench 显示 transcript、assistant streaming text、tool lifecycle、permission/interaction prompt、queue 状态、abort 状态。
- 运行中输入应进入 queue/follow-up/steering，而不是丢失；用户必须能看见 queued item 的模式、短预览和是否 deferred。
- 运行中普通提交默认采用 steering 语义；follow-up 必须通过清晰快捷键或 `/follow` 等显式命令进入队列，避免用户误以为它会立刻改变当前 provider request。
- 在 runtime 尚无 mid-run steering 注入点时，`steer` 必须以 deferred 状态可见保留，不能自动转换为 follow-up，也不能静默丢弃。
- Escape/Ctrl-C 类快捷键能 abort 当前 run，并保持 session 不损坏。
- Escape 在不同焦点层级有一致优先级：先关闭 slash/context/permission overlay，再取消当前可取消交互，再 abort active run；每一步都必须有可见状态反馈。
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
- [ ] 底部 prompt editor 在 idle、streaming、tool-running、permission-pending 状态下都保持可见并可聚焦。
- [ ] 在空输入框键入 `/` 会打开 slash command 菜单，并展示命令名、描述、来源和快捷键。
- [ ] slash 菜单支持 fuzzy/filter、上下导航、Enter 选择、Escape 关闭，且关闭后 editor 焦点和文本不丢失。
- [ ] `/model`、`/profile`、`/resume` 这类需要选择的命令会打开 selector/overlay，而不是要求用户手写完整参数。
- [ ] 需要参数的 slash command 在参数缺失时进入补全/提示状态，不直接执行破坏性或会话切换动作。
- [ ] prompt editor 支持多行输入、历史导航、粘贴大段文本、中文输入法候选窗口位置正确。
- [ ] Bare workbench 能用 `--mock` 跑一轮确定性任务。
- [ ] Bare workbench 能用真实 provider 跑一轮配置模型任务。
- [ ] Bare workbench 能用默认 code profile 触发真实 filesystem/git/shell 工具事件。
- [ ] 需要确认的 write/edit/shell 类操作能在终端中弹出 permission/interaction prompt 并 approve/deny。
- [ ] 运行中输入能变成 queued follow-up/steering，并显示 queue 状态。
- [ ] 运行中普通提交默认以 steering 入队；显式 follow-up 命令或快捷键以 follow-up 入队；两者在 UI 上可区分。
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
- 输入框、slash command popover、selector overlay、history/paste/IME、运行中输入队列和 Escape 焦点优先级有自动化测试或可重复 smoke 验证。
- 真实 code profile 的工具事件和权限路径至少有一条端到端测试或集成验证。
- README 或 CLI 文档包含 `guga`、`guga run`、`guga -p`、配置文件示例、输入框快捷键、slash command、模型切换、权限说明。
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
- MVP 组件：transcript、status line、multiline editor、slash/context command menu、simple select/overlay、permission prompt、queued input strip。
- Prompt editor 是独立的交互 primitive：它需要拥有文本 buffer、cursor、history、paste、IME/focus、autocomplete provider 和 submit mode，而不是散落在 workbench reducer 里。
- Slash/context popover 复用同一 fuzzy-list overlay primitive；command item 至少包含 id、trigger/name、title、description、source、keybind、argument requirement 和 execution mode。
- Key routing 必须有焦点栈：editor、slash/context popover、selector、permission prompt、loader/abort 状态按优先级消费 Escape/Enter/Tab/arrow keys。
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
- Slash command invocation、selector choice、permission response、queued input 和 abort 都必须映射成 Host command/interaction，而不是 renderer-local side effect。
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
- 第一版把 bottom prompt editor 和 `/` command popover 视为核心体验，不作为后续 polish。
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
- 引入 OpenTUI 并实现 terminal abstraction、status line、transcript、bottom editor、key routing、focus stack。
- 实现 slash/context popover、selector overlay、queued input strip 和 permission prompt 的 renderer primitives。
- 实现 deterministic state/view tests、OpenTUI adapter tests、slash menu tests、editor history/paste/IME smoke 和非 TTY fallback。
- 裸 `guga --mock` 能启动 workbench 并跑一轮 mock task。

### PR3: Workbench protocol integration

- Workbench 通过 Host SDK/Host runtime 创建 session/run。
- 渲染 assistant/tool/queue/error/usage/interaction events。
- 实现 slash commands：help/status/models/model/profile/clear/new/resume/fork/permissions/mcp/follow/abort/exit。
- 将 slash command invocation、selector response、follow-up/steer input、abort 和 permission response 接入 Host command/interaction。
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
- 完整 Claude Code PromptInput 功能集，例如图片粘贴、teams、background tasks、global search、ultraplan 等专业面板。
- OpenCode 完整 Web/Desktop prompt input 体验；第一版只吸收 slash/context popover 与 command metadata 模型。
- Provider marketplace 或自动 provider discovery。

## Risks And Edge Cases

- **权限安全**：真实 shell/write 工具进入 MVP，必须 fail-closed，headless/非交互模式不能静默执行 ask-required 操作。
- **终端兼容**：raw mode、Ctrl-C、Escape、resize、非 TTY、CI 输出、IME、Alt/Shift/Ctrl+Enter 差异需要明确降级。
- **渲染复杂度**：OpenTUI adapter 仍可能膨胀，第一版只做 workbench 必需 primitives，并把业务状态留在 renderer-agnostic 层。
- **事件一致性**：CLI 渲染只能消费 Host events，不能解析 assistant 文本猜 tool/permission 状态。
- **配置错误**：无模型、API key 缺失、无效 alias 要给出可操作错误和 config path。
- **真实工具测试**：需要 mock provider + temporary workspace，避免测试修改真实仓库。
- **命令误触**：`/` 菜单必须区分补全和执行，尤其是 session 切换、权限、MCP、shell/write 相关命令，避免用户按 Enter 后发生不可逆动作。
- **焦点泄漏**：overlay 关闭、permission prompt 完成、abort 结束后必须把焦点恢复到 editor，否则交互会显得“卡住”。

## Evidence

- Fact: `docs/research/context-packs/ui-protocol.md` 建议采用本地 server/SDK/SSE，使 CLI/桌面/IDE 共享协议。
- Fact: `docs/research/context-packs/tool-registry.md` 总结了 builtin + MCP + plugin tools 统一工具池和 allow/ask/deny 权限模型。
- Fact: `docs/research/source-analysis/learn-opencode/docs/internals/cli.md` 描述 OpenCode CLI 启 server、创建 SDK client、启动 TUI。
- Fact: `docs/research/source-analysis/learn-opencode/docs/packages/opencode/02-cli-mastery.md` 将裸 `opencode` 作为交互 TUI，`opencode run` 作为 one-shot。
- Fact: `docs/research/repomix/opencode-context.1.xml` 中 OpenCode prompt input 使用 slash popover，命令项包含 trigger/title/description/keybind/type/source，并区分 builtin/custom/command/MCP/skill 来源。
- Fact: `docs/research/source-analysis/claude-code-analysis/analysis/components/01-component-architecture-overview.md` 和 `02-core-interaction-components.md` 表明 Claude Code TUI 是 Messages + PromptInput 的 agent workbench。
- Fact: `docs/research/source-analysis/claude-code-analysis/analysis/components/02-core-interaction-components.md` 表明 Claude Code 的 `PromptInput` 承担 slash、history、typeahead、model、permission、task、queued commands 等输入编排责任。
- Fact: `docs/research/repomix/pi-focused-context.xml` 中 Pi 的 builtin slash commands 包含 settings/model/export/import/share/copy/session/fork/clone/tree/new/compact/resume/reload/quit 等产品命令。
- Fact: `docs/research/repomix/pi-focused-context.xml` 中 Pi TUI editor 支持 multiline editing、slash command autocomplete、file path autocomplete、large paste handling、IME cursor positioning、Escape abort/cancel 和 selector overlay。
- Fact: `docs/research/repomix/pi-focused-context.xml` 表明 Pi 拆分 `pi-coding-agent`、`pi-agent-core`、`pi-ai`、`pi-tui`，裸 `pi` 进入 interactive mode，`pi -p` 和 `pi --list-models` 是烟测路径。
- Fact: `docs/plans/2026-05-28-036-feat-cli-claude-pi-alignment-plan.md` 已确认 Pi interactive mode 在运行中输入默认走 steering，显式 follow-up/abort 通过控制命令进入 Host 层。
- Fact: `docs/research/repomix/blade-code-context.1.xml` 表明 Blade Code 启动时合并配置、加载 skills/plugins/subagents/hooks，并通过 MessageArea/InputArea/StatusBar 构成 TUI。
- Fact: `packages/profile-code-agent/src/bundle.ts` 已经聚合 filesystem、shell、git、skills、MCP、ops、audit、eval 插件和 code-agent permission policy。
- Inference: Guga 的最佳落点是 Pi-style product CLI + OpenCode-style shared host protocol，而不是单纯复制某一个参考项目的 UI 或 RPC。
