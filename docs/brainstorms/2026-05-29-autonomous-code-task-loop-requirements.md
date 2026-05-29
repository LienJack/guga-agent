# 复刻 Pi Code / Claude Code / OpenCode 的自动编程任务闭环需求文档

## 一句话目标

Guga 不只是做一个简单 MVP，而是对齐 Pi Code、Claude Code、OpenCode 这类成熟 terminal coding agent 的完整能力面：用户直接输入编程任务，系统自动完成代码侦察、计划、编辑、测试、修复、会话治理、权限控制、扩展加载、模型切换和可审计状态记录。

## 背景

当前 `profile-code-agent` 已经把 Guga 的 core、built-in tools、permission、skills/MCP、ops/audit/eval 等能力组合成 code profile，但整体仍更接近一次 agent run。参考 Pi Code、Claude Code、OpenCode 后，真正要复刻的是一套 terminal coding agent 工作台，而不是一个“输入任务后跑几轮测试”的轻量闭环。

本需求文档把目标从“最小自动编程闭环”升级为“复刻级覆盖清单”。实现仍应保持 Guga 架构原则：复用 `AgentLoop`、`ExecutionPipeline`、`ToolScheduler`、permission kernel、session JSONL、built-in filesystem/shell/git tools 和 code profile，不把 coding 专用流程塞进 core loop。

## 参考项目结论

### Pi Code

Pi 的核心取向是小核心、高扩展。默认直接输入任务，基础工具是 `read`、`write`、`edit`、`bash`，可选启用 `grep`、`find`、`ls`。它通过 `AGENTS.md` / `CLAUDE.md` 注入项目规则，通过 session runtime 支持 resume、fork、tree、clone，通过 SDK/RPC 提供嵌入式使用。Pi 刻意不内置 MCP、sub-agent、plan mode、todo、permission popup、background bash，而是通过 extensions、skills、prompt templates、packages 让用户安装或自建。

关键借鉴：

- 用户体验上不需要显式 autonomous 入口，直接输入任务即可。
- 核心要小，workflow-specific 能力应放在 extension/profile/controller。
- 扩展 API 要足够强：注册工具、命令、事件、UI、provider、active tools、session state。
- 文件变更工具必须有同文件 mutation queue，避免并发覆盖。
- session replacement 要重新绑定 cwd-bound services，不能只是替换 messages。

### Claude Code

Claude Code 的核心取向是统一执行内核和强权限/强工作台。REPL、headless、SDK、subagent、background agent、bridge/remote 都复用同一套 `query/tool/permission` 闭环。工具协议里权限、安全、并发、UI 渲染都是一等字段。它有 plan mode、accept edits、auto/bypass 等权限模式，进入 auto mode 时还会剥离危险 bash 权限。长会话治理、压缩后状态重注入、memory 文件化、多 agent/swarm、任务面板和 permission UI 都是成熟产品面的一部分。

关键借鉴：

- 统一执行内核，不能让 CLI、headless、subagent、remote 各跑一套行为。
- 工具是协议对象，不只是函数：要声明只读/破坏性/并发/权限/渲染/中断语义。
- Plan / 执行 / 权限 / 测试 / 压缩 / memory 都要成为可审计的事件和状态。
- 自动模式必须有安全降级，不应把“自动”理解成跳过权限。
- 多 agent 可以后置，但架构要允许未来 coordinator、subagent、swarm。

### OpenCode

OpenCode 的核心取向是 server-driven coding agent。CLI 是本地 server 的薄封装，TUI、run、batch、PR review、serve/share 等模式通过统一 session/server 能力工作。它有静态多 agent：`build`、`plan`、`explore`、`general`、`compaction`、`title/summary`，并用权限 ruleset 合并 defaults、agent policy、user config。工具覆盖 read/write/edit/multiedit/patch/ls/glob/grep/bash/webfetch/websearch/question/task/todo/LSP/codesearch/batch 等。协议层覆盖 MCP、ACP、LSP。

关键借鉴：

