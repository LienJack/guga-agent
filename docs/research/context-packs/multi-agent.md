# Multi-Agent Context Pack

## 问题边界

本 Context Pack 覆盖以下子问题：

1. **Subagent 生成 (Spawning)** — 主 Agent 如何创建子 Agent，入口 API 形态
2. **上下文隔离 (Context Isolation)** — 子 Agent 看到什么、看不到什么
3. **协调器模式 (Coordinator Patterns)** — 主线程如何变成调度器
4. **并行执行 (Parallel Execution)** — 并发限制、批次策略、线程池
5. **Trace 传播 (Trace Propagation)** — 父子 Agent 之间的关联标识
6. **权限继承 (Permission Inheritance)** — 子 Agent 的工具/权限边界
7. **委派协议 (Delegation Protocols)** — 任务结果回流、通信机制、中断传播

不覆盖：Memory/Skill 子系统（见 memory context pack）、MCP/Plugin 扩展（见 tools context pack）。

---

## 参考项目与版本

| 项目 | Commit | 语言 | Multi-Agent 成熟度 |
|------|--------|------|-------------------|
| claude-code | `3d7b32f` | TypeScript | ★★★★★ 三层体系（subagent/coordinator/swarm） |
| hermes-agent | `dd0923b` | Python | ★★★★ delegate_task + MoA + Background Review |
| deer-flow | `84f88b6` | Python (LangGraph) | ★★★ Lead→Sub 单层委派 + Middleware 兜底 |
| opencode | `caf1151` | TypeScript/Go | ★★ 静态多 Agent（primary/subagent 模式声明） |
| deepagentsjs | `7c33a86` | TypeScript | ★★ DAG-based pipeline orchestration |

---

## 必读分析材料

| 文件 | 一句话摘要 |
|------|-----------|
| `docs/research/source-analysis/claude-code-analysis/analysis/04h-multi-agent.md` | Claude Code 三层 multi-agent runtime 全解剖：AgentTool 统一入口、coordinator 模式切换、swarm teammates + mailbox + task list 协作 |
| `docs/research/source-analysis/deerflow-book/chapters/08-subagent-overview.md` | DeerFlow Lead→Sub 单层委派架构：task 工具 API、两种 SubAgent 类型、上下文隔离哲学、sandbox 共享 |
| `docs/research/source-analysis/deerflow-book/chapters/09-subagent-executor.md` | SubagentExecutor 双线程池（scheduler+execution）、五状态机、超时控制、asyncio.run 桥接 |
| `docs/research/source-analysis/deerflow-book/chapters/10-orchestration.md` | 并发调度：SubagentLimitMiddleware 硬截断 + Prompt 软引导 + 多批次执行策略 |
| `docs/research/source-analysis/hermes-wiki/concepts/multi-agent-architecture.md` | Hermes 三机制：delegate_task (并行子任务)、MoA (多模型协同)、Background Review (自动 skill 提炼) |
| `docs/research/source-analysis/hermes-wiki/concepts/parallel-tool-execution.md` | 工具级并行：三层安全检测 + 路径作用域分析，保守降级策略 |
| `docs/research/source-analysis/hermes-wiki/concepts/interrupt-and-fault-tolerance.md` | 中断传播到子代理、凭证池轮换、Fallback 模型链、Gateway 重启自动续跑 |
| `docs/research/source-analysis/learn-opencode/docs/packages/opencode/01-agents-and-permissions.md` | OpenCode 静态多 Agent：primary/subagent 模式 + 三层权限合并 + glob 匹配 |
| `docs/research/source-analysis/learn-opencode/docs/cookbook/01-create-custom-agent.md` | 自定义 Agent 配置：JSON 或 Markdown frontmatter 定义，权限沙箱最小化 |

---

## 必读源码文件

### Claude Code (TypeScript)

