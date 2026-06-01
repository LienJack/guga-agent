# 超长编程任务设计调研：pi、Claude Code、OpenCode

## 一句话结论

Guga 处理“超级长任务”不应该只做一个更长的 prompt 或一个更大的 todo，而应该组合五个可恢复结构：**显式计划、可结算执行单元、append-only 会话账本、上下文压缩检查点、收尾检查门**。pi 最适合参考“树形会话 + 可扩展 compaction”，Claude Code 最适合参考“plan/task/sidechain/resume 的重型运行时”，OpenCode 最适合参考“server source of truth + session part/todo/permission 的状态投影”。

## 研究范围

本次只比较用户点名的三个参考项目：

| 项目 | 本次主要关注 | 证据路径 |
| --- | --- | --- |
| pi | plan mode、JSONL 树形 session、compaction、branch summary、retry、队列与 extension hooks | `docs/research/repomix/pi-token-tree.txt`、`docs/research/repomix/pi-focused-context.xml`、外部参考仓库 `agent-ref/pi/packages/coding-agent/examples/extensions/plan-mode/*` |
| Claude Code | plan mode、task/subagent、tool pipeline、auto-compact、append-only transcript、resume、review | `docs/research/context-packs/agent-loop.md`、`docs/research/context-packs/context-compression.md`、`docs/research/source-analysis/claude-code-analysis/analysis/*`、Claude Code Graphify/Understand 图 |
| OpenCode | primary/subagent agents、plan/todo、session processor、compaction、permission、SSE 状态同步、revert/snapshot | `docs/research/context-packs/agent-loop.md`、`docs/research/context-packs/tool-registry.md`、`docs/research/source-analysis/learn-opencode/docs/*`、OpenCode Graphify/Understand 图 |

说明：pi 没有可用的 Graphify / Understand 图，本次按项目指令从 token tree 进入 focused context，只在 plan-mode 细节不足时打开了一个具体 raw 目录。

## 与现有 Guga 文档的关系

本文是 `docs/brainstorms/2026-05-29-autonomous-code-task-loop-requirements.md` 的**超长任务专项研究补充**，不替代那份自动编程任务闭环需求。优先级关系如下：

- 需求范围、用户入口、角色、任务状态机、工具覆盖、权限和测试策略，以 `docs/brainstorms/2026-05-29-autonomous-code-task-loop-requirements.md` 为准。
- 本文补充“超长任务为什么需要 durable event、计划账本、checkpoint、恢复投影、验证门”的参考项目证据和设计取舍。
- 后续进入 `ce-plan` 时，应把本文的 component mapping、settlement contract 和 recovery matrix 合并回 code-agent 计划，而不是创建一套独立的长任务 runtime。

## 项目对比