- Server 是单一事实源，UI 是投影；事件流用 SSE/JSON Patch 推送。
- Agent 可以按角色配置权限和工具：build 能改，explore 只读，plan 只写计划。
- LSP/codesearch 是“复刻 OpenCode”的关键能力，不能只靠 grep。
- batch/run/serve/share/PR review 是完整 CLI 产品面的组成部分。
- MCP/ACP/LSP 三层协议是生态覆盖的关键。

## Guga 当前基础

- `packages/core/src/loop/agent-loop.ts` 已经负责 provider turns、tool execution、context compaction 和 durable run events。
- `packages/core/src/tools/execution-pipeline.ts` 已有 schema validation、hook、permission、execute、result pipeline。
- `packages/core/src/tools/tool-scheduler.ts` 已有 read-only / scoped parallel / serial 调度和资源冲突判断。
- `packages/core/src/builtins/filesystem.ts` 已有 `fs_read`、`fs_write`、`fs_edit`、`fs_list`、`fs_search`。
- `packages/core/src/builtins/shell.ts` 已有 `shell_exec`、timeout、env allowlist、serial scheduler、permission metadata。
- `packages/core/src/builtins/git.ts` 已有 `git_status`、`git_diff`、`git_commit_message`。
- `packages/profile-code-agent` 已有 code profile、permission policy、repo context helper、test discovery helper。
- `packages/plugin-session-jsonl`、`packages/plugin-replay-audit`、`packages/plugin-memory-jsonl` 已经提供 session/event/replay/memory 的部分底座。
- `packages/plugin-mcp`、`packages/plugin-skills` 已有 MCP 和 skills 基础。
- `packages/plugin-tools-delegation` 已有 delegate task 工具基础。

## 复刻级覆盖清单

下面清单按“用户可感知能力域”组织。每项标记：

- **P0**：复刻级第一阶段必须覆盖，否则不像成熟 coding agent。
- **P1**：第二阶段补齐，决定产品完整度。
- **P2**：高级能力，面向大型任务、生态和团队场景。

### 1. 自然任务入口与任务识别

- [ ] **P0** 用户直接输入编程任务即可触发自动编程闭环，不要求 `guga code` 或 `--autonomous`。
- [ ] **P0** 区分解释型请求、研究型请求、编程执行任务、代码 review 任务、普通聊天任务。
- [ ] **P0** 低置信度识别时不贸然写代码：退回普通回答，或在交互模式给轻量确认。
- [ ] **P0** 默认 code profile 应像 Pi 一样运行在当前 cwd，并读取项目指令。
- [ ] **P1** 支持 `@file` / 文件引用 / 粘贴长文本 / 图片输入进入任务上下文。
- [ ] **P1** 支持 while-streaming 的 steer / follow-up：当前任务运行中用户可追加或改向。
- [ ] **P2** 支持 batch 文件和批量任务队列，类似 OpenCode batch。

### 2. Agent 角色与工作模式

- [ ] **P0** 默认 `build`/code agent：可读、可编辑、可运行验证。
- [ ] **P0** `explore` 只读模式：只搜索、读文件、总结，不写文件、不跑破坏性命令。
- [ ] **P0** `plan` 模式：产出结构化计划，不直接改源码。
- [ ] **P0** `compaction` / summary 隐藏角色：负责压缩和会话摘要。
- [ ] **P1** `review` 模式：读 diff、产出 findings、可建议测试但不默认修改。
- [ ] **P1** `general/research` 子角色：非代码研究，不触碰项目 TODO 或源码。
- [ ] **P1** 角色级 permission ruleset，参考 OpenCode defaults + agent + user config 三层合并。
- [ ] **P2** Coordinator 模式：主线程变成 dispatcher，分 Research / Implementation / Verification。
- [ ] **P2** Swarm / teammate 模式：多 worker 并发处理任务列表。

### 3. 自动编程任务状态机

