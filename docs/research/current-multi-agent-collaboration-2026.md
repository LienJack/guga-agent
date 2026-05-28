# 2026 热门多 Agent 协作项目调研与 Guga 落地方案

调研日期：2026-05-28  
源码下载目录：`/Users/lienli/Documents/GitHub/agent-ref/current-multi-agent`

## 一句话结论

Guga 不应该先做 CrewAI/MetaGPT 式“角色公司”或 Claude Code 式 swarm，而应该先做 **单层 `delegateTask` 工具 + 子运行时隔离 + 受控并发 + 事件/trace 贯穿**；第二阶段再引入 handoff/team/workflow 编排，第三阶段才考虑 A2A 远程 Agent 互联。

## 项目对比

### 当前热门候选

GitHub 数据通过 `gh api repos/{owner}/{repo}` 于 2026-05-28 获取。

| 项目 | Stars | Forks | 最近 push | 本地 commit | 代表模式 | 取舍判断 |
|---|---:|---:|---|---|---|---|
| `geekan/MetaGPT` | 68,325 | 8,705 | 2026-01-21 | `11cdf46` | SOP/角色/环境广播 | 概念强，但工程复杂，适合作为反例和长期参考 |
| `microsoft/autogen` | 58,457 | 8,820 | 2026-04-15 | `027ecf0` | group chat/runtime/topic/handoff | 适合学消息拓扑，不适合照搬 runtime |
| `crewAIInc/crewAI` | 52,299 | 7,264 | 2026-05-27 | `c5ea415` | Crew/Task/Process/manager | 产品 API 成熟，可借鉴配置面和层级管理 |
| `agno-agi/agno` | 40,379 | 5,430 | 2026-05-27 | `66ed7fe` | Team/Workflow/AgentOS | 功能全但面很宽，适合学 session/team 参数，不适合早期照搬 |
| `langchain-ai/langgraph` | 33,128 | 5,594 | 2026-05-27 | `66ec594` | StateGraph/Send/checkpoint | 适合学图状态与 fan-out，不建议把 LangGraph 放进 core |
| `openai/openai-agents-python` | 26,703 | 4,110 | 2026-05-26 | `6d5b888` | handoff / agent-as-tool | 最适合 Guga P1/P2 的 API 语义参考 |
| `mastra-ai/mastra` | 24,407 | 2,140 | 2026-05-27 | `5ee740c` | TS workflow/agent step/agentic loop | TypeScript 生态可参考 workflow API，但不宜先做完整 DAG |
| `a2aproject/A2A` | 24,032 | 2,431 | 2026-05-26 | `cd87b93` | 远程 Agent 协议 | 适合 P3 互联层，不是本地协作 runtime 的起点 |
| `openai/swarm` | 21,533 | 2,292 | 2026-04-15 | 未下载 | 教学 handoff | 被 OpenAI Agents SDK 覆盖，作为历史背景即可 |
| `google/adk-python` | 19,885 | 3,465 | 2026-05-26 | `ad8b6c7` | agent tree / sequential / parallel | 适合学子 Agent 树和并行事件合并 |
| `camel-ai/camel` | 17,067 | 1,916 | 2026-05-26 | `ebc29ac` | Workforce/task queue/dynamic worker | 适合学任务池、失败恢复、worker pool |
| `microsoft/agent-framework` | 10,786 | 1,786 | 2026-05-27 | `ef86fb5` | workflow builder/orchestrations | 新方向，适合学 workflow event schema |

### 设计谱系

| 谱系 | 代表项目 | 核心抽象 | 适合 Guga 的程度 |
|---|---|---|---|
| Handoff | OpenAI Agents SDK、AutoGen Swarm、Microsoft Agent Framework | 当前 Agent 把控制权转给下一个 Agent | 高，P2 可做 |
| Delegate as tool | Claude Code/Hermes/DeerFlow 本地基线、CrewAI delegate work | 父 Agent 调用一个工具生成子任务，子结果回填 | 最高，P1 首选 |
| Team/group chat | AutoGen、Agno、CrewAI | 多 Agent 共享消息线程，由 manager/select speaker 控制 | 中，容易污染上下文 |
| Workflow graph | LangGraph、Mastra、Microsoft Agent Framework、Google ADK | 节点/边/状态/恢复 | 中，适合工作流，不适合替代 Guga core loop |
| Workforce/task queue | CAMEL、Claude Code swarm | worker 池、任务分解、claim/assign/merge | 中高，但应放 P2/P3 |
| Remote protocol | A2A | Agent Card、HTTP/JSON-RPC、SSE、opaque internal state | P3，不应混入本地 runtime MVP |

## 可借鉴模式

