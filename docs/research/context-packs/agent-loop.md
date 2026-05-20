# Agent Loop Context Pack

## 问题边界

主循环是 Agent 的心脏。本包覆盖：

1. **主循环结构** — while(true) 的核心状态机设计
2. **Turn 生命周期** — 从 LLM 调用到工具执行到结果回流的一轮完整流程
3. **流式处理** — Streaming vs Non-streaming 路径选择、chunk 累积、中断
4. **工具调度** — 工具调用分发、并行/串行决策、幻觉工具名检测
5. **迭代预算** — 循环上限管理、预算预警、父子 Agent 预算隔离
6. **错误重试** — API 级重试策略、jittered backoff、fallback 链
7. **消息清洗** — budget warning 剥离、孤儿 tool_call 修复、surrogate 消毒

**不在范围**：上下文压缩（见 context-compression pack）、工具注册表内部（见 tool-registry pack）、Multi-agent 委派（见 multi-agent pack）。

---

## 参考项目与版本

| 项目 | Commit | 语言 | 主循环文件 |
|------|--------|------|-----------|
| hermes-agent | `dd0923b` | Python | `run_agent.py` (~10,500行单文件) |
| opencode | `caf1151` | TypeScript | `packages/opencode/src/agent/loop.ts` (`while(true)`) |
| claude-code | `3d7b32f` | TypeScript | `src/utils/session.ts` (AsyncGenerator 模式) |
| blade-agent-sdk | `5d67e5e` | TypeScript | `src/agent/AgentLoop.ts` |
| deer-flow | `84f88b6` | Python (LangGraph) | LangGraph 编译图，无显式 while |

---

## 必读分析材料

| 文件 | 主题 | 价值 |
|------|------|------|
| `docs/research/source-analysis/hermes-agent-anatomy/docs/02-Agent核心循环.md` | Hermes 主循环完整解剖 | **最重要** — AIAgent 构造、IterationBudget、并行工具执行、消息清洗、retry chain |
| `docs/research/source-analysis/hermes-wiki/concepts/agent-loop-and-prompt-assembly.md` | Hermes 循环 + prompt 组装 | System prompt 缓存策略、prompt cache 一致性 |
| `docs/research/source-analysis/hermes-wiki/concepts/model-tools-dispatch.md` | Hermes 工具分发 | `_AGENT_LOOP_TOOLS` 拦截、幻觉检测与自动修复 |
| `docs/research/source-analysis/hermes-wiki/concepts/parallel-tool-execution.md` | 并行工具安全策略 | 三层安全检测 + 路径冲突检测 |
| `docs/research/source-analysis/learn-opencode/docs/flow/agent_lifecycle.md` | OpenCode 端到端生命周期 | Server-Driven Push 模式、全链路时序 |
| `docs/research/source-analysis/hermes-wiki/concepts/interrupt-and-fault-tolerance.md` | 中断传播 + 容错 | 子 Agent 中断链、credential 轮换、Gateway 重启续跑 |
| `docs/research/source-analysis/deerflow-book/chapters/07-context-engineering.md` | DeerFlow 上下文工程 | DanglingToolCallMiddleware、TodoMiddleware 自愈 |

---

## 必读源码文件

### Hermes Agent (Python)

| 文件 | Tokens | 职责 |
|------|--------|------|
| `run_agent.py` | 153,077 | **单文件 Agent 运行体**：构造器、主循环、工具执行、压缩、中断、fallback |
| `agent/retry_utils.py` | ~2,550 | jittered_backoff 算法、独立种子生成 |
| `agent/prompt_builder.py` | 15,698 | System prompt 构建 + 缓存、skills 索引注入 |

### OpenCode (TypeScript)

| 文件 | Tokens | 职责 |
|------|--------|------|
| `packages/opencode/src/agent/loop.ts` | — | While(true) 主循环，Server 状态变更自动触发 |
| `packages/opencode/src/agent/agent.ts` | ~7,754 | Agent 定义、info schema、多 Agent 模式 |

### Blade Agent SDK (TypeScript)