- [ ] **P0** 明确定义 task lifecycle：created、scouting、planning、executing、verifying、repairing、completed、blocked、failed、cancelled。
- [ ] **P0** 侦察阶段先只读搜索相关文件、测试、脚本、项目约束。
- [ ] **P0** 计划阶段生成 `TaskPlan`：目标、影响文件、修改策略、测试计划、风险、完成条件。
- [ ] **P0** 执行阶段允许编辑源码和测试，但所有动作进入 permission/tool pipeline。
- [ ] **P0** 验证阶段由 controller 主动运行命令，不能只靠模型声称完成。
- [ ] **P0** 修复阶段把失败命令、退出码、关键输出、相关 diff 回灌给 agent。
- [ ] **P0** 只有验证全部通过才能 completed。
- [ ] **P0** 最大尝试次数、最大 turn、最大测试时间、最大 shell 输出都要有预算。
- [ ] **P1** 每个阶段写入 durable events，可在 replay/audit 中重建。
- [ ] **P1** 支持用户中断、继续、重试、放弃、转 plan-only。
- [ ] **P2** 支持任务分叉、回滚到某个计划/编辑/测试 checkpoint。

### 4. 工具覆盖

#### 文件与编辑

- [ ] **P0** read：支持 offset/limit、行号显示、大文件截断。
- [ ] **P0** write：新建/覆盖文件，写前 permission，写后记录 diff。
- [ ] **P0** edit：精确替换，oldText 必须唯一，不唯一时返回错误让模型修正。
- [ ] **P0** list/ls：列目录，支持隐藏文件策略。
- [ ] **P0** search/grep：内容搜索，使用 ripgrep 语义，返回路径/行号/预览。
- [ ] **P0** glob/find：路径模式搜索，尊重 gitignore。
- [ ] **P1** multiedit：一个工具调用内跨文件/多块编辑，保持原子化或有局部失败报告。
- [ ] **P1** patch：应用 unified diff，失败时返回 hunk 级诊断。
- [ ] **P1** 文件 mutation queue：同一文件写操作串行，防止并发覆盖。
- [ ] **P2** notebook / structured file 编辑器。

#### Shell 与进程

- [ ] **P0** shell_exec：cwd 固定工作区，timeout、cancel、env allowlist、输出截断。
- [ ] **P0** shell 命令结果进入模型上下文时有预算与摘要策略。
- [ ] **P0** 阻止危险命令：`rm -rf`、`git reset --hard`、`git clean -fd`、`git push`、`sudo`、fork bomb、危险 `dd` 等。
- [ ] **P1** `!command` 用户主动 shell，输出进入模型；`!!command` 输出不进入模型，参考 Pi。
- [ ] **P1** long-running/background command 管理，展示运行状态、可取消、可读取输出。
- [ ] **P2** PTY/WebSocket 双向 shell，支持交互式进程。

#### Git 与代码变更

- [ ] **P0** git_status、git_diff、changed files summary。
- [ ] **P0** 完成摘要列出 changed files、diff summary、tests run。
- [ ] **P1** git checkpoint / snapshot：任务开始、关键编辑后生成可回滚点。
- [ ] **P1** revert：按消息/part/tool result 回滚到某个快照。
- [ ] **P1** commit message helper，但不自动 commit。
- [ ] **P2** worktree isolation：高风险任务在临时 worktree 中执行。
- [ ] **P2** PR/issue review 模式。

#### Web、问题与外部工具

- [ ] **P1** webfetch：抓取文档/API，结果清洗和截断。
- [ ] **P1** websearch：技术问题或最新 API 查询，附来源。
- [ ] **P0** ask/question：必要时向用户提问；headless 下要有失败/blocked 策略。
- [ ] **P1** MCP tools：stdio MCP 动态发现、命名、权限、关闭。
- [ ] **P2** remote MCP / SSE MCP。

#### LSP 与代码智能

- [ ] **P1** codesearch：workspace symbols / definitions / references。
- [ ] **P1** TypeScript/JavaScript LSP。
- [ ] **P2** Python、Go、Rust、Java 等语言 LSP 自动发现。
- [ ] **P2** diagnostics：从 LSP 获取错误并加入修复循环。

#### 任务与 TODO

- [ ] **P0** 内部 task plan/state，不一定暴露 Todo 工具给模型。
- [ ] **P1** TodoRead/TodoWrite 或计划面板：适合长任务进度管理。
- [ ] **P1** TODO 进入 compaction/reinjection，压缩后不丢进度。
- [ ] **P2** 可选地采用 Pi 哲学：TODO 作为 extension/package，而非 core 固定能力。