### 1. P1 先做单层委派工具，而不是完整多 Agent 框架

**Fact**：Guga 已有 `AgentLoop`、`ExecutionPipeline`、权限、事件、tool scheduler。`AgentLoop` 在模型返回 tool calls 后用 `ExecutionPipeline` 执行工具，且 `ToolScheduler` 已能基于资源 scope 做安全并行。证据：`packages/core/src/loop/agent-loop.ts:228`、`packages/core/src/tools/execution-pipeline.ts:58`、`packages/core/src/tools/tool-scheduler.ts:34`。

**Fact**：OpenAI Agents SDK 同时区分 handoff 与 agent-as-tool：handoff 是交接会话控制权，agent-as-tool 是嵌套运行后把结果给原 Agent。证据：`openai-agents-python/src/agents/agent.py:305`、`:531`。

**Inference**：Guga P1 最小可行设计应是 `delegateTask` 工具，语义更接近 agent-as-tool，不改变主 Agent 控制权。

建议接口：

```ts
type DelegateTaskInput = {
  goal: string;
  context?: string;
  agentType?: "research" | "code-review" | "general";
  toolAllowlist?: string[];
  maxTurns?: number;
  timeoutMs?: number;
};

type DelegateTaskOutput = {
  status: "completed" | "failed" | "cancelled" | "timed_out";
  summary: string;
  childRunId: string;
  childSessionId: string;
  events?: { type: string; count: number }[];
};
```

### 2. 子 Agent 上下文应默认隔离，输入必须自包含

**Fact**：OpenAI Agents SDK 的 handoff 默认带历史，但支持 `input_filter` 改写传给下一 Agent 的输入。证据：`openai-agents-python/src/agents/handoffs/__init__.py:126`。

**Fact**：Google ADK 的 `BaseAgent` 把 `sub_agents` 建成 Agent tree，并要求同一个 agent 只能被挂一次；`ParallelAgent` 为每个子 Agent 创建独立 branch context。证据：`google-adk-python/src/google/adk/agents/base_agent.py:109`、`google-adk-python/src/google/adk/agents/parallel_agent.py:34`。

**Inference**：Guga 子运行时应新建 `sessionId = parentSessionId + "/child/" + childRunId` 或新 branch，而不是复用父 `ConversationState`。父 Agent 只传 `{goal, context, relevant excerpts}`。

### 3. 并发应复用 Guga 已有 scope scheduler

**Fact**：Guga `ToolScheduler` 已把 interactive/ask/deny/serial 工具强制串行，把 read-only 与 scoped write 分批并行，并通过路径 overlap 判断冲突。证据：`packages/core/src/tools/tool-scheduler.ts:65`、`packages/core/src/tools/resource-scope.ts:31`。

**Fact**：CAMEL Workforce 有 worker pool、pending/completed task、timeout、retry 常量。证据：`camel/camel/societies/workforce/workforce.py:125`、`:175`，`single_agent_worker.py:54`。

**Inference**：Guga 不需要先做单独的 Agent pool；P1 只需把 `delegateTask` 注册成 `runtime.scheduler.concurrency = "scoped"`，资源 scope 可以是 `agent-run:{childSessionId}` 或文件路径集合。P2 再做队列/worker pool。

### 4. 事件模型要先扩 AgentEvent，而不是发明独立 trace 系统

**Fact**：Guga 现在所有 run/model/tool/context/session 事件都通过 `AgentEventType`，并支持 durable publish。证据：`packages/core/src/contracts/events.ts:17`、`packages/core/src/runtime/agent-runtime.ts:72`。

**Fact**：Microsoft Agent Framework 把 workflow lifecycle、superstep、executor、handoff/group_chat 都放进统一 `WorkflowEventType`。证据：`microsoft-agent-framework/python/packages/core/agent_framework/_workflows/_events.py:104`。

**Inference**：Guga 应新增最少事件，而不是并行维护一套子 Agent trace：

- `agent.child.started`
- `agent.child.completed`
- `agent.child.failed`
- `agent.child.cancelled`
- `agent.child.output`

这些事件都带 `parentRunId`、`childRunId`、`parentToolCallId`、`agentType`。

### 5. P2 再做 handoff/team，且 handoff 不等于 delegate

**Fact**：AutoGen Swarm 根据 `HandoffMessage` 选择下一 speaker，没有 handoff 时当前 speaker 继续。证据：`autogen/python/packages/autogen-agentchat/src/autogen_agentchat/teams/_group_chat/_swarm_group_chat.py:82`。

**Fact**：OpenAI handoff 由工具名 `transfer_to_{agent}` 暴露给模型，并可动态 enable/disable。证据：`openai-agents-python/src/agents/handoffs/__init__.py:171`、`:153`。

