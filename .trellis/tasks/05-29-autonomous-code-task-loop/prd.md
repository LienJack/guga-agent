# brainstorm: 自动编程任务闭环

## 目标

在 Guga 命令行中支持自然的自动编程任务体验：用户像使用 Pi、Claude Code、OpenCode 一样直接输入一个编程任务，Guga 自动识别这是 coding task，搜索相关代码，形成可审计计划，执行代码修改，补充或更新单元测试，并持续运行验证命令直到相关测试全部通过，才把任务标记为完成。

这个能力的价值是把当前 `profile-code-agent` 从“会使用代码工具的 profile”推进到“能闭环交付一个受控编程任务的工作流”。实现应复用 Guga 已有 core runtime、permission、tool pipeline、session JSONL、code profile 和 built-in tools，不把 coding 专用状态机塞进 core agent loop。

## 我已经知道的事实

* 用户希望在 Guga CLI 输入编程任务后，系统能自动搜索代码、模拟计划、执行，并写单测。
* 完成标准不是模型声称完成，而是单测/验证命令全部完成并通过。
* 本仓库已有 `packages/profile-code-agent`，它已经定义 code profile、默认权限策略、repo context helper 和 test discovery helper。
* Guga core 已有 `AgentLoop`、`ExecutionPipeline`、`ToolScheduler`、permission kernel、event bus、context projection、compaction/reinjection 和 durable event publishing。
* Guga built-in tools 已覆盖 workspace 文件读/写/编辑、shell 执行、git status/diff/commit-message helper。
* CLI 已有 `guga run --profile code` 路径，默认 profile 也是 `code`，但目前 `runCommand` 只是启动一次 host run，没有任务意图识别、任务级 controller 或测试闭环。

## 临时假设

* MVP 面向单工作区、单 agent、单任务，不做多 agent swarm 或 worktree 隔离。
* “单测全部完成”在 MVP 中解释为：任务影响范围内的 focused test/typecheck/lint/build 候选命令全部通过；如果项目没有可发现测试，agent 必须新增测试或输出明确不可测原因，并由 controller 标记为 blocked/needs-user，而不是 completed。
* 自动执行模式可以有更高自动化权限，但仍不能绕过 Guga permission kernel；危险 shell/git 操作继续 deny。

## 需求

* R1. MVP 不新增显式入口或要求用户传 `--autonomous`。用户在默认 Guga/code profile 中直接输入编程任务时，系统自动进入编程任务闭环。
* R2. 系统必须能区分普通问答/解释型请求与编程执行任务；只有明确需要修改代码、运行验证或完成工程任务时，才进入自动任务 controller。
* R3. 自动任务必须分阶段执行：搜索/侦察、计划、执行、验证、修复、完成。
* R4. 搜索/侦察阶段默认只读：使用 `fs_list`、`fs_search`、`fs_read`、`git_status`、`git_diff` 等工具定位相关代码、现有测试和项目约束。
* R5. 计划阶段必须生成结构化计划 artifact，包含目标、相关文件、拟修改点、测试计划、验证命令和完成条件。
* R6. 执行阶段允许修改源码和测试，但所有写入与 shell 执行仍通过 permission runtime。
* R7. 验证阶段必须由 controller 主动运行候选测试命令，而不是只依赖模型自报。
* R8. 测试失败时，controller 将失败命令、退出码、关键 stdout/stderr 和已变更文件回灌给 agent，进入修复循环。
* R9. 只有验证命令全部通过，task 才能 completed；达到最大尝试次数、权限拒绝、无法发现/新增测试或重复失败时应 blocked/failed，并说明原因。
* R10. 自动任务运行过程必须写入 session/event 事实，至少能审计计划、编辑、测试开始、测试失败、测试通过、完成/失败状态。
* R11. 任务完成摘要必须包含 changed files、tests run、通过/失败状态和剩余风险。

## 验收标准

* [ ] 给定用户直接输入“修复/实现/新增/重构”等编程任务，Guga 自动进入任务闭环，不要求用户选择特殊命令或 flag。
* [ ] 给定用户输入普通解释型问题，Guga 不应误进入写代码/跑测试闭环。
* [ ] 给定 Guga 识别到编程任务，系统会先执行只读代码搜索并输出/记录相关文件和测试候选。
* [ ] 给定任务进入执行前，Guga 已生成结构化计划，且计划包含验证命令与完成条件。
* [ ] 给定 agent 修改了源码，controller 会运行 focused verification commands。
* [ ] 给定第一次测试失败，Guga 会把失败输出回灌给 agent 并继续修复，而不是直接结束。
* [ ] 给定所有验证命令通过，run/task 状态为 completed，最终摘要列出测试命令和 changed files。
* [ ] 给定达到最大修复尝试次数或无法满足测试要求，run/task 状态不为 completed，并解释阻塞原因。
* [ ] 给定 shell command 包含破坏性模式，例如 `rm -rf`、`git reset --hard`、`git clean -fd` 或 `git push`，code-agent permission policy 拒绝执行。
* [ ] 单元测试覆盖 task state transitions、test command selection、failed-test retry、以及 only-complete-after-tests-pass 行为。