### 5. 权限、安全与沙箱

- [ ] **P0** allow/ask/deny 三态权限。
- [ ] **P0** 工具声明 effect：read/write/execute/external/interactive。
- [ ] **P0** 写文件和 shell 默认 ask，读 workspace 默认 allow，敏感文件默认 deny/ask。
- [ ] **P0** headless 下 ask-required 行为必须明确：deny、timeout、或使用预配置 policy。
- [ ] **P0** 权限事件可审计：requested、allowed、denied、timeout、cancelled。
- [ ] **P0** 自动模式不能跳过权限，只能使用更明确的 policy。
- [ ] **P1** accept-edits：自动接受文件编辑，shell 仍 ask。
- [ ] **P1** plan-only：禁止写和执行。
- [ ] **P1** trusted-session：允许安全验证命令自动跑。
- [ ] **P1** always allow / remember once/session/project。
- [ ] **P1** 权限规则匹配参数：路径 glob、命令模式、工具名。
- [ ] **P1** 危险 auto mode 权限剥离，参考 Claude Code。
- [ ] **P2** OS sandbox / container / SSH remote execution。
- [ ] **P2** trusted folders / external directory gate。

### 6. 测试与验证闭环

- [ ] **P0** package script discovery：test、test:unit、test:ci、typecheck、lint、build。
- [ ] **P0** changed-file aware verification：优先跑受影响 package 的测试。
- [ ] **P0** 验证命令结果结构化：command、cwd、exitCode、stdout/stderr preview、duration、status。
- [ ] **P0** 测试失败进入 repair loop。
- [ ] **P0** 没有可发现测试时，agent 必须新增测试或说明不可测原因并 blocked。
- [ ] **P0** 完成状态必须依赖验证结果。
- [ ] **P1** test output compaction：保留失败栈、错误行、命令、退出码，截断噪音。
- [ ] **P1** flaky retry 策略：同一命令可重试有限次数，但要记录 flaky。
- [ ] **P1** eval runner 回放真实任务。
- [ ] **P2** 自动生成最小复现测试、coverage-aware test selection。

### 7. 会话、历史、分叉与恢复

- [ ] **P0** session 自动保存，默认可继续最近会话。
- [ ] **P0** run/task events append-only 落盘。
- [ ] **P0** tool_call / tool_result 配对修复，避免恢复后 provider 拒绝。
- [ ] **P1** session list / resume / new / fork / tree / clone。
- [ ] **P1** conversation branch：从任意历史节点继续。
- [ ] **P1** labels/bookmarks：标记关键 checkpoint。
- [ ] **P1** session summary：标题、变更统计、测试统计。
- [ ] **P1** interrupted run 检测：provider/tool/permission/compaction 中断后能恢复或阻塞。
- [ ] **P2** share/export/import JSONL。
- [ ] **P2** session search / FTS。

### 8. 上下文管理与压缩

- [ ] **P0** tool result 截断与 artifact 化，不能把大日志塞进 history。
- [ ] **P0** context pressure event：接近窗口时可见。
- [ ] **P0** 主动 compact 和 provider overflow reactive compact。
- [ ] **P0** compact 后保留当前目标、计划、TODO、关键文件、测试失败、下一步。
- [ ] **P0** compact 后修复 tool pairing。
- [ ] **P1** post-compact reinjection：active files、plan、skills、tools 声明重新注入。
- [ ] **P1** local pre-processing：去重、smart collapse、参数截断。
- [ ] **P1** summary quality audit 或至少 summary schema 校验。
- [ ] **P2** ContextEngine 插件化。
- [ ] **P2** session memory / project memory / historical retrieval。

### 9. Provider、模型、认证

