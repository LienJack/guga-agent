# 如何写一个 Agent Harness：从论文框架到工程实现

> 本文基于 `agent-harness-engineering-a-survey.zh.md` 总结和延展。目标不是复述论文，而是把 Agent Harness Engineering 的思想转成一份可操作的工程指南：如果要从零写一个 Harness，应该先做什么、拆哪些模块、定义哪些接口、如何验证它真的可靠。

## 一句话结论

Agent Harness 不是更长的 prompt，也不是简单包一层 LLM API。它是把模型调用变成“有边界、有状态、可观测、可验证、可治理的任务执行系统”的基础设施层。

一个好的 Harness 至少要回答七个问题：

1. 智能体在哪里执行动作？
2. 智能体能调用哪些工具？
3. 模型每一步应该看到什么上下文？
4. 任务如何从开始推进到完成？
5. 如何观察每一步发生了什么？
6. 如何判断结果是否正确？
7. 如何约束权限、风险和责任？

论文把这七个问题总结为 ETCLOVG：Execution、Tool、Context、Lifecycle、Observability、Verification、Governance。写 Harness 时，可以把 ETCLOVG 当成架构清单，而不是论文里的分类术语。

## 适用范围

本文讨论的是“长期运行、工具介导、有副作用”的智能体系统，例如：

- 编码智能体：读代码、改文件、运行测试、提交补丁。
- 研究智能体：检索资料、抽取证据、写报告、标注来源。
- 数据智能体：运行查询、生成图表、校验指标、产出分析。
- 浏览器智能体：打开页面、点击、填写表单、验证状态。
- 运维智能体：查看日志、执行诊断、提出修复、触发回滚。

如果只是做一次性聊天问答，Harness 可以很薄；如果智能体要执行命令、写文件、联网、跨多轮保存状态，Harness 就必须成为一等公民。

## Harness 的核心心智模型

可以把智能体系统拆成三层：

```text
用户目标
  ↓
Harness：控制、状态、工具、验证、治理
  ↓
模型：根据当前上下文选择下一步动作
```

模型负责生成候选动作，Harness 负责决定这些动作在真实系统里如何发生。换句话说，模型是推理器，Harness 是控制器。

这个区分很重要。很多智能体失败不是因为模型完全不会做，而是 Harness 没有给它正确的状态、没有限制危险动作、没有在错误后恢复、没有在完成前验证。论文的核心判断就是：长期任务中，可靠性经常受 Harness 质量约束，而不只是受模型质量约束。

一个 Harness 的基本职责是：

- 输入控制：把任务、状态、工具说明、历史摘要、检索结果组装成当前轮上下文。
- 动作控制：解析模型输出，校验工具调用是否合法，决定是否执行。
- 执行控制：把动作放进沙箱、浏览器、数据库、文件系统或远程环境里执行。
- 状态控制：记录计划、进度、产物、关键决策、失败和恢复点。
- 反馈控制：把工具结果、测试结果、验证结果反馈给下一轮模型。
- 风险控制：处理权限、审批、预算、审计、数据边界和人类介入。

所以，写 Harness 的目标不是让模型“自由发挥”，而是让模型在可恢复、可检查、可收敛的控制循环里发挥。

## 总体架构

一个实用 Harness 可以从下面的模块划分开始：

```text
AgentHarness
  ├─ RunManager          # 创建、恢复、停止任务运行
  ├─ StateStore          # 持久化 RunState、artifact、checkpoint
  ├─ ContextBuilder      # 组装每轮模型输入
  ├─ ModelClient         # 调用 LLM，处理流式输出和重试
  ├─ ToolRegistry        # 注册工具、暴露 schema、按阶段筛选工具
  ├─ ToolExecutor        # 校验和执行工具调用
  ├─ Sandbox             # 文件、命令、网络、浏览器等执行边界
  ├─ PolicyEngine        # 权限、预算、审批、风险策略
  ├─ Orchestrator        # 生命周期状态机和 agent loop
  ├─ Verifier            # 结果检查、测试、评估、失败归因
  └─ TraceStore          # trace、span、成本、延迟、错误和审计日志
```

不要一开始就做成复杂平台。先让这些职责在代码里有清晰边界，即使每个模块只有一个简单实现，也比把所有逻辑塞进一个 `while` 循环更容易演进。

## 最小可用版本

最小可用 Harness 可以只支持单智能体、单任务、少量工具，但必须具备闭环。