## 完成定义

* 为 task controller、state reducer、CLI parsing、test discovery 和 permission 行为添加或更新测试。
* 受影响 package 的 lint/typecheck/test 通过。
* 如果引入行为开关或配置项，更新 docs 或 CLI help。
* 考虑回滚：自动任务识别可以通过配置关闭，或在识别置信度低时退回普通 agent run。
* 保持既有 `guga run --profile code` 行为兼容。

## 研究笔记

### 类似工具怎么做

* Claude Code 把模型 tool call 作为受控 runtime pipeline 处理：schema 校验、语义校验、pre-tool hooks、permission/ask/deny、tool execution、标准化 `tool_result`，再回到下一轮循环。它还区分 plan-only、accept-edits、auto/bypass 等权限模式。证据：`docs/research/source-analysis/claude-code-analysis/analysis/04b-tool-call-implementation.md`、`docs/research/source-analysis/claude-code-analysis/analysis/02-security-analysis.md`。
* Claude Code 的 prompt 系统包含偏 coding task 的行为规则，例如改代码前先读文件、避免过度设计、遇到失败先诊断再换策略。证据：`docs/research/source-analysis/claude-code-analysis/analysis/04g-prompt-management.md`。
* OpenCode 把 coding workflow 拆成角色：`build` 处理编程任务，`plan` 创建/更新实施计划但不直接改源码，`explore` 是只读代码侦察 agent。权限规则由 defaults、agent policy 和 user config 合并。证据：`docs/research/source-analysis/learn-opencode/docs/packages/opencode/01-agents-and-permissions.md`。
* OpenCode 的主生命周期是 server-driven：用户输入更新 session state，loop 收集上下文、组装 prompt、调用 LLM、执行工具，并流式同步状态。证据：`docs/research/source-analysis/learn-opencode/docs/flow/agent_lifecycle.md`。
* Pi 刻意保持小核心，把 plan mode、permission gates、subagents、custom compaction、git checkpointing 和 sandbox 行为放进 extensions/packages。它也支持 active tool filtering，并强调文件变更工具需要共享队列来避免并发覆盖。证据：`docs/research/repomix/pi-focused-context.xml`。

### Guga 仓库约束

* `packages/core/src/loop/agent-loop.ts` 已经负责 provider turns、tool execution、context compaction 和 durable run events。coding task orchestration 应包在它上面，而不是 fork 第二套 core loop。
* `packages/profile-code-agent/src/profile.ts` 明确要求 code profile 先理解仓库再编辑，使用 read/search/git tools 形成 grounded plan，并在行为变更后运行验证。
* `packages/profile-code-agent/src/bundle.ts` 已经组合 default core capabilities、按配置启用的 skills/MCP、ops/audit/eval plugins 和 code-agent permission policy。
* `packages/profile-code-agent/src/test-discovery.ts` 已有第一版验证命令发现能力，但还没有绑定 changed-file/package scope，也没有被 controller 强制执行。
* `packages/core/src/builtins/filesystem.ts`、`packages/core/src/builtins/shell.ts` 和 `packages/core/src/builtins/git.ts` 已经提供所需的一方工具和 permission metadata。
* `packages/cli/src/commands/run.ts` 当前创建 session 并启动单次 run。它还没有拥有多阶段 autonomous task lifecycle。

### 可行方案

**方案 A：在现有 Code Profile 之上增加自动任务 Controller**（推荐）

* 工作方式：在 `profile-code-agent` 附近增加 autonomous code task controller。默认 code profile 收到编程任务时自动进入 controller；controller 创建 scout/plan/execute/repair 的 runs，管理 task state，运行验证命令，并且只在测试通过或预算耗尽时停止。
* 优点：复用现有 core loop、tools、permissions、JSONL sessions 和 CLI host。保持 core 通用。可以用 mocked providers 和 shell backends 做稳定测试。
* 缺点：controller 需要定义清晰接口，用于启动 runs、注入上下文、收集 changed files/test results。

**方案 B：在 Core 中加入专用 AgentLoop Mode**