| 路径 | 职责 |
|------|------|
| `src/tools/AgentTool/AgentTool.tsx` | 多 Agent 统一入口：schema 含 subagent_type / team_name / name / mode |
| `src/tools/AgentTool/runAgent.ts` | Agent 执行器：MCP 初始化 → hook → sidechain transcript → query() |
| `src/tools/AgentTool/forkSubagent.ts` | Fork 模式：继承父 prompt 字节（prompt cache 稳定） |
| `src/coordinator/coordinatorMode.ts` | Coordinator 模式：system prompt 重写主线程为 dispatcher |
| `src/tools/shared/spawnMultiAgent.ts` | spawnTeammate() 共享模块 |
| `src/utils/swarm/spawnInProcess.ts` | 同进程 teammate：AsyncLocalStorage 上下文隔离 |
| `src/utils/swarm/inProcessRunner.ts` | in-process runner：权限桥接 + tryClaimNextTask() |
| `src/utils/teammateMailbox.ts` | 文件式 inbox：lockfile 并发安全 |
| `src/utils/swarm/leaderPermissionBridge.ts` | 权限回流：teammate ask → leader UI queue |
| `src/tools/SendMessageTool/SendMessageTool.ts` | 消息路由器：本地 resume / mailbox / broadcast |
| `src/tools/TeamCreateTool/TeamCreateTool.ts` | 创建 team file + task list |

### Hermes (Python)

| 路径 | 职责 |
|------|------|
| `tools/delegate_tool.py` | delegate_task 实现：单任务/批量模式、工具集取交集再减黑名单 |
| `tools/mixture_of_agents_tool.py` | MoA：4 参考模型 + 1 聚合器，asyncio.gather 并发 |
| `run_agent.py` | 主循环：IterationBudget、_active_children_lock、中断传播 |

### DeerFlow (Python)

| 路径 | 职责 |
|------|------|
| `backend/src/subagents/executor.py` | SubagentExecutor：双线程池、状态机、asyncio.run 桥接 |
| `backend/src/subagents/registry.py` | 注册表：builtin subagent configs + runtime override |
| `backend/src/subagents/builtins/` | general-purpose / bash 两种配置 |
| `backend/src/tools/task_tool.py` | task 工具：创建 SubAgent 的唯一入口 |
| `backend/src/middleware/subagent_limit.py` | SubagentLimitMiddleware：after_model 截断超额 task 调用 |

### OpenCode (TypeScript)

| 路径 | 职责 |
|------|------|
| `packages/opencode/src/agent/agent.ts` | Agent 定义：Info schema + 内置 agents (build/plan/explore/general) |
| `packages/opencode/src/permission/` | 权限系统：PermissionNext.merge 三层合并 |

---

## 关键抽象

### 1. Subagent 生成模式对比

| 维度 | Claude Code | Hermes | DeerFlow | OpenCode |
|------|------------|--------|----------|----------|
| 入口 API | AgentTool (统一) | delegate_task (工具) | task (工具) | 静态声明 (config) |
| 嵌套深度 | teammate 不能再 spawn teammate；fork 不限 | MAX_DEPTH=2（可配 3） | 1（严格单层） | 不支持动态委派 |
| 并发限制 | 无硬限制（swarm 自由） | MAX_CONCURRENT_CHILDREN=3 | MAX_CONCURRENT_SUBAGENTS=3 [2,4] | N/A |
| 后台运行 | run_in_background=true | 阻塞（父等结果） | execute_async() 异步 | N/A |
| Agent 类型选择 | subagent_type + model 字段 | 单一模型（可覆盖 provider） | general-purpose / bash | primary / subagent 模式 |

### 2. 上下文隔离模型

```
Claude Code:
  普通 subagent  → 继承部分 context + 工具池（非完整对话历史）
  fork child    → 继承完整父 conversation + 已渲染 system prompt 字节
  teammate      → 完全隔离，通过 mailbox/SendMessage 通信

Hermes:
  子代理 → 对话历史完全隔离（空白开始）
         → 继承 model/provider/cwd/credential pool
         → 不继承 memory、context files

DeerFlow:
  Sub-Agent → 对话上下文完全隔离（只收一条 HumanMessage）
           → 共享沙箱（lazy_init=True 复用父 sandbox）
           → 共享 thread_data（路径计算）

OpenCode:
  subagent 模式 → 静态隔离（explore/general 各有独立权限规则集）
              → 无运行时动态委派
```

### 3. 协调器模式（Coordinator）