**Inference**：Guga P2 可以加 `handoffs` 到 Agent 配置，但它应该改变“下一轮谁接管对话”，而不是像 `delegateTask` 那样把子任务结果回填给当前 Agent。

### 6. 远程 Agent 互联走 A2A adapter，不能进 core

**Fact**：A2A 通过 Agent Card 描述 identity、endpoint、capabilities、auth、skills，并强调 Agent 可协作但不暴露内部状态、memory、tools。证据：`a2a/docs/topics/agent-discovery.md:5`、`a2a/README.md:48`。

**Inference**：Guga P3 可实现 `plugin-a2a`，把远程 Agent 映射成 `ToolDefinition` 或 `RemoteAgentDescriptor`。core 只知道“远程 Agent 工具”，不内建 JSON-RPC/A2A 协议。

## 不建议照搬

### 1. 不照搬 MetaGPT 式“软件公司”

**Fact**：MetaGPT 的 `Team` 绑定 roles、environment、investment、archive；`Environment` 用消息发布和 role buffer 路由。证据：`MetaGPT/metagpt/team.py:32`、`MetaGPT/metagpt/environment/base_env.py:124`。

**Reason**：这适合完整垂直产品，不适合 Guga 当前 CLI-first runtime。照搬会把 business workflow、message bus、budget、archive 过早混入 core。

### 2. 不把 LangGraph/Mastra 工作流直接变成 Guga core loop

**Fact**：LangGraph `StateGraph` 是共享 state + node partial updates，`Send` 支持 fan-out。证据：`langgraph/libs/langgraph/langgraph/graph/state.py:130`、`langgraph/libs/langgraph/langgraph/types.py:654`。

**Fact**：Mastra workflow 能把 Agent 包成 step，并有 agentic-loop workflow。证据：`mastra/packages/core/src/workflows/workflow.ts:228`、`mastra/packages/core/src/loop/workflows/agentic-loop/index.ts:56`。

**Reason**：Guga 已有 provider/tool/context/persistence 主循环。引入外部图 runtime 会把调试、权限、上下文压缩、持久化拆散。可借鉴 API，不做依赖。

### 3. 不先做 unrestricted group chat

**Fact**：AutoGen group chat 默认参与者共享上下文，消息会发布给其他 participant。证据：`autogen/python/packages/autogen-agentchat/src/autogen_agentchat/teams/_group_chat/_base_group_chat.py:40`。

**Reason**：共享上下文看似简单，但对 Guga 的 context budget、tool result pairing、权限审计都更难。P1 应保持父子隔离。

### 4. 不先做动态 worker creation

**Fact**：CAMEL Workforce 可创建动态 worker，并包含失败恢复策略。证据：`camel/camel/societies/workforce/workforce.py:181`。

**Reason**：动态 worker 需要成熟的任务评分、失败归因、角色能力 registry。Guga 当前更需要稳定的一层委派。

## Guga 落点

### P1：`delegateTask` MVP

落点文件：

- `packages/core/src/contracts/runtime.ts`：增加 child run/session 类型或 `AgentRunOptions.parent`。
- `packages/core/src/contracts/events.ts`：增加 child agent 事件。
- `packages/core/src/runtime/agent-runtime.ts`：暴露内部 child runtime factory，继承 registry/router/permission/persistence。
- 新增 `packages/core/src/multi-agent/delegate-task-tool.ts`：把子运行时包装成工具。

关键规则：

- 单层委派：子 Agent 默认不能再调用 `delegateTask`。
- 权限继承：子 Agent 工具集 = 父运行时可见工具 ∩ allowlist - blocked tools。
- 上下文隔离：子 Agent 不拿父完整 transcript，只拿工具输入里的 goal/context。
- 预算隔离：`maxTurns` 默认 4，`timeoutMs` 默认 10 分钟。
- 结果回填：父 Agent 只收到摘要、状态、childRunId，不回填完整事件流。
- trace：所有 child events 写同一个 durable event store，可由 `parentRunId` 关联。

### P2：handoff 与 coordinator mode

新增 Agent 配置：

```ts
type AgentDescriptor = {
  name: string;
  instructions: string;
  tools?: string[];
  handoffDescription?: string;
};
```

行为：

- `delegateTask`：子 Agent 作为工具运行，父 Agent 继续。
- `handoff`：下一个 turn 的 active agent 改变，类似 OpenAI/AutoGen。
- `coordinator`：主 Agent 只规划、委派、汇总，不直接改文件。

### P3：workflow 与 A2A adapter