* 工作方式：把 coding-task phases 直接加入 `AgentLoop` 或 `AgentRuntime`，让 max-turn 行为、测试和完成状态变成 core runtime 的一等行为。
* 优点：集中控制更强，provider/tool/test events 之间的层级更少。
* 缺点：违背现有 code-agent 需求中“core 不拥有 coding-specific flow”的约束。未来非代码 profile 会被迫继承无关复杂度。

**方案 C：多 Agent Pipeline**

* 工作方式：实现类似 OpenCode 的 `explore`/`plan`/`build`/`review` agents，或类似 Claude Code 的 subagents，每个角色拥有不同工具和权限。
* 优点：角色边界清晰，未来扩展性好。
* 缺点：对 MVP 过大。Guga 已有 delegation primitives，但稳定多 agent coding system 还需要 worktree/session 隔离、merge strategy 和更强 supervision。

## 技术方案

采用 **方案 A：在现有 Code Profile 之上增加自动任务 Controller**。

建议的产品形态是：

```text
Natural coding task input
  -> Code profile detects executable coding task
  -> AutonomousCodeTaskController creates task session
  -> Scout run: read-only search and repo context
  -> Plan run: structured plan artifact
  -> Execute run: edit source/tests through permission runtime
  -> Verify step: controller runs focused commands
  -> Repair loop: failed output becomes next run input
  -> Complete only when all verification passes
```

### MVP 组件

* `AutonomousCodeTaskController`：负责 task attempts、phase transitions、verification、failure budgets 和最终完成状态。
* `TaskPlan` schema：模型输出的结构化实施计划与测试计划。
* `VerificationPlan` / `VerificationResult`：规范化 command、cwd/package、confidence、stdout/stderr preview、exit code 和 status。
* 测试命令发现升级：根据 changed files、package scripts 和 root workspace scripts 推断 package-local commands。
* CLI/host 集成：保持自然任务输入体验；attempts、max turns、verification scope、permission profile 等作为内部默认值或后续可配置项，不作为 MVP 用户入口前置条件。
* task lifecycle 事件或 operation facts：plan created、attempt started、edit observed、test started/failed/passed、completed/blocked。

### 建议阶段流

1. **侦察**：只启用只读工具。输出相关文件、现有测试、package scripts 和约束。
2. **计划**：生成 `TaskPlan`；交互模式可要求用户确认。
3. **执行**：启用 write/edit 和受控 shell。agent 实现源码和测试。
4. **验证**：controller 运行发现到的命令。如果没有发现测试，要求 agent 新增测试或带理由标记 blocked。
5. **修复**：失败时，将精简失败输出和 diff summary 回灌给 agent。
6. **完成**：必须验证通过并生成最终 diff summary。

## 决策（ADR-lite）

**背景**：Guga 已经有通用 agent loop 和 code profile。缺失能力不是另一套 tool call loop，而是能强制计划与验证语义的任务级 controller。

**决策**：把 autonomous coding 做成现有 runtime 之上的 profile/host-level controller。core loop 保持通用；code-specific phases 和 completion criteria 放在 `profile-code-agent` 与 host orchestration 中。MVP 不新增用户必须显式选择的入口；用户直接输入编程任务即可触发。

**影响**：

* Core 继续可复用于 research/review/memory profiles。
* 第一版可以不引入多 agent 复杂度。
* 完成标准由测试支撑，而不是由 prompt 自报支撑。
* 未来 multi-agent/worktree 支持可以替换内部 phases，而不改变“直接输入任务”的用户体验。

## 不在范围

* 多 agent swarm 或并行 worker pool。
* Worktree 隔离和自动创建分支。
* 完整 IDE/LSP 语义代码智能。
* 超出现有 shell/test commands 的浏览器/E2E 自动化。
* 新增独立 `guga code` 命令或要求用户使用 `--autonomous` flag。
* 自动 git commit/push。
* 绕过 permission checks 或允许破坏性 shell/git 操作。
* 保证超出所选测试范围的正确性；最终摘要必须说明剩余风险。

## 开放问题

* 自动任务识别的置信度边界如何设定：低置信度时应直接普通回答，还是先给一个轻量确认提示？

## 实施计划（小 PR）

* PR1：在 `packages/profile-code-agent` 增加 autonomous task types、task state reducer、plan/verification schemas 和测试。
* PR2：把 test discovery 升级为 package-aware focused verification，并补 fixture-based tests。
* PR3：加入 controller orchestration，使用 mocked provider/tool backends 覆盖 scout、plan、execute、verify、repair、complete/block。
* PR4：接入默认 code profile 的任务意图识别、host orchestration 和 event rendering。
* PR5：补 docs/help text，以及 happy path、测试失败修复、blocked path、permission denial 的集成测试。