**Claude Code 独有设计**：通过环境变量 `CLAUDE_CODE_COORDINATOR_MODE` 将主线程切换为纯调度角色：
- System prompt 重写："You are an AI assistant that **orchestrates** across multiple workers"
- Worker 结果以 `<task-notification>` XML 标签回流（user-role message）
- 显式分相：Research → Synthesis → Implementation → Verification
- 写操作按文件集串行，研究任务可并行

**DeerFlow 近似**：Lead Agent 通过 Prompt 三步法（DECOMPOSE → DELEGATE → SYNTHESIZE）引导，但不改变主线程身份。

### 4. 通信协议

| 机制 | Claude Code | Hermes | DeerFlow |
|------|------------|--------|----------|
| 结果回传 | task-notification XML / transcript | Future.result() 线程返回值 | 轮询 _background_tasks 字典 |
| 进程间消息 | mailbox 文件（JSON + lockfile） | 无（单进程） | 无（单进程） |
| 实时进度 | useInboxPoller 周期轮询 | N/A | stream_writer task_running 事件 |
| 权限协商 | leaderPermissionBridge / mailbox fallback | 无（子 agent 无 clarify 权限） | 无 |
| 中断传播 | abort + shutdown request | _active_children_lock + propagate | 无（超时由 scheduler 控制） |

### 5. 权限继承规则

```
Claude Code:
  - teammate 权限 ask → 回流到 leader 的 ToolUseConfirmQueue（带 workerBadge）
  - bridge 不可用时退回 mailbox 权限同步
  - teammate 不能无限嵌套 → 拓扑约束

Hermes:
  - 子代理工具集 = (用户指定 ∩ 父级可用) - DELEGATE_BLOCKED_TOOLS
  - 永远不能获得比父级更多的工具
  - 禁止：delegate_task, clarify, memory, send_message, execute_code

DeerFlow:
  - disallowed_tools: [task, ask_clarification, present_files]
  - 其余工具全继承（general-purpose）或白名单（bash）

OpenCode:
  - PermissionNext.merge(defaults, agent, user) 三层合并
  - explore agent: "*": "deny" + 白名单只读工具
  - 用户配置永远最高优先级
```

### 6. 并行执行策略

| 层面 | 实现方式 |
|------|---------|
| **Agent 级并行** (DeerFlow) | Prompt 引导多批次 + SubagentLimitMiddleware after_model 截断 |
| **Agent 级并行** (Hermes) | ThreadPoolExecutor(max_workers=3) + as_completed 收集 |
| **Agent 级并行** (Claude Code) | 自由 spawn，swarm teammates 各自独立 claim task |
| **工具级并行** (Hermes) | 三层安全检测：NEVER_PARALLEL → PATH_SCOPED 路径冲突 → PARALLEL_SAFE |
| **工具级并行** (Claude Code) | 无智能检测，全并行 |

---

## 已确认事实

1. **Claude Code 的 multi-agent 是三层体系**，不是单一 "AgentTool"。普通 subagent、coordinator mode、swarm teammates 各有独立运行逻辑和状态面。

2. **DeerFlow 刻意选择单层委派**（Sub-Agent 不能再 delegate），理由是避免递归复杂度和资源消耗。上下文隔离是"需求文档模式"——prompt 必须自包含。

3. **Hermes 的 delegate_task 是同进程阻塞式**——父 Agent 等待所有子 Agent 完成才继续。单任务时连线程池都不用。子 Agent 之间**完全不通信**。

4. **Claude Code 的 fork 模式保留父 prompt 的原始字节**，目的是 prompt cache 命中稳定性，不是逻辑正确性。说明 multi-agent 与 caching 深度耦合。

5. **Claude Code swarm 不是内存态**——有 team file、task list、mailbox 三份持久状态。Agent 协作靠 work queue (claim task) 而非纯消息。

6. **Hermes 工具级并行有路径冲突检测**（前缀重叠检查），其他项目（Claude Code / OpenCode）全并行无检测。

7. **所有项目的子 Agent 都禁止递归委派或有深度限制**。Claude Code 的 teammate 不能再 spawn teammate；Hermes MAX_DEPTH=2；DeerFlow 硬性单层。