| 文件 | Tokens | 职责 |
|------|--------|------|
| `src/agent/AgentLoop.ts` | ~1,035 | AgentLoop 主循环、模型管理器 |

### Claude Code (TypeScript)

| 文件 | Tokens | 职责 |
|------|--------|------|
| `src/utils/session.ts` | 42,872 | AsyncGenerator 驱动的主循环，yield 事件流 |

---

## 关键抽象

### 1. 主循环架构的三种流派

| 流派 | 代表 | 核心模式 | 优势 | 劣势 |
|------|------|---------|------|------|
| **同步 while + 回调** | Hermes | `while api_call_count < max_iterations:` + 8 个 callback 插槽 | 简单直白，回调灵活可插拔 | 回调时序复杂，线程安全成本高 |
| **AsyncGenerator yield** | Claude Code | `async function* run() { yield event; }` | 天然适合流式 UI，for-await-of 直接消费 | Generator 难以中途注入状态 |
| **Server-Driven while(true)** | OpenCode | Server 状态变更触发 `loop.run()`，while(true) 内等待 | 前端哑终端，Server 是单一事实源 | 依赖 SSE 推送，网络开销大 |
| **编译图执行** | DeerFlow | LangGraph 编译 `StateGraph` → `app.invoke()` | 声明式，middleware 链天然可插拔 | 图执行不透明，调试困难 |

### 2. Turn 生命周期对比

```
Hermes turn:
  LLM Call → Parse Tool Calls → Validate(幻觉检测/JSON fix)
  → [中断检查] → Execute Tools(并行/串行)
  → Tool Result Persist(3级溢出防护) → 上下文压缩检查
  → Inject Budget Warning → Continue / Break

OpenCode turn:
  Gather Context(打开文件/终端输出) → Construct Prompt
  → LLM Predict → Parse Tool Calls → Permission Check
  → Execute Tools → SSE Push State → Update UI → Continue / Break

Claude Code turn (AsyncGenerator):
  yield EventType.PRE_LLM → LLM Call → yield EventType.LLM_RESPONSE
  → Parse Tool Calls → yield EventType.PRE_TOOL
  → Execute → yield EventType.POST_TOOL → Continue / yield EventType.DONE
```

### 3. 迭代预算策略

| 项目 | 上限 | 预警机制 | 预算退还 | 父子隔离 |
|------|------|---------|---------|---------|
| Hermes | 默认 90 | 70% CAUTION → 90% WARNING → 100% 强制停 | execute_code 免单(refund) | 子 Agent 独立 50 |
| OpenCode | 无硬上限 | 无显式预算 | 无 | N/A (静态多 Agent) |
| Claude Code | 无显式限制 | 上下文驱动自动压缩 | 无 | 子 Agent 独立 session |

**预算预警的精妙之处**：Hermes 在 70% 和 90% 向工具结果注入一次性的压力信号，下一轮 `_strip_budget_warnings_from_history` 清除旧信号，防止模型在后续 turn 里还误以为预算紧张。

### 4. 工具执行调度

**Hermes 三层安全检查**（最精细）：
```
NEVER_PARALLEL (clarify) → 整批降级串行
PARALLEL_SAFE (read_file, web_search) → 直接并行
PATH_SCOPED (read_file, write_file, patch) → 检查路径是否重叠
  ├─ 重叠 → 降级串行
  └─ 不重叠 → 并行 (ThreadPoolExecutor, max_workers=min(N, 8))
```

**Claude Code**：`partitionToolCalls()` 按 `isConcurrencySafe(input)` 声明分批，无路径冲突检测。

**OpenCode**：`canExecuteParallel(toolCalls)` 检查后决定 `Promise.all` 或顺序执行。

### 5. Streaming 架构选择

| 项目 | 策略 | 理由 |
|------|------|------|
| Hermes | **始终 streaming**（即使无消费者） | 流式路径自带 90s stale-stream 检测 + 60s 读超时，非流式无此保障 |
| OpenCode | 流式 + SSE 推送到前端 | Server-Driven Push，前端实时渲染 |
| Claude Code | AsyncGenerator yield 粒度事件 | 每个阶段状态变化都是 yield 点 |