- [ ] **P0** 多 provider 配置和模型选择。
- [ ] **P0** OpenAI-compatible / Anthropic / Gemini / Copilot / Codex auth 路径保持可用。
- [ ] **P0** 模型 streaming 事件统一。
- [ ] **P0** provider error 分类：auth、rate limit、payment、context overflow、server、network。
- [ ] **P1** fallback models / fallback chain。
- [ ] **P1** 主模型和辅助模型分离：摘要、标题、压缩可用便宜模型。
- [ ] **P1** thinking level / reasoning effort 切换。
- [ ] **P1** OAuth login 与 API key 混合存储。
- [ ] **P1** model registry：可用性、能力、context window、价格。
- [ ] **P2** credential pool、429/402/401 自动降级、跨进程刷新。
- [ ] **P2** prompt caching / cache retention。

### 10. 扩展、Skills、MCP、Packages

- [ ] **P0** Skills：发现元数据、按需读取 `SKILL.md`、支持项目/用户目录。
- [ ] **P0** MCP stdio：server 配置、tools/list、tools/call、shutdown。
- [ ] **P1** extension API：注册工具、命令、事件、provider、active tools。
- [ ] **P1** prompt templates：文件模板可通过 slash command 展开。
- [ ] **P1** project/user/global resource discovery，支持 reload。
- [ ] **P1** extension provenance：工具/命令/资源来源可审计。
- [ ] **P1** override built-in tools 时警告和显式策略。
- [ ] **P2** package manager：安装/移除/更新 extensions、skills、prompts、themes。
- [ ] **P2** remote extension security model。

### 11. UI / CLI / TUI / 协议

- [ ] **P0** 交互 CLI：自然输入、多行输入、流式 assistant 文本、工具进度、错误展示。
- [ ] **P0** one-shot print/run 模式。
- [ ] **P0** JSON event mode，便于脚本和测试。
- [ ] **P1** TUI 工作台：transcript、status bar、slash palette、permission prompt、model selector。
- [ ] **P1** slash commands：model、login、resume、new、fork、tree、reload、compact、settings。
- [ ] **P1** 快捷键：模型切换、thinking 切换、打开外部编辑器、取消/中断。
- [ ] **P1** RPC mode：JSONL stdin/stdout 协议，供非 Node 集成。
- [ ] **P1** local HTTP server + SSE：OpenCode 风格 server-driven clients。
- [ ] **P2** ACP server：让 IDE 直接驱动 Guga。
- [ ] **P2** LSP client + IDE bridge。
- [ ] **P2** Desktop/Web 客户端。

### 12. 多 Agent 与委派

- [ ] **P1** delegate_task 工具：父 agent 委派只读研究、测试生成、review 等子任务。
- [ ] **P1** 子 agent 工具集 = 父可用工具交集 - blocked tools。
- [ ] **P1** 子 agent 上下文隔离，prompt 必须自包含。
- [ ] **P1** trace id 贯穿父子任务。
- [ ] **P1** 子任务预算、超时、中断传播。
- [ ] **P2** explore/build/review 子 agent 固定角色。
- [ ] **P2** coordinator 模式。
- [ ] **P2** swarm teammates、mailbox、task claiming。

### 13. 配置、项目规则与资源发现

- [ ] **P0** 读取全局和项目 `AGENTS.md` / `CLAUDE.md`。
- [ ] **P0** 配置 default profile、model、provider、permission、tool policy。
- [ ] **P1** settings reload。
- [ ] **P1** user/project/global 多层配置合并，用户配置最高优先级。
- [ ] **P1** resource loader：extensions、skills、prompts、themes、context files。
- [ ] **P1** offline mode、telemetry opt-out、cache retention。
- [ ] **P2** theme/keybinding 自定义。

### 14. 审计、可观测性与质量评估

- [ ] **P0** run/task/tool/permission/provider/context/test events 可审计。
- [ ] **P0** final summary 包含修改、测试、风险。
- [ ] **P1** replay audit：不重跑 provider/tool，也能重建模型输入和任务轨迹。
- [ ] **P1** operational health：provider、storage、plugins、permissions、context pressure。
- [ ] **P1** eval fixtures：把真实任务转成回放用例。
- [ ] **P2** telemetry/monitoring。
- [ ] **P2** learning/eval flywheel：失败归因、prompt/tool/context regression。

## 推荐建设顺序