基本流程如下：

1. 接收任务，创建 `Run`。
2. 初始化状态：目标、预算、权限、工作区、生命周期阶段。
3. 组装上下文：系统指令、当前状态、可用工具、必要历史。
4. 调用模型，让模型返回文本或工具调用。
5. 解析动作，做 schema 校验和权限校验。
6. 在受控环境执行工具调用。
7. 记录 trace，并把结果写回状态。
8. 判断任务是否完成、失败、需要重试、需要验证、需要人工介入。
9. 如果完成，运行验证器。
10. 输出最终答案，并保存可复盘的运行记录。

伪代码可以长这样：

```ts
async function runAgent(task: Task): Promise<RunResult> {
  const run = await runManager.create(task);

  while (!run.isTerminal()) {
    const context = await contextBuilder.build(run);
    const modelOutput = await modelClient.generate(context);

    await traceStore.recordModelStep(run.id, context, modelOutput);

    const action = actionParser.parse(modelOutput);
    const decision = await policyEngine.authorize(run, action);

    if (decision.type === "deny") {
      await runManager.fail(run, decision.reason);
      break;
    }

    if (decision.type === "need_approval") {
      await runManager.pause(run, decision.reason);
      break;
    }

    const toolResult = await toolExecutor.execute(run, action);
    await traceStore.recordToolStep(run.id, action, toolResult);

    await stateStore.applyToolResult(run.id, action, toolResult);
    await orchestrator.advance(run.id);

    if (await verifier.shouldVerify(run.id)) {
      const verification = await verifier.verify(run.id);
      await stateStore.applyVerification(run.id, verification);
    }
  }

  return await runManager.result(run.id);
}
```

这段伪代码里，最重要的不是语法，而是边界：模型调用、动作解析、权限决策、工具执行、状态更新、验证和 trace 记录是不同职责。这样系统出问题时才知道该改哪一层。

## 核心数据结构

### Run

`Run` 表示一次任务执行。它不应该只是一个内存对象，长期任务必须能持久化和恢复。

```ts
type Run = {
  id: string;
  task: Task;
  status: "planning" | "running" | "blocked" | "verifying" | "succeeded" | "failed";
  phase: "plan" | "act" | "check" | "fix" | "finalize";
  workspace: WorkspaceRef;
  budget: Budget;
  permissions: PermissionSet;
  stateRef: string;
  traceRef: string;
  createdAt: string;
  updatedAt: string;
};
```

### RunState

`RunState` 是智能体的工作记忆。它应该结构化，而不是只靠聊天历史。

```ts
type RunState = {
  goal: string;
  plan: PlanItem[];
  completed: string[];
  openQuestions: string[];
  assumptions: string[];
  artifacts: ArtifactRef[];
  decisions: DecisionRecord[];
  lastError?: ErrorRecord;
  verifierResults: VerificationResult[];
};
```

这里的关键是：状态要能被压缩、恢复和审计。模型可以生成计划，但 Harness 要把计划落成状态对象。

### Tool

工具定义不要只是函数。它至少要包含 schema、权限、风险等级和输出策略。

```ts
type Tool = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  permission: PermissionScope;
  risk: "low" | "medium" | "high";
  phases: Run["phase"][];
  execute(input: unknown, context: ToolContext): Promise<ToolResult>;
};
```

### TraceEvent

Trace 是失败归因和回归测试的基础。

```ts
type TraceEvent = {
  runId: string;
  step: number;
  type: "model" | "tool" | "policy" | "verification" | "human";
  inputRef?: string;
  outputRef?: string;
  toolName?: string;
  latencyMs?: number;
  tokenUsage?: TokenUsage;
  costUsd?: number;
  error?: string;
  timestamp: string;
};
```

不要只存最终答案。只存最终答案意味着你无法回答“为什么失败”，也无法把失败转成回归用例。

## 七层实现指南

### E：执行环境和沙箱

执行层决定智能体动作在哪里发生。它是安全性、可重复性和自主性的共同基础。

最小实现：

- 给每个 run 分配独立工作区。
- 限制文件读写范围。
- 命令执行设置超时、输出截断和退出码记录。
- 默认禁用或限制网络。
- 工具执行失败时保留错误和必要日志。

进阶实现：

- 使用容器、microVM 或远程 sandbox 隔离命令。
- 支持快照和回滚。
- 支持每个任务重置到干净环境。
- 支持浏览器、桌面、数据库等专用执行环境。
- 将本地执行和远程执行抽象成同一接口。