| 维度 | pi | Claude Code | OpenCode | Guga 建议 |
| --- | --- | --- | --- | --- |
| 长任务基本形态 | 会话是 JSONL 树；同一 session 内可 `/tree` 分支、`/fork`、`/clone`、`/resume`。 | 会话是 append-only transcript；普通 subagent、coordinator、swarm/team 并存，长任务可拆成 task/sidechain。 | Server 维护 session source of truth；primary agent、subagent、plan/explore/build 模式分工。 | 采用 append-only event/session store，并允许同一任务树内分支，不把“继续做”绑定到单条线性聊天。 |
| 计划机制 | plan mode 是扩展示例：只读工具集、bash allowlist、从 `Plan:` 提取步骤，用 `[DONE:n]` 标记完成。 | plan mode 是一等产品面；Enter/Exit plan mode、plan approval、TodoWrite、Task*、ultraplan 都进入工具和 UI。 | 内置 `plan` agent，仅能编辑 `.opencode/plan/*.md`；todo 工具维护任务进度。 | MVP 做“计划为可持久 artifact + 逐步结算”，不是只展示 markdown 文本。 |
| 执行循环 | `AgentSession.prompt()` 驱动 agent，支持 steering/follow-up 队列；post-run 处理 retry 与 compaction。 | AsyncGenerator/yield 事件流 + tool execution pipeline；并发分批、权限、hook、result 回流完整。 | `SessionProcessor.process()` 内部 while loop；状态变化经 SSE/JSON Patch 推给 UI。 | 执行器要有阶段事件：plan、tool_start、tool_end、context_pressure、checkpoint、verify。 |
| 工具与权限 | before/after tool hook、active tools 可动态切换；plan mode 通过工具过滤和 bash allowlist 限制破坏性操作。 | Tool 协议对象包含安全、并发、UI、权限、hook；默认 fail-closed。 | 每个 agent 有 permission ruleset；`ask/once/always/reject` 和插件 `permission.ask`。 | 工具执行必须先过权限/策略，再执行；plan/research 阶段默认只读。 |
| 上下文管理 | `contextTokens > contextWindow - reserveTokens` 触发；默认 reserve 16384、keep recent 20000；支持 split turn、previous summary、file ops。 | Auto-compact 在窗口边界前触发，保留 summary 预算；PTL fallback、summary quality、post-compact file/plan/skill/tools 重注入。 | Session compaction + prune；Part 系统可细粒度记录 text/tool/reasoning/error，UI 有 context usage 展示。 | 采用阈值压缩 + 溢出恢复双通道；压缩后必须重注入当前计划、活动文件、工具、权限与下一步。 |
| 会话恢复 | JSONL v3，entry 用 `id/parentId` 组成树；`buildSessionContext()` 从 leaf 回溯，compaction summary + kept messages 重建上下文。 | `/resume` 不是简单读消息，而是恢复 metadata、fileHistory、worktree、agent、sidechain，并修复 compact/snip/tool-result 链。 | Server/session 数据结构含 parentID、summary、permission、revert；session list/delete/restore/warp workspace。 | 恢复层要负责修复和重建运行时，不让写入层承担复杂事务。 |
| 分支与替代路径 | `/tree` 可在同一 JSONL 内探索替代路径；切换离开的 branch 可生成 branch summary。 | fork/subagent/teammate sidechain 独立 transcript，主会话接收结果或 task notification。 | 子会话/parentID 和 subagent task；复杂任务建议用 child session 隔离上下文。 | 支持“探索分支”和“执行分支”分离，分支切换时用 summary 而非复制全部历史。 |
| 检查与收尾 | plan-mode 示例有 `[DONE:n]`，但检查门主要依赖扩展和用户流程。 | 有 review / security-review / ultrareview、TaskOutput、TaskUpdate、Plan approval 等完整工作台面。 | 有 `code-reviewer` 自定义 agent 示例、review UI、session summary diff、revert/snapshot。 | 增加明确 verify gate：测试、diff 审查、计划覆盖率、未完成项、风险说明。 |
| UI/状态投影 | TUI status 可显示 plan-mode 完成度，session picker/tree 支持回看。 | 虚拟消息列表、任务面板、计划审批、权限请求、后台任务可视化。 | 前端是 server 状态镜像，SSE + JSON Patch，session/todo/permission/review 面板。 | 长任务 UI 不只显示聊天，要显示队列、计划、上下文压力、检查结果和可恢复点。 |

## 可借鉴模式

### 1. 计划不是文本，而是“可结算工作账本”

- `Fact`：pi 的 plan-mode 示例会从 `Plan:` 区块提取编号步骤，并用 `[DONE:n]` 标记完成；同时 plan mode 只开放 `read`、`bash` 等只读能力，阻断 edit/write 和危险 bash。
- `Fact`：Claude Code 有 PlanApprovalMessage、Enter/Exit plan mode、TodoWriteTool、TaskCreate/TaskUpdate/TaskList/TaskOutput 等工具族。
- `Fact`：OpenCode 有 `plan` agent、`todo` 工具和 per-agent permission ruleset。

Guga 落点：把计划拆成 `plan_item`，每个 item 有 `status`、`evidence`、`changed_files`、`verification`、`risks`。模型可以更新状态，但不能靠一句“完成了”结算，必须绑定工具输出或 diff/test 证据。

### 2. 长任务需要双层执行：主循环 + post-run 管理器

- `Fact`：pi 的 `AgentSession` 在 agent run 后统一处理 retry、context overflow、threshold compaction，并可能 `agent.continue()` 续跑队列。
- `Fact`：Claude Code 的 tool pipeline 在 tool_use 后执行 schema、validate、hook、permission、call、tool_result，再回流下一轮。
- `Fact`：OpenCode 的 session processor 使用循环处理 LLM stream、tool call、part update 和 session status。

Guga 落点：主循环只负责“模型下一步”；post-run 管理器负责“是否该重试、压缩、继续队列、暂停等待用户、触发检查”。这样避免把所有长任务规则塞进 prompt。

### 3. 压缩应该生成可继续工作的 checkpoint，而非普通摘要