### 第一阶段：像 Pi 一样自然可用

- 默认输入编程任务即可执行。
- 补齐 read/write/edit/bash/grep/find/ls/git/test 体验。
- 加 task controller、测试闭环、权限默认策略、项目指令读取、session 保存。
- 提供 one-shot、interactive、JSON event 输出。

### 第二阶段：像 OpenCode 一样平台化

- 加角色化 agents：build、plan、explore、review、compaction。
- 加 local server + SSE，CLI 变成 server 客户端。
- 加 MCP/skills/resource reload 完整能力。
- 加 LSP/codesearch、batch、PR/review、session tree/fork/revert。

### 第三阶段：像 Claude Code 一样工作台化

- 完整 TUI 控制面：permissions、tasks、models、agents、MCP、session tree。
- 强化 auto/accept-edits/plan/trusted 权限模式。
- 加 post-compact reinjection、memory、audit/replay。
- 加 delegate/coordinator/swarm、background tasks、worktree/sandbox。

## 验收标准

- [ ] 直接输入编程任务会触发自动任务闭环，无需新命令或 flag。
- [ ] 普通解释型问题不会误触发写代码/跑测试。
- [ ] 任务先侦察再计划再执行，计划和验证命令可审计。
- [ ] 修改源码后 controller 主动运行 focused verification。
- [ ] 测试失败会进入 repair loop，不会直接完成。
- [ ] 只有验证命令全部通过，任务才 completed。
- [ ] 权限、安全、危险命令阻断和 headless ask 策略都有测试。
- [ ] session resume 后能恢复任务计划、测试历史、当前状态。
- [ ] compact 后仍保留任务目标、计划、关键文件、测试失败和下一步。
- [ ] 复刻覆盖清单中的 P0 项有对应实现或明确测试覆盖。

## 决策（ADR-lite）

**背景**：用户明确要求不要简单 MVP，而是复刻 Pi Code、Claude Code、OpenCode 的完整 coding agent 能力面。

**决策**：文档目标从“自动编程任务闭环 MVP”升级为“复刻级覆盖清单”。Guga 仍不新增强制入口；用户直接输入任务是核心体验。实现上采用 profile/host-level controller + capability roadmap，而不是把 coding workflow 写进 core loop。

**影响**：

- 后续规划不能只做 controller 和 test loop，还要覆盖会话、权限、工具、扩展、UI、provider、LSP、多 agent、审计等产品面。
- P0/P1/P2 不代表简单 MVP，而是复刻成熟 coding agent 的分阶段落地顺序。
- `packages/core` 继续保持通用，复刻能力通过 profile、plugins、host、CLI/TUI、server 和 extensions 长出来。

## 主要证据

- `docs/research/context-packs/agent-loop.md`：Agent 主循环、工具调度、streaming、预算、retry/fallback、消息清洗。
- `docs/research/context-packs/tool-registry.md`：工具注册、权限、MCP、skills 渐进式加载。
- `docs/research/context-packs/context-compression.md`：上下文压缩、session resume、post-compact reinjection。
- `docs/research/context-packs/ui-protocol.md`：CLI/TUI/server/SSE/ACP/LSP/IM 通道。
- `docs/research/context-packs/multi-agent.md`：subagent、coordinator、swarm、权限继承、trace。
- `docs/research/context-packs/provider-abstraction.md`：多 provider、辅助模型、fallback、凭证池。
- `docs/research/source-analysis/learn-opencode/docs/packages/opencode/01-agents-and-permissions.md`：OpenCode agent/permission 模型。
- `docs/research/source-analysis/learn-opencode/docs/packages/opencode/03-tools-and-capabilities.md`：OpenCode 原生工具、LSP、worktree、tool registry。
- `docs/research/source-analysis/claude-code-analysis/analysis/04b-tool-call-implementation.md`：Claude Code tool pipeline。
- `docs/research/source-analysis/claude-code-analysis/analysis/02-security-analysis.md`：Claude Code 权限与 sandbox。
- `docs/research/repomix/pi-focused-context.xml`：Pi SDK/RPC/session runtime/extensions/tools/resource loader。