**Hermes 的关键洞察**：非流式 API 调用时，Provider 可以用 SSE keep-alive ping 保持连接但永远不返回数据，Agent 无限挂住。流式路径天然避免此问题。

### 6. 消息清洗策略

所有项目都在 API 调用前对 messages 做清洗。Hermes 的清洗最系统：

| 清洗操作 | 触发场景 | 处理 |
|----------|----------|------|
| Surrogate 消毒 | 富文本粘贴 (U+D800-U+DFFF) | 替换为 U+FFFD |
| Budget Warning 剥离 | 每轮开头 | JSON del / 正则移除（先精确后模糊） |
| 孤儿 tool_call 修复 | 压缩/手动编辑后 | 删除孤儿 result / 补 stub |
| Reasoning 字段转换 | 多轮推理上下文 | reasoning → reasoning_content |
| finish_reason 移除 | 严格 API 校验 | pop 非标准字段 |
| tool_call/tool_result 配对检查 | 每次 API 调用前 | 保证 API 层面的消息列表合法性 |

### 7. Retry 与 Fallback

**Jittered Backoff** (Hermes)：
```
delay = min(base_delay * 2^(attempt-1), max_delay)
seed = (time_ns ^ (tick * 0x9E3779B9)) & 0xFFFFFFFF
jitter = random(0, 0.5 * delay)
return delay + jitter
```

用 `time_ns` XOR 单调计数器做独立种子，避免多个 Gateway 会话重试雷同。

**内层重试循环**（`while retry_count < 3`）覆盖：
- 响应 None / choices 为空 → 重试 → fallback
- 工具名幻觉 → 自动修复 → 注入错误让模型自纠
- 429 Rate Limit → jittered_backoff → fallback 模型
- 上下文超限 → 压缩 → 降级窗口探测

**Fallback 链**：支持单个 fallback 和链式 `[fallback[0], fallback[1], ...]`，逐级降级。每个新 turn 开始时恢复主 Provider。

---

## 已确认事实

1. **Hermes 单文件 10,500 行是单体架构的代价** — CLI、Gateway、子 Agent、批量跑分器全部复用同一个 AIAgent 类，56 个 __init__ 参数

2. **始终 Streaming 是反直觉但正确的设计** — 非流式路径缺乏 health check，Provider 可以用 keep-alive ping 让 Agent 无限挂住

3. **IterationBudget 的 refund 机制** — `execute_code` 这类轻量级 RPC 调用免单，不白吃预算

4. **路径冲突检测是并行安全的底线** — Hermes 的 `_paths_overlap` 检查前缀包含关系，防止并行写同一文件

5. **预算警告是一次性的** — `_strip_budget_warnings_from_history` 每轮清除旧警告，防止模型在后续 turn 里还误以为预算紧张

6. **jitter 种子必须独立** — `time_ns XOR (tick * 0x9E3779B9)` 防止并发的 Gateway 会话产生雷同的抖动值

7. **Orphan tool_call 修复是压缩的副作用** — 压缩可能删 assistant（带 tool_calls）但保留 tool result，API 拒绝这种消息列表

8. **OpenCode 的前端是 Server 状态的纯镜像** — 不自己管理状态，通过 SSE + JSON Patch 接收增量更新

9. **Claude Code AsyncGenerator yield 天然适合流式 UI** — 每个状态变化都是 yield 点，消费者通过 for-await-of 直接消费

10. **DeerFlow 的 DanglingToolCallMiddleware 用 wrap_model_call 而非 before_model** — 需要位置精确插入修复逻辑

---

## Guga 迁移判断

### P0 — 必须实现（MVP 基础能力）