设计决策可以按威胁模型选择：

| 场景 | 推荐执行边界 |
| --- | --- |
| 只读研究 | 本地只读工具 + 网络白名单 |
| 代码修改 | 工作区权限 + 命令白名单 + 测试超时 |
| 运行不可信代码 | 容器或 microVM |
| 浏览器任务 | 隔离浏览器上下文 + 截图/DOM trace |
| 企业系统操作 | 最小权限凭证 + 审批 + 审计 |

关键原则：沙箱不是只为了安全，也是为了减少权限弹窗。低风险动作在沙箱内自动执行，高风险动作再升级审批。

### T：工具接口

工具接口要为模型设计，而不是把人类 API 原样暴露给模型。

好的工具有几个特征：

- 名称表达动作，例如 `read_file`、`run_tests`、`search_docs`。
- 描述短而具体，说明什么时候用、什么时候不用。
- 参数少，避免深层嵌套。
- 输出稳定，最好是结构化 JSON 或压缩摘要。
- 错误可恢复，告诉模型为什么失败和下一步可尝试什么。
- 权限明确，每个工具都能映射到一个 permission scope。

差的工具通常是这样：

- 一个工具做太多事，例如 `execute_anything`。
- 参数完全开放，例如任意 shell 字符串但没有策略。
- 输出一大坨日志，挤爆上下文。
- 错误只写 `failed`，模型不知道怎么修。
- 所有阶段都暴露所有工具。

工具注册表应该支持按阶段筛选：

```ts
function toolsForPhase(phase: Run["phase"]): Tool[] {
  return registry.all().filter(tool => tool.phases.includes(phase));
}
```

这能减少上下文占用，也能降低误用概率。比如 `finalize` 阶段不应该还暴露危险的批量修改工具；`plan` 阶段通常只需要读工具和搜索工具。

### C：上下文管理

上下文不是越多越好。论文强调，长上下文会带来成本、延迟和推理退化，信息放在窗口中间也可能被忽略。Harness 的职责是每一步给模型“足够但不过量”的信息。

建议把上下文分成五类：

1. 稳定前缀：系统指令、安全规则、输出格式。
2. 任务状态：目标、当前阶段、计划、已完成事项、阻塞点。
3. 工具说明：当前阶段可用工具的精简 schema。
4. 近期轨迹：最近几步关键动作和结果。
5. 按需材料：文件片段、搜索结果、日志摘要、外部文档。

上下文构建器的目标是：

```ts
type ContextBuilder = {
  build(run: Run): Promise<ModelContext>;
};
```

实现时要注意：

- 稳定前缀尽量不要频繁变化，方便 prompt cache。
- 工具定义放前面会影响缓存，动态增删工具要谨慎。
- 大文件不要整份塞入上下文，先放路径和摘要，必要时再读取片段。
- 工具输出要压缩，只保留模型下一步决策需要的信息。
- 每次压缩要偏向召回，宁可多保留关键约束，不要过早丢信息。
- 长任务要把关键状态外部化到 `RunState` 或 artifact，而不是依赖聊天历史。

一个实用模板：

```text
System:
  你是一个受 Harness 控制的智能体。遵守权限、预算和阶段规则。

Task:
  <用户目标>

Current phase:
  <plan | act | check | fix | finalize>

State:
  <计划、已完成事项、关键决策、阻塞点>

Available tools:
  <只列当前阶段可用工具>

Recent events:
  <最近几步高价值 trace 摘要>

Relevant materials:
  <按需检索的文件片段或文档摘要>
```

### L：生命周期和编排

生命周期层负责控制任务如何推进。不要让模型自己记住“现在该干什么”，Harness 应该显式维护阶段。

一个通用生命周期：

```text
intake -> planning -> acting -> checking -> fixing -> finalizing -> done
```

每个阶段都要定义：

- 进入条件。
- 退出条件。
- 可用工具。
- 必须产出的状态更新。
- 失败后的恢复路径。
- 是否需要验证或人工审批。

例如编码任务：

| 阶段 | 目标 | 可用工具 | 退出条件 |
| --- | --- | --- | --- |
| planning | 理解需求，形成计划 | 读文件、搜索 | 计划写入状态 |
| acting | 修改代码或文档 | 读写文件、运行命令 | 产物生成 |
| checking | 验证变更 | 测试、lint、diff | 检查通过或失败归因 |
| fixing | 修复检查失败 | 读写文件、运行命令 | 回到 checking |
| finalizing | 总结结果 | 只读、状态查询 | 输出最终说明 |