- `Fact`：pi compaction summary 固定包含 Goal、Constraints、Progress、Key Decisions、Next Steps、Critical Context、read-files、modified-files。
- `Fact`：pi 支持 split turn：单个超大 turn 超过保留预算时，单独摘要 turn prefix，并保留 suffix。
- `Fact`：Claude Code post-compact 会重注入正在查看的文件、进行中的 Plan、Skill 状态和工具声明。
- `Inference`：OpenCode 的 Part 系统让 text/tool/reasoning/error 可以被细粒度压缩和呈现，但其资料里对“压缩后重注入计划”的细节不如 Claude Code 明确。

Guga 落点：checkpoint 摘要至少包含：目标、约束、已完成、进行中、阻塞、关键决策、下一步、活动文件、修改文件、未验证风险、当前工具/权限状态。

### 4. 会话账本应 append-only，恢复复杂性放到 reader

- `Fact`：pi session 是 JSONL，entry 有 `id/parentId`，`buildSessionContext()` 从当前 leaf 回溯并处理 compaction / branch summary。
- `Fact`：Claude Code transcript 是 append-only JSONL；写入层简单，resume 层修复链路、恢复 metadata/fileHistory/contextCollapse/worktree/agent。
- `Fact`：OpenCode session 以 server 端状态为事实源，前端只是状态镜像；session 里有 parentID、summary、permission、revert。

Guga 落点：不要用“当前 messages 数组”作为唯一事实源。事件日志是事实，模型输入是 projection，UI 是 projection，恢复是 projection 重建。

### 5. 分支/子任务是长任务降熵手段

- `Fact`：pi `/tree` 在同一 session 文件内分支，离开分支时可保存 branch summary。
- `Fact`：Claude Code 有普通 subagent、coordinator-workers、swarm teammates，并通过 sidechain transcript 隔离上下文。
- `Fact`：OpenCode 内置 `explore`、`general` subagent，并建议复杂任务用 child session。

Guga 落点：默认不要让一个 agent 在同一上下文里同时做研究、实现、验证。至少拆成 `research/plan`、`implement`、`verify` 三种可审计阶段；后续再引入 subagent 并行。

## 不建议照搬

| 不建议照搬 | 原因 | 替代建议 |
| --- | --- | --- |
| Claude Code 全量 swarm/team/runtime | 功能面过重，早期会把 Guga 的核心 session/event/context 边界冲散。 | 先做单 agent + plan ledger + checkpoint，再加 subagent sidechain。 |
| OpenCode 完整 server-driven push 产品形态 | 如果 Guga 初期 CLI/本地优先，SSE/JSON Patch 前端镜像会提高基础设施成本。 | 保留事件协议和状态 projection 设计，UI 同步机制可后置。 |
| pi 的 plan mode 仅作为扩展示例 | 它证明机制可行，但不是强制工作流，缺少硬性 verify gate。 | 吸收其只读探索/计划提取思路，把验证和收尾做成核心任务阶段。 |
| 只靠 token 阈值压缩 | 超长任务失败常来自 plan/文件/权限状态丢失，不只是 token 不够。 | 阈值压缩 + 溢出恢复 + post-compact reinjection + checkpoint audit。 |
| 让模型自由声明“完成” | 长任务最容易出现遗漏步骤和未验证完成。 | `[DONE]` 或 `TaskUpdate` 必须绑定 evidence：命令输出、diff、review note、用户确认。 |

## Guga 落点

### 建议的超长任务运行时骨架

```text
TaskSession
  ├─ EventLog(JSONL append-only)
  ├─ PlanLedger(plan items + evidence + status)
  ├─ ExecutionLoop(model turn + tool pipeline)
  ├─ PostRunManager(retry / compact / queue / pause)
  ├─ ContextPolicy(projected model input)
  ├─ Checkpoint(compaction + branch summary + active state)
  └─ VerificationGate(diff / tests / review / coverage checklist)
```

### Guga Component Mapping