8. **OpenCode 是唯一采用静态多 Agent 的项目**——Agent 在配置时确定，运行时不动态创建。explore/general 是 subagent 模式但由主 Agent 在对话中调度。

---

## Guga 迁移判断

### 推荐采用（Phase 1 — MVP）

| 设计 | 来源 | 理由 |
|------|------|------|
| **单层委派 + 统一 task 工具入口** | DeerFlow | 复杂度最低，Guga 初期不需要 swarm。一个 `delegateTask(goal, context, toolsets)` 即可 |
| **上下文完全隔离 + prompt 自包含** | DeerFlow/Hermes | 避免子 Agent 被无关上下文污染，推理质量更高 |
| **工具集取交集再减黑名单** | Hermes | 子 Agent 永远不能获得比父级更多的权限，安全边界清晰 |
| **迭代预算隔离** | Hermes IterationBudget | 父子各有独立预算，防止子 Agent 无限消耗 |
| **trace_id 贯穿父子** | DeerFlow | 一个 ID 串联整个委派链路，调试必备 |
| **Prompt 引导 + Middleware 兜底** | DeerFlow | "软引导 + 硬截断"双重机制比纯靠 prompt 可靠 |

### 推荐采用（Phase 2 — 增强）

| 设计 | 来源 | 理由 |
|------|------|------|
| **Coordinator 模式（prompt 切角色）** | Claude Code | 当 Guga 需要处理大型任务时，把主线程变成纯 dispatcher 效果好 |
| **中断传播** | Hermes/Claude Code | 用户 Ctrl+C 必须能级联中止子 Agent |
| **工具级并行 + 路径冲突检测** | Hermes | 安全且高效，避免同时写同一文件的竞态 |
| **任务状态机（PENDING/RUNNING/COMPLETED/FAILED/TIMED_OUT）** | DeerFlow | 清晰的生命周期管理 |

### 暂不采用

| 设计 | 来源 | 理由 |
|------|------|------|
| Swarm teammates + mailbox + team file | Claude Code | 系统复杂度极高（横跨工具层/任务层/UI 层/权限层），Guga 初期无此需求 |
| Mixture of Agents (多模型协同) | Hermes | 5 个 API 调用成本高，且场景有限（数学/高难推理） |
| Background Review 自动 fork | Hermes | 依赖成熟的 skill/memory 子系统，Guga 尚未具备 |
| 静态多 Agent 配置 | OpenCode | 灵活性不足，Guga 需要运行时动态委派 |

### Guga 最小实现建议

```typescript
// 核心接口
interface DelegateTaskInput {
  goal: string;              // 自包含任务描述
  context?: string;          // 背景信息
  toolsets?: string[];       // 可用工具集（取交集）
  maxIterations?: number;    // 独立迭代预算
  traceId?: string;          // 父传子的追踪 ID
}

interface DelegateTaskResult {
  status: "completed" | "failed" | "timed_out";
  summary: string;           // 父只看摘要
  duration: number;
  toolTrace?: ToolTraceEntry[];  // 轻量执行记录
}

// 关键约束
const BLOCKED_TOOLS = ["delegateTask", "clarify", "memory"];
const MAX_CONCURRENT = 3;
const DEFAULT_TIMEOUT = 900; // 15 min
```

---

## 待验证问题

1. **Guga 的运行环境是单进程还是多进程？** — 决定用 ThreadPool（同 Hermes/DeerFlow）还是 AsyncLocalStorage（同 Claude Code in-process）
2. **Guga 是否需要支持子 Agent 和父 Agent 操作同一文件系统？** — 如果是，需要路径冲突检测（参考 Hermes `_paths_overlap`）
3. **Guga 的 prompt cache 策略是什么？** — 如果使用 Anthropic，fork 模式保留父 prompt 字节的技巧值得考虑
4. **Guga 是否有 UI 层需要展示子 Agent 进度？** — 决定是否需要 stream_writer 实时事件推送
5. **Guga 的 Agent 定义是配置文件还是代码？** — 影响是走 OpenCode 的 JSON/Markdown 方式还是 Hermes 的纯代码方式