状态机的价值是让系统有收敛性。否则智能体很容易在“继续探索”和“开始修复”之间来回漂移。

### O：可观测性

可观测性不是上线后补日志，而是 Harness 从第一天就应该具备的能力。没有 trace，就没有工程迭代。

至少记录：

- 每轮模型调用的上下文引用、输出、token、成本、延迟。
- 每次工具调用的参数、输出摘要、退出码、错误。
- 每次策略判断：允许、拒绝、需要审批。
- 每次验证结果：通过、失败、失败类别。
- 每次人工介入：谁批准、批准了什么、原因是什么。

建议把 trace 当成结构化事件流，而不是文本日志：

```text
run_id
step
event_type
phase
actor
input_ref
output_ref
duration
cost
status
error
```

可观测性要支持几个问题：

- 这个 run 为什么失败？
- 哪个工具最常失败？
- 哪些任务消耗最高？
- 模型在哪个阶段最容易循环？
- 验证失败通常来自上下文缺失、工具错误还是模型推理错误？
- 哪些生产失败应该变成回归用例？

### V：验证和评估

验证层回答“结果是否正确”。它不能只看最终文本，也不能只靠模型自评。

不同任务需要不同验证器：

| 任务类型 | 验证方式 |
| --- | --- |
| 代码 | 测试、lint、typecheck、构建、diff review |
| 文档 | 链接检查、标题结构、引用存在性、术语一致性 |
| 数据分析 | schema 校验、样本检查、统计约束、SQL dry run |
| 浏览器 | DOM 断言、截图、网络请求、端到端测试 |
| 研究 | 证据覆盖、来源新鲜度、引用是否支持结论 |

Verifier 最好返回结构化结果：

```ts
type VerificationResult = {
  status: "passed" | "failed" | "inconclusive";
  checks: CheckResult[];
  failureAttribution?: {
    layer: "model" | "tool" | "context" | "execution" | "policy" | "unknown";
    reason: string;
  };
  suggestedNextAction?: string;
};
```

验证结果应该进入下一轮上下文，形成执行-检查-修复闭环。验证失败不是终点，而是 Harness 给模型的一种高质量反馈。

更进一步，生产失败应该自动或半自动进入回归集：

```text
失败 trace -> 归因 -> 最小复现任务 -> 回归用例 -> Harness 变更后重跑
```

这是 Harness 从 demo 走向工程系统的关键分界线。

### G：治理和安全

治理不是安全附加项。工具、上下文、执行和验证都要受治理约束。

最小治理能力：

- 身份：这次运行代表哪个用户、组织或服务账号。
- 权限：能读什么、写什么、联网到哪里、执行哪些命令。
- 审批：哪些动作必须等待人工确认。
- 审计：谁授权了什么动作，动作结果是什么。
- 数据边界：哪些数据不能进入模型，哪些记忆不能跨用户复用。
- 预算：最大 token、最大费用、最大执行时间、最大重试次数。

PolicyEngine 可以按风险分层：

| 风险 | 示例 | 策略 |
| --- | --- | --- |
| 低 | 读工作区文件、搜索本地文档 | 自动允许并记录 |
| 中 | 写工作区文件、运行测试 | 在沙箱内允许 |
| 高 | 删除文件、联网、安装包、访问凭证 | 需要审批或白名单 |
| 极高 | 生产变更、支付、发送邮件 | 默认禁止或强人工确认 |

一个简单接口：

```ts
type PolicyDecision =
  | { type: "allow" }
  | { type: "deny"; reason: string }
  | { type: "need_approval"; reason: string; approvalScope: string };
```

治理层的目标不是让智能体寸步难行，而是把自主性限定在可接受边界内。

## 推荐实现路线

### 第 1 阶段：写出单循环

目标：跑通一次“模型选择工具 -> 工具执行 -> 结果反馈”的闭环。

需要实现：

- `RunManager`
- `ModelClient`
- `ToolRegistry`
- `ToolExecutor`
- 基础 `TraceStore`

验收标准：

- 能创建 run。
- 能调用一个读工具和一个写工具。
- 能记录每一步 trace。
- 工具失败时不会崩溃，而是把错误反馈给模型。