| 研究骨架 | 现有 Guga 落点 | 责任边界 | 不能做什么 |
| --- | --- | --- | --- |
| `TaskSession` | `packages/profile-code-agent` task controller | 分类自然编程任务，编排 scout/plan/execute/repair/verify 阶段，维护 active objective 和 task lifecycle。 | 不绕过 core runtime，不直接执行 shell 或文件写入。 |
| `EventLog` | `packages/core` durable event contract + `packages/plugin-session-jsonl` | 记录 task、tool、permission、projection、verification、checkpoint 等事实；JSONL 插件负责 append-only、revision、hash-chain 诊断。 | 不把当前 messages 数组当唯一事实源。 |
| `PlanLedger` | `packages/profile-code-agent` contract，必要时沉淀为复用 task package | 保存 plan item、状态、证据、验证尝试、风险和阻塞原因；作为 context reinjection source。 | 不在 core 里硬编码 code-agent 计划语义。 |
| `ExecutionLoop` | `packages/core` `AgentLoop` / `ExecutionPipeline` / `ToolScheduler` | provider-neutral loop、tool intent、schema、hook、permission、timeout、result policy、model-visible observation。 | profile 不能绕过权限和工具事件自行执行工具。 |
| `PostRunManager` | `packages/profile-code-agent` controller + core provider/router events | 根据 run result 判断 retry、compact、continue queued input、repair、blocked 或 verify。 | 不把 retry/compaction 决策塞进 prompt 当软约束。 |
| `ContextPolicy` | M4 context policy / projection contract | 生成 `ModelInputProjection`，区分 durable facts、model-visible messages、tool previews、artifacts、plan/todo、summary。 | 不替代 event log，不让摘要成为唯一事实源。 |
| `Checkpoint` | M4 compaction + `plugin-session-jsonl` session facts + artifact store | 写 compact boundary、summary、retained sources、active files、plan/todo、tool/permission state、projection hash。 | 不静默截断，不破坏 tool call/result 配对。 |
| `VerificationGate` | `packages/profile-code-agent` verification attempts through runtime tool invoker | 主动运行 required verification，完成证据必须引用 passing attempt。 | 不接受“模型说完成了”作为最终完成条件。 |

### 最小闭环

1. 任务开始时生成或确认 `PlanLedger`，每项有验收口径。
2. 执行时每个 tool call 都写入 event log，结果有 raw / preview / summary。
3. 上下文超过阈值前写入 checkpoint，并重建模型输入为 `summary + active plan + recent tail + active files/tools`。
4. 若 provider 返回 context overflow，移除失败 assistant message，执行 compact，再对当前用户意图重试一次。
5. 每个计划项完成时要求 evidence；任务结束前跑 verification gate。
6. resume 时从 event log 重建：当前 leaf、active plan、模型/思考等级、工具/权限、活动文件、未完成验证。

### Plan Item Settlement Contract

`PlanLedger` 的核心不是列表展示，而是防止长任务“看起来完成、实际上漏项”。建议每个 plan item 至少遵守下面的状态流转：

```text
pending -> in_progress -> evidence_submitted -> verified -> done
                                  └────────────> blocked
                                  └────────────> in_progress
```

| 字段 | 要求 |
| --- | --- |
| `id` | 稳定 ID，写入 task/session event，压缩后仍可引用。 |
| `description` | 用户可读的工作项，不包含实现细节猜测。 |
| `status` | 只能取 `pending`、`in_progress`、`evidence_submitted`、`verified`、`done`、`blocked`。 |
| `evidence` | 必须引用至少一种 durable evidence：event id、tool result id、artifact id、diff summary、test/verification attempt id、用户确认事件。 |
| `verification` | 对代码变更项，最终 `done` 必须引用 passing verification attempt；无测试可跑时必须写明替代检查和残余风险。 |
| `changed_files` | 若涉及文件修改，必须来自工具事件或 diff summary，不由模型自由编造。 |
| `risks` | 未验证、部分验证、跳过验证或依赖用户确认时必须保留。 |

状态约束：

- `pending -> in_progress`：agent 开始读取、编辑或验证该项时写事件。
- `in_progress -> evidence_submitted`：模型提交完成证据，但 controller 尚未验证。
- `evidence_submitted -> verified`：controller 验证 evidence 可解析、可回放，且必要 verification attempt 通过。
- `verified -> done`：profile-code-agent 才能把该项计入完成。
- 任意状态 `-> blocked`：必须记录 blocker、需要的用户输入或外部状态变化。
- 禁止直接 `in_progress -> done`，也禁止没有 evidence 的 `done`。

### Recovery Matrix