| 能力 | 推荐方案 | 理由 |
|------|----------|------|
| **while + 迭代预算** | Hermes IterationBudget | 简单可靠，consume/refund 语义清晰，70%/90% 预警实用 |
| **Always Streaming** | Hermes 模式 | 自带 health check，避免无限挂住 |
| **消息清洗管线** | Hermes 五步清洗 | budget warning 剥离 + 孤儿 tool_call 修复是 API 调用的硬需求 |
| **工具调用并行** | Hermes 三层安全检查 | NEVER_PARALLEL → PARALLEL_SAFE → PATH_SCOPED，分层清晰 |
| **内层 retry 循环** | Hermes `while retry_count < 3` | 覆盖响应空、幻觉工具名、429、上下文超限 |

### P1 — 应该实现

| 能力 | 推荐方案 | 理由 |
|------|----------|------|
| **Fallback 链** | Hermes `[fallback[0], fallback[1], ...]` | 生产环境 Provider 不可用是常态 |
| **jittered backoff** | Hermes 独立种子方案 | 避免多个 session 重试雷同 |
| **工具结果溢出落盘** | Hermes 三级防御 | 200KB 工具结果直接塞 context 会撑爆窗口 |
| **Callbacks/Events 流** | 简化为 3 个 hook: onToolStart/onToolComplete/onStep | 够用且不造成 8 个回调的复杂度 |
| **中断传播** | Hermes `_interrupt_requested` 标志位 | 用户 Ctrl+C 必须能中止当前 turn |

### P2 — 可延后

| 能力 | 说明 |
|------|------|
| Claude Code 式 AsyncGenerator 全粒度 yield | 过度设计，Guga 不需要那么细的事件粒度 |
| 工具参数类型自动修正 (coerce_tool_args) | 虽然有用但优先级低于主循环稳定性 |
| Anthropic prompt cache 断点维护 | 依赖具体 Provider 选择，非通用需求 |
| 预飞行上下文压缩 | 切换模型时有用但场景有限 |

### 不建议采用

| 方案 | 原因 |
|------|------|
| DeerFlow 的纯 LangGraph 编译图 | 黑盒调试困难，Guga 不依赖 LangGraph |
| 无迭代预算的无限循环 | 生产环境必须防死循环 |
| OpenCode 的 Server-Driven Push | Guga 初期不需要多前端同步，单进程更简单 |

### Guga 最小实现建议

```typescript
interface IterationBudget {
  maxTotal: number;
  used: number;
  consume(): boolean;
  refund(): void;
  getWarning(apiCallCount: number): string | null;  // 70%→caution, 90%→warning
}

interface AgentLoopConfig {
  maxIterations: number;      // default 90
  toolDelay: number;          // default 1.0 (seconds)
  fallbackModels: FallbackModel[];
  parallelMaxWorkers: number;  // default 8
}

async function runLoop(
  messages: Message[],
  config: AgentLoopConfig,
  hooks: { onToolStart?, onToolComplete?, onStep? }
): Promise<AgentResult> {
  const budget = new IterationBudget(config.maxIterations);
  let apiCallCount = 0;

  while (apiCallCount < config.maxIterations) {
    // 1. 中断检查
    // 2. budget.consume()
    // 3. sanitizeMessages(messages) — 清洗管线
    // 4. retry loop (max 3次) → LLM call (always streaming)
    // 5. if no tool_calls → final response → break
    // 6. validate tool names → 幻觉检测
    // 7. decide parallel/serial → execute tools
    // 8. persist oversized results
    // 9. inject budget warning if needed
    // 10. context compression check
    apiCallCount++;
  }
}
```

---

## 待验证问题

1. **Guga 的实现语言** — Go/TypeScript/Python 直接决定并发模型是 goroutine 还是 async/await 还是线程池
2. **是否需要支持多 Turn 合并**（如 Claude Code 的 compact turn）— 影响消息列表结构和压缩策略
3. **中断粒度** — 是否需要像 Hermes 那样每执行一个串行工具就检查中断，还是只在 turn 边界检查
4. **流式消费者的数量** — 是否需要像 Hermes 的 8 个 callback 那样支持多消费者同时挂载
5. **API 失败后的状态恢复** — Provider 切换后是否需要回滚部分 tool results，还是直接用 fallback 模型续跑
6. **工具执行超时策略** — 默认超时多久？是否需要按工具类型差异化（文件操作 30s vs 网络搜索 120s）