这一阶段不要做多智能体，不要做复杂记忆，也不要做平台化 UI。

### 第 2 阶段：加执行边界

目标：让工具调用受控。

需要实现：

- 工作区隔离。
- 文件读写范围限制。
- 命令超时和输出截断。
- 网络默认关闭或白名单。
- 基础权限模型。

验收标准：

- 智能体不能读写工作区外的文件。
- 长命令会超时。
- 大输出会被截断并保存完整引用。
- 被拒绝动作会进入 trace。

### 第 3 阶段：加结构化状态

目标：让任务可恢复。

需要实现：

- `RunState`
- artifact 引用。
- checkpoint。
- 中断后恢复。

验收标准：

- 进程重启后能恢复任务。
- 模型不依赖完整聊天历史也能知道当前进度。
- 关键决策和产物有记录。

### 第 4 阶段：加验证闭环

目标：让系统能判断自己是否真的完成。

需要实现：

- 任务类型对应的 verifier。
- 验证结果结构化。
- 失败后进入 fixing 阶段。
- 通过后进入 finalizing 阶段。

验收标准：

- 代码任务至少能跑测试或静态检查。
- 文档任务至少能检查结构和链接。
- 验证失败会反馈给模型，而不是直接输出失败。

### 第 5 阶段：加可观测性

目标：让失败可以定位。

需要实现：

- 结构化 trace 查询。
- 成本、延迟、错误统计。
- 工具失败率统计。
- run 级别回放。

验收标准：

- 能回答某次运行每一步做了什么。
- 能看出失败发生在哪个工具或阶段。
- 能把失败 run 提炼成回归用例。

### 第 6 阶段：加治理

目标：让智能体在真实组织边界内运行。

需要实现：

- 身份和权限绑定。
- 审批流。
- 高风险动作策略。
- 审计日志。
- 数据边界策略。

验收标准：

- 高风险动作不会静默执行。
- 审批记录可追溯。
- 不同用户或项目的状态和记忆不会混用。

### 第 7 阶段：再考虑多智能体

多智能体不是起点。只有当单智能体遇到明确瓶颈时才需要：

- 上下文污染严重。
- 子任务可以并行探索。
- 需要不同角色互相审查。
- 单个上下文窗口无法容纳完整任务。

引入子智能体时要遵守两个原则：

- 子智能体上下文隔离，只返回摘要、证据和 artifact。
- 主智能体保留全局状态和最终决策权。

否则，多智能体会把问题从“一个智能体不可控”扩大成“一组智能体不可控”。

## 典型失败模式和对应机制

| 失败模式 | 常见原因 | Harness 机制 |
| --- | --- | --- |
| 智能体重复做已经完成的事 | 状态只在聊天历史里 | 结构化 `RunState`、checkpoint |
| 智能体跳过验证 | 生命周期不显式 | 状态机强制 checking 阶段 |
| 工具调用参数经常错 | schema 太复杂或错误不可恢复 | 简化工具、结构化错误 |
| 运行成本失控 | 上下文无限累积 | 上下文预算、摘要、输出截断 |
| 线上失败无法定位 | 只存最终答案 | TraceStore、span、失败归因 |
| 修复一个问题引入另一个问题 | 没有回归集 | 失败 trace 转回归用例 |
| 权限弹窗太多 | 没有沙箱和风险分层 | 低风险自动允许，高风险审批 |
| 智能体越跑越偏 | 上下文漂移 | 状态外部化、验证器、人类检查点 |
| 模型升级后表现反而变差 | Harness 与模型耦合 | Harness 变体评估、A/B 测试 |

## 设计检查清单

开始写 Harness 前，先回答这些问题。

执行层：

- 智能体动作在哪个环境执行？
- 文件、命令、网络、浏览器是否有边界？
- 任务失败后能否重置环境？
- 工具输出过大时如何处理？

工具层：

- 每个工具是否动作单一？
- 工具 schema 是否足够简单？
- 错误信息是否可恢复？
- 工具是否按阶段暴露？
- 每个工具是否有权限范围？

上下文层：

- 哪些内容是稳定前缀？
- 当前轮必须看到哪些状态？
- 历史如何摘要？
- 大材料如何按需检索？
- 压缩后如何避免丢关键约束？

生命周期层：

- 任务有哪些阶段？
- 每个阶段的进入和退出条件是什么？
- 什么时候重试，什么时候失败，什么时候人工介入？
- 完成前是否强制验证？