- `plugin-workflow`：把 Guga Agent/Tool 包成 typed DAG step，借鉴 Microsoft/Mastra/LangGraph 的 builder API。
- `plugin-a2a`：读取 Agent Card，将远程 Agent 暴露为工具或 agent descriptor。
- `agent registry`：按 capability、permission profile、成本、latency 选择本地/远程 Agent。

## 证据

### 本地基线

- Fact：`docs/research/context-packs/multi-agent.md` 已给出 Claude Code、Hermes、DeerFlow、OpenCode、DeepAgentsJS 对比，并建议 Guga Phase 1 采用“单层委派 + 统一 task 工具入口 + 上下文隔离 + 工具集取交集再减黑名单”。

### 下载路径与 commit

- Fact：`crewAI` -> `/Users/lienli/Documents/GitHub/agent-ref/current-multi-agent/crewAI`, `c5ea415`
- Fact：`langgraph` -> `/Users/lienli/Documents/GitHub/agent-ref/current-multi-agent/langgraph`, `66ec594`
- Fact：`autogen` -> `/Users/lienli/Documents/GitHub/agent-ref/current-multi-agent/autogen`, `027ecf0`
- Fact：`openai-agents-python` -> `/Users/lienli/Documents/GitHub/agent-ref/current-multi-agent/openai-agents-python`, `6d5b888`
- Fact：`MetaGPT` -> `/Users/lienli/Documents/GitHub/agent-ref/current-multi-agent/MetaGPT`, `11cdf46`
- Fact：`camel` -> `/Users/lienli/Documents/GitHub/agent-ref/current-multi-agent/camel`, `ebc29ac`
- Fact：`google-adk-python` -> `/Users/lienli/Documents/GitHub/agent-ref/current-multi-agent/google-adk-python`, `ad8b6c7`
- Fact：`microsoft-agent-framework` -> `/Users/lienli/Documents/GitHub/agent-ref/current-multi-agent/microsoft-agent-framework`, `ef86fb5`
- Fact：`agno` -> `/Users/lienli/Documents/GitHub/agent-ref/current-multi-agent/agno`, `66ed7fe`
- Fact：`mastra` -> `/Users/lienli/Documents/GitHub/agent-ref/current-multi-agent/mastra`, `5ee740c`
- Fact：`a2a` -> `/Users/lienli/Documents/GitHub/agent-ref/current-multi-agent/a2a`, `cd87b93`

### 关键源码证据

- Fact：CrewAI `Crew` 有 `agents/tasks/process/manager_llm/manager_agent`，层级模式要求 manager。证据：`crewAI/lib/crewai/src/crewai/crew.py:159`、`:684`。
- Fact：CrewAI 只有 sequential/hierarchical 两种 process。证据：`crewAI/lib/crewai/src/crewai/process.py:4`。
- Fact：CrewAI delegate tool 输入是 task/context/coworker。证据：`crewAI/lib/crewai/src/crewai/tools/agent_tools/delegate_work_tool.py:8`。
- Fact：OpenAI Agents SDK `Agent` 直接有 `handoffs`，并提供 `as_tool()`。证据：`openai-agents-python/src/agents/agent.py:305`、`:508`。
- Fact：AutoGen group chat 注册 participants、manager、topic subscriptions，并用 Swarm handoff message 选 speaker。证据：`autogen/python/packages/autogen-agentchat/src/autogen_agentchat/teams/_group_chat/_base_group_chat.py:191`、`_swarm_group_chat.py:82`。
- Fact：Google ADK agent tree 和 ParallelAgent branch isolation。证据：`google-adk-python/src/google/adk/agents/base_agent.py:120`、`google-adk-python/src/google/adk/agents/parallel_agent.py:34`。
- Fact：CAMEL Workforce 内置 coordinator/task planner/dynamic workers、任务 timeout/retry/worker pool。证据：`camel/camel/societies/workforce/workforce.py:125`、`:181`、`single_agent_worker.py:54`。
- Fact：Microsoft Agent Framework workflow event schema 包含 handoff/group_chat/magentic，builder 可把 agents 包成 executors。证据：`microsoft-agent-framework/python/packages/core/agent_framework/_workflows/_events.py:104`、`_workflow_builder.py:189`。
- Fact：A2A 使用 Agent Card 做发现，并强调 opaque internal state。证据：`a2a/docs/topics/agent-discovery.md:5`、`a2a/README.md:52`。

### Pending Verification

- Microsoft Agent Framework 的 `agent-framework-orchestrations` 是可选包，本次只验证 core re-export 和事件类型，未展开可选包源码。
- CrewAI sparse checkout 下载了核心 `lib/`、`docs/`、`tests/`，未下载全部历史和 LFS 对象。
- 本报告没有运行外部框架测试或真实 LLM 调用，结论基于代码结构和文档语义。