| 异常场景 | 写入事件 | 投影策略 | 自动动作 | 何时进入 blocked |
| --- | --- | --- | --- | --- |
| Provider context overflow / prompt too long | `context_pressure`、`provider_error`、`compact_start/end` | 移除失败 assistant message 的模型可见投影，保留原始失败事实；投影 `summary + pending turn + active plan + recent tail`。 | reactive compact 后重试当前用户意图一次。 | compact 失败或重试后再次 overflow。 |
| 未闭合 tool call / tool result 配对损坏 | `conversation_repair` 或 `projection_error` | 保守保留完整轮次；无法修复时拒绝压缩该边界。 | 尝试补 stub、删除孤儿 result，或回退到上一合法 boundary。 | 修复会改变语义或破坏 pending turn。 |
| Permission pending | `permission_requested`、`permission_pending` | 模型输入保留待审批动作、工具名、参数摘要和等待状态，不伪造 tool result。 | 暂停执行，允许用户 approve/deny/cancel。 | 用户拒绝、长时间无响应且任务无法替代推进。 |
| 中断 shell / long-running command | `tool_cancelled`、`process_interrupted`、artifact/output preview | 保留已捕获输出、退出状态 unknown/cancelled、可继续读取的 artifact reference。 | 若命令可重跑且安全，进入 repair/verify 决策；否则询问用户。 | 命令是关键验证且无法安全重跑。 |
| Compact 失败 | `compact_failed`，包含 trigger、boundary、error | 不采用半成品 summary；继续使用上一合法 projection 或更保守 recent-tail projection。 | 可降级到本地 truncation / tool result preview 收缩。 | 无法生成合法 projection 或会丢 pending turn。 |
| JSONL partial final line | `store_diagnostic` recoverable tail | 忽略 partial tail，使用最后完整 event revision 重建。 | 提示可恢复诊断，继续运行前可追加新 revision。 | partial tail 正好包含未持久化的用户确认或关键 tool result 且无法恢复。 |
| JSONL middle corruption / hash-chain mismatch | `store_diagnostic` blocking corruption | 停止自动投影，不基于不可信日志继续执行。 | 进入只读恢复/导出诊断模式。 | 默认 blocked，需要用户选择修复、截断或恢复备份。 |
| Resume 后 active plan 缺失 | `resume_repair`、`reinjection_missing` | 从 task events、latest checkpoint、verification attempts 重建；若仍缺失，投影恢复问题。 | 尝试从 checkpoint 和 code profile reinjection source 恢复。 | 无法确定当前目标或下一步，继续会误改代码。 |
| Verification evidence 不合格 | `verification_rejected` | 将失败原因投影给 repair 阶段，plan item 回到 `in_progress` 或 `blocked`。 | 触发 repair，最多按 task budget 重试。 | 超过修复预算或缺少必要外部条件。 |

### 最小宿主投影

第一落点应是 **CLI / host-runtime projection**，不是立即复刻 OpenCode 的 local-server/SSE UI。P0 只要求 runtime 事件和 CLI 能稳定展示：

- active objective、当前阶段、PlanLedger 完成度；
- queued steering/follow-up 输入；
- context pressure、compact boundary、latest checkpoint；
- pending permission、running tool、verification attempts；
- blocked reason 和 resume hint。

Local-server / SSE / richer workbench 可以作为 P1/P2 的 host adapter：协议事件先稳定，UI 面板后跟进。

## 覆盖清单

| 能力 | pi | Claude Code | OpenCode | Guga 是否应覆盖 |
| --- | --- | --- | --- | --- |
| 显式计划/计划模式 | 部分，extension plan-mode | 强，一等 plan/task 工具 | 强，plan agent + `.opencode/plan` | P0 |
| Todo/任务状态 | `[DONE:n]` 示例 | TodoWrite + Task* | todo 工具 | P0 |
| 只读探索阶段 | plan-mode 过滤工具 | plan mode / subagent 可限制 | explore agent | P0 |
| 工具权限三态/审批 | hook + active tool 切换 | Tool permission + hooks | ask/once/always/reject | P0 |
| 工具并发安全 | 有 hook，资料未见完整分批 | `isConcurrencySafe()` 分批 | `canExecuteParallel` | P1 |
| Append-only 会话存储 | JSONL tree | JSONL transcript | server/session DB 状态 | P0 |
| Session resume | `/resume` + session picker | 完整恢复流水线 | session list/restore | P0 |
| 分支/fork/clone | `/tree`、`/fork`、`/clone` | fork/subagent sidechain | parentID / child session | P1 |
| 自动 compaction | 阈值 + manual `/compact` | auto-compact + circuit breaker | compaction/prune | P0 |
| Context overflow 恢复 | 一次 compact-and-retry | PTL fallback / compact retry | 有 compaction 示例 | P0 |
| Split-turn 压缩 | 有 | 未在本次资料中确认 | 未在本次资料中确认 | P1 |
| Post-compact 重注入 | summary + kept messages + file ops | 文件/Plan/Skill/Tools 重注入 | Pending Verification | P0 |
| Branch summary | 有 | sidechain/fork 结果回流 | 子会话汇总 | P1 |
| 运行中追加输入 | steering/follow-up queue | queued commands / input orchestration | prompt queue / status sync | P1 |
| Retry/backoff | retryable error + exponential delay | retry/fallback 见 context pack | session retry | P1 |
| 变更撤销/快照 | 未作为核心证据确认 | worktree/fork/subagent 可隔离 | revert/snapshot | P1 |
| 代码检查/review | 扩展/流程层 | review/security-review/ultrareview | review UI / code-reviewer agent | P0 |
| 成本/token 可见性 | `/session` stats | stats/context 命令 | context usage/session stats | P1 |
| 扩展 hook | `session_before_compact`、tool hooks、resources | PreToolUse/PostToolUse/hooks | plugin hooks | P1 |