可观测性层：

- 每个模型调用和工具调用是否可追踪？
- 成本、延迟、错误是否结构化记录？
- 是否能回放一次 run？
- 是否能统计常见失败点？

验证层：

- 完成条件是否可机器检查？
- 验证失败能否反馈给模型修复？
- 生产失败能否沉淀为回归用例？
- 评测是否区分模型失败和 Harness 失败？

治理层：

- 运行代表谁？
- 哪些动作默认允许、默认拒绝、需要审批？
- 审批和执行是否有审计记录？
- 记忆、上下文和 artifact 是否有数据边界？

## 一个落地例子：编码 Harness

如果要写一个最小编码智能体 Harness，可以这样落地：

模块：

- `read_file(path)`：只读工作区文件。
- `search(query)`：用 ripgrep 搜索。
- `apply_patch(patch)`：只允许 patch 工作区。
- `run_command(cmd)`：只允许白名单命令，例如测试和 lint。
- `run_tests()`：封装项目测试命令。
- `submit_final()`：结束并输出总结。

生命周期：

```text
planning -> editing -> testing -> fixing -> final
```

上下文：

- 系统规则：不要越权、修改前先读文件、完成前必须测试。
- 当前任务：用户需求。
- 状态：计划、已改文件、测试结果、失败原因。
- 工具：当前阶段可用工具。
- 最近事件：最近几次 patch 和测试摘要。

验证：

- 至少运行相关测试。
- 如果测试不可运行，必须记录原因。
- 检查 diff 是否只包含相关文件。
- 最终回答必须说明修改内容和验证结果。

治理：

- 读文件低风险。
- 写工作区中风险，允许但记录。
- 删除文件、联网、安装包高风险，需要审批。
- 工作区外文件默认禁止。

这个 Harness 不一定复杂，但已经具备核心工程属性：受控执行、状态、验证、trace 和权限。

## 一个落地例子：研究 Harness

研究智能体的 Harness 与编码不同，它的重点不是执行命令，而是证据质量。

工具：

- `search_web(query)`：搜索资料。
- `open_source(url)`：打开来源。
- `extract_quote(source_id)`：抽取短引用或摘要。
- `save_note(note)`：保存研究笔记。
- `write_report()`：生成报告。

生命周期：

```text
scope -> gather -> evaluate -> synthesize -> cite -> final
```

上下文：

- 研究问题。
- 已确认事实。
- 待验证问题。
- 来源列表和可信度。
- 证据到结论的映射。

验证：

- 每个关键结论至少有来源。
- 区分事实、推断和待验证。
- 检查来源日期是否满足时效要求。
- 检查引用是否真的支持结论。

治理：

- 付费、登录、个人数据来源默认需要人工确认。
- 高风险主题需要更严格来源。
- 不能把未验证推断写成事实。

这说明 Harness 不是固定形态。不同领域的工具、状态和验证器不同，但七层问题是一致的。

## 不建议一开始做的事

不要一开始就做复杂多智能体。多数问题先来自状态、工具和验证设计薄弱，而不是缺少角色。

不要把所有功能都塞进一个万能工具。万能工具短期方便，长期会破坏权限、观测和失败归因。

不要只优化 benchmark 分数。Harness 会影响模型表现，过度贴合单一评测会让系统在真实任务中脆弱。

不要把记忆系统做成“全量历史检索”。更重要的是任务状态、出处、过时标记和矛盾处理。

不要假设模型升级后旧 Harness 一定仍然最优。更强模型可能不需要某些脚手架，旧的重置、规划或验证策略可能变成成本和误导。

## 最后

写 Agent Harness 的目标不是给 LLM 多加几层包装，而是构建一个控制系统。这个控制系统让模型在合适上下文里做局部决策，让工具在受控环境中执行，让状态可以恢复，让失败可以诊断，让结果可以验证，让风险可以审计。

真正可用的 Harness 应该满足一句话：

> 当智能体成功时，你知道为什么成功；当智能体失败时，你知道失败发生在哪一层，并且能把这次失败变成下一次不会重复的机制。

如果只记住一个实现建议：先做单智能体闭环，再补状态、验证、观测和治理。不要从“更聪明的智能体”开始，要从“更可靠的控制循环”开始。

## 参考

- 本地译文：`docs/research/papers/agent-harness-engineering-a-survey.zh.md`
- 原始论文：Agent Harness Engineering: A Survey