## 证据

- `Fact`：`docs/research/context-packs/agent-loop.md` 记录 Claude Code 的 AsyncGenerator、OpenCode 的 server-driven loop、工具调度和预算/重试对比。
- `Fact`：`docs/research/context-packs/context-compression.md` 记录 Claude Code auto-compact、PTL fallback、post-compact 重注入，以及 OpenCode compaction/session 相关文件。
- `Fact`：`docs/research/source-analysis/claude-code-analysis/analysis/04f-context-management.md` 说明 Claude Code 有有效窗口、13K buffer、连续失败熔断、PTL 剥离、文件/Plan/Skill/tools 重注入。
- `Fact`：`docs/research/source-analysis/claude-code-analysis/analysis/04i-session-storage-resume.md` 说明 Claude Code 使用 append-only JSONL、metadata entry、subagent sidechain、resume 修复流水线。
- `Fact`：`docs/research/source-analysis/claude-code-analysis/analysis/04b-tool-call-implementation.md` 说明 Claude Code tool pipeline、Tool 协议、fail-closed 默认值、并发分批。
- `Fact`：`docs/research/source-analysis/claude-code-analysis/analysis/04h-multi-agent.md` 说明 Claude Code 普通 subagent、coordinator-workers、swarm teammates 三层多 agent。
- `Fact`：`docs/research/source-analysis/learn-opencode/docs/internals/agent.md` 说明 OpenCode 内置 build/plan/explore/general/compaction/title/summary agents 和 per-agent permission。
- `Fact`：`docs/research/source-analysis/learn-opencode/docs/internals/session.md` 说明 OpenCode session 数据结构、Part 系统、prompt 模板、todo、compaction、child session、revert。
- `Fact`：`docs/research/source-analysis/learn-opencode/docs/flow/state_sync.md` 说明 OpenCode server source of truth、SSE、JSON Patch、前端镜像。
- `Fact`：`docs/research/source-analysis/learn-opencode/docs/internals/permission.md` 说明 OpenCode permission ask/once/always/reject 和插件 hook。
- `Fact`：`docs/research/repomix/pi-focused-context.xml` 中 `packages/coding-agent/docs/compaction.md`、`session-format.md`、`sessions.md`、`src/core/compaction/compaction.ts`、`src/core/agent-session.ts`、`src/core/session-manager.ts` 证明 pi 的 JSONL 树、compaction、branch summary、overflow recovery、queue、retry、extension hooks。
- `Fact`：外部参考仓库 `agent-ref/pi/packages/coding-agent/examples/extensions/plan-mode/README.md`、`index.ts`、`utils.ts` 证明 pi plan-mode 的只读工具、bash allowlist、`Plan:` 提取和 `[DONE:n]` 完成标记。
- `Inference`：Guga 应以 pi 的树形 session / compaction 可扩展性为底座，吸收 Claude Code 的恢复与验证严谨度，借鉴 OpenCode 的 agent mode / permission / UI projection，而不是照搬任一项目的完整产品形态。
- `Pending Verification`：OpenCode 压缩后是否像 Claude Code 一样重注入 active plan / skills / tools，本次资料未提供同等强度证据；若后续要实现，可再打开 `packages/opencode/src/session/compaction.ts` 和相关 prompt 文件做行级确认。
