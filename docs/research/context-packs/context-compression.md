# Context Compression Context Pack

## 问题边界

**核心问题**: Agent 长对话场景下，LLM 上下文窗口是稀缺资源。一个复杂编码任务 30 轮左右就能打满 200K 窗口。系统必须解决：

1. **上下文预算分配** — 总窗口中多少给对话、多少预留给压缩/输出？
2. **压缩触发时机** — 什么条件下自动启动压缩？
3. **摘要策略** — 压缩时保留什么、丢弃什么、用什么格式？
4. **工具结果截断** — 大型工具输出如何在不丢关键信息的前提下缩减？
5. **会话持久化** — 对话状态如何存储，崩溃后如何恢复？
6. **Session Resume** — 用户回到旧会话时，如何重建完整可执行的运行时状态？
7. **历史搜索** — 被压缩掉的旧对话如何仍可检索？

**不在范围**: Memory 系统（跨会话记忆）、Multi-agent 上下文隔离（仅简要提及）。

---

## 参考项目与版本

| 项目 | Commit | 语言 | 上下文管理核心文件 |
|------|--------|------|-------------------|
| claude-code | `3d7b32f` | TypeScript | `src/services/compact/`, `src/utils/sessionStorage.ts` |
| hermes-agent | `dd0923b` | Python | `agent/context_compressor.py`, `hermes_state.py` |
| opencode | `caf1151` | TypeScript | `packages/opencode/src/.../compaction.ts`, `session.ts` |
| deer-flow | `84f88b6` | Python | LangChain `SummarizationMiddleware` 配置 |

---

## 必读分析材料

| 文件 | 主题 | 价值 |
|------|------|------|
| `docs/research/source-analysis/claude-code-analysis/analysis/04f-context-management.md` | Claude Code 上下文管理全机制 | **最重要** — Auto-Compact 触发、PTL 防御、状态重注入 |
| `docs/research/source-analysis/claude-code-analysis/analysis/04i-session-storage-resume.md` | Session 持久化与 Resume | Append-only JSONL、恢复修复流水线、运行时状态接管 |
| `docs/research/source-analysis/hermes-agent-anatomy/docs/05-上下文压缩.md` | Hermes 压缩全流程 | 两阶段压缩、结构化摘要模板、Session 分裂链 |
| `docs/research/source-analysis/hermes-wiki/concepts/context-compressor-architecture.md` | Hermes 压缩架构 v3 | 三阶段预处理、反颠簸、ContextEngine 插件化 |
| `docs/research/source-analysis/hermes-wiki/concepts/large-tool-result-handling.md` | 大型工具结果三层防护 | 单结果持久化、轮次聚合预算、预飞行压缩 |
| `docs/research/source-analysis/hermes-wiki/concepts/session-search-and-sessiondb.md` | Session 搜索与 DB | FTS5 全文搜索、链式 Session、自动修剪 |
| `docs/research/source-analysis/deerflow-book/chapters/07-context-engineering.md` | DeerFlow 上下文工程 | 多层中间件防御体系、TodoMiddleware 自愈 |
| `docs/research/source-analysis/learn-opencode/docs/flow/state_sync.md` | OpenCode 状态同步 | Server-Driven Push、SSE + JSON Patch |

---

## 必读源码文件

### Claude Code（TypeScript）

| 文件 | Tokens | 职责 |
|------|--------|------|
| `src/utils/sessionStorage.ts` | 42,872 | 会话日志系统核心：append-only JSONL、UUID 去重、sidechain |
| `src/services/compact/compact.ts` | 13,941 | 压缩主逻辑：分块摘要、PTL fallback、状态重注入 |
| `src/utils/sessionStoragePortable.ts` | 6,510 | Lite reader、头尾窗口读取、compact boundary 扫描 |
| `src/utils/conversationRecovery.ts` | 5,043 | Resume 恢复编排：链路修复、中断检测、hook 重跑 |
| `src/services/compact/sessionMemoryCompact.ts` | 4,940 | Session Memory 压缩 |
| `src/services/api/sessionIngress.ts` | 4,034 | 远端 ingress 增量同步 |
| `src/services/compact/autoCompact.ts` | 3,323 | 自动压缩触发判断、熔断器 |
| `src/utils/context.ts` | 1,589 | 上下文窗口计算、max_tokens 优化 |

### Hermes Agent（Python）

| 文件 | Tokens | 职责 |
|------|--------|------|
| `agent/context_compressor.py` | 15,488 | 压缩器核心：三阶段预处理 + LLM 摘要 + 边界对齐 |
| `trajectory_compressor.py` | 13,584 | RL 训练轨迹离线压缩（独立于在线压缩） |
| `hermes_state.py` | 25,891 | SessionDB、FTS5 搜索、session 分裂 |
| `agent/context_engine.py` | 1,642 | ContextEngine ABC 接口定义 |
| `tools/tool_result_storage.py` | — | 三层溢出防护（单结果持久化 + 轮次预算） |
| `tools/budget_config.py` | — | 工具结果阈值配置 |

### OpenCode（TypeScript）

| 文件 | Tokens | 职责 |
|------|--------|------|
| `packages/opencode/src/.../compaction.ts` | 5,215 | 压缩逻辑 |
| `packages/opencode/src/.../session.ts` | 7,754 | 会话管理 |
| `packages/opencode/src/.../summary.ts` | 1,337 | 摘要生成 |

---

## 关键抽象

### 1. 上下文预算模型

三个项目都采用"总窗口 - 预留 = 可用"模式：

```
Claude Code:  有效窗口 = 模型窗口(200K) - Summary预留(20K) = 180K
Hermes:       触发阈值 = 模型窗口 × 50% = 100K（200K 窗口时）
DeerFlow:     trigger: fraction 0.75 / tokens N / messages N（三种方式）
```

**核心差异**: Claude Code 在接近满时触发（留 13K buffer），Hermes 在 50% 就触发（更早、更频繁但每次处理量更小）。

### 2. 压缩触发机制

| 项目 | 触发策略 | 熔断/防抖 |
|------|----------|-----------|
| Claude Code | `AUTOCOMPACT_BUFFER_TOKENS=13K`，接近窗口上限时触发 | 连续失败 3 次停止（Circuit Breaker） |
| Hermes | `threshold_percent=0.50`，用到一半就触发 | 连续 2 次压缩效率 <10% → 跳过（Anti-Thrashing） |
| DeerFlow | 三种模式 messages/tokens/fraction，任一满足 | 无显式防抖 |

### 3. 摘要生成策略

**Claude Code** — 分块摘要（两条路径）：
- `summarizeChunks`：串行滚动，chunk1 摘要传入 chunk2
- `summarizeInStages`：并行切块 + 最终合并
- 5 段模板：Decisions / Open TODOs / Constraints / Pending asks / Exact identifiers
- 有质量审计 `auditSummaryQuality()`，不通过则重试

**Hermes v3** — 单次 LLM 摘要（本地预处理后）：
- 三阶段预处理零 token 成本：MD5 去重 → Smart Collapse → 参数截断
- 11 段 action-log 模板，强制编号 `N. ACTION target — outcome [tool: name]`
- 迭代更新：`_previous_summary` 基础上增量，接续编号
- 摘要模型走 auxiliary client（廉价模型如 Gemini Flash）

**DeerFlow** — LangChain SummarizationMiddleware：
- `keep` 参数保留最近 N 条/N tokens
- `trim_tokens_to_summarize=4000` 限制送入摘要模型的量
- 默认关闭 thinking 使用轻量模型

### 4. 工具结果截断 / 大型结果处理

**Claude Code**:
- 微压缩：tool output 自动裁剪到 ~2000 字符
- `stripToolResultDetails()` 去掉详情
- `repairToolUseResultPairing()` 删除孤儿对

**Hermes 三层防护**:
- Layer 1: 工具内预截断
- Layer 2: 单结果 > 100K 字符 → 写入 sandbox 磁盘，context 只保留 1.5K 预览
- Layer 3: 单轮所有结果合计 > 200K → 最大的溢出到磁盘
- Smart Collapse：按工具类型生成信息化单行摘要（`[terminal] ran npm test -> exit 0, 47 lines`）

**DeerFlow**:
- 文件系统即磁盘：长数据写文件，按需 read_file
- Sub-agent 隔离天然实现信息压缩

### 5. 会话持久化模型

**Claude Code — Append-only JSONL 事件流**:
- 每个 session 一个 `.jsonl` 文件
- 写入层极简（只追加），恢复层承担所有复杂性
- Metadata 周期性重挂到文件尾部（支持 lite reader 从 tail 64KB 快速提取）
- Subagent 独立 sidechain 文件
- 远端 ingress 副本：PUT 增量 + Last-Uuid 乐观并发
- 分层读取：小文件全量 parse，大文件只读 compact boundary 之后

**Hermes — SQLite SessionDB**:
- 消息批量 flush（水位线防重复）
- 压缩时 Session 分裂：旧 session end_reason="compression"，新 session 通过 parent_session_id 形成链
- FTS5 全文搜索支持历史回忆
- 自动修剪 + VACUUM（90 天保留，每 24 小时一次）

**OpenCode — Server-Driven Push**:
- Session 状态由 Server 维护为 Source of Truth
- SSE 推送 JSON Patch 增量到前端
- 前端是 Server 状态的"即时投影"

### 6. Session Resume 机制

**Claude Code — 运行时状态接管（最复杂）**:
```
读取 JSONL → 修复链路（snip/compact/parallel tool result）
→ 恢复 metadata/fileHistory/contextCollapse
→ 过滤非法消息（unresolved tool_use、空 assistant）
→ 检测中断 turn，注入 "Continue from where you left off"
→ 重跑 session start hooks
→ 接回 REPL（sessionId/cost/agent/worktree/context collapse 全恢复）
```

核心特点：
- `buildConversationChain()` 不是简单回溯，会补 parallel tool result 兄弟节点
- `applySnipRemovals()` 沿删除消息链向前走到存活祖先再重连
- `checkResumeConsistency()` 审计恢复前后消息数是否漂移

**Hermes — Session 链式恢复**:
- 通过 `parent_session_id` 链追溯完整历史
- `session_search` 工具搜索被压缩掉的早期内容
- 压缩后 todo list 快照注入、system prompt 重建

### 7. 状态重注入（Post-Compact）

Claude Code 压缩后消息列表的真实面貌：
```
[System 边界宣告] + [精简摘要] + [正在查看的文件截取] + [进行中的 Plan] + [激活的 MCP/Tools 声明]
```

关键 API：
- `createPostCompactFileAttachments()` — 重新附加刚读取的文件
- `createPlanAttachmentIfNeeded()` — 恢复进行中的 Plan
- `createSkillAttachmentIfNeeded()` — 恢复 Skill 状态
- `getDeferredToolsDeltaAttachment()` — 重新声明 Deferred Delta 工具

DeerFlow 的 `TodoMiddleware` 类似理念：
- 检测 `write_todos` 是否仍在上下文
- 不在则注入 `<system_reminder>` 恢复 todo list

### 8. ContextEngine 插件化（Hermes 独有）

```yaml
context:
  engine: "compressor"   # 默认；可切换为插件（如 "lcm" 向量检索）
```

ABC 要求实现：`name`、`should_compress(prompt_tokens)`、`compress(messages, current_tokens)`

意义：把"上下文快满了怎么办"从硬编码变为可插拔策略。

---

## 已确认事实

1. **Claude Code 的 sessionStorage.ts 是 42,872 tokens**——它不是简单 IO，而是整个 agent runtime 的长期状态底座
2. **Hermes 50% 触发 + 迭代摘要 vs Claude Code 接近满时触发 + 分块摘要**——两种策略各有优劣
3. **Hermes v3 本地预处理（MD5 去重 + Smart Collapse + 参数截断）能砍掉 30-50% token 且零 LLM 成本**
4. **Claude Code 的 Resume 不是"读文件回放"而是"运行时状态接管"**——恢复 sessionId/cost/agent/worktree 全链
5. **tool_call / tool_result 配对完整性是所有压缩器都必须解决的问题**——API 严格要求配对
6. **DeerFlow 的 DanglingToolCallMiddleware 用 wrap_model_call 而非 before_model**——需要位置精确插入
7. **Hermes Session 分裂的目的是让压缩后原始消息仍可被 FTS5 搜索**
8. **Claude Code 有 PTL (Prompt Too Long) 降级机制**——每次剥掉 20% 旧分组重试
9. **Claude Code 摘要有质量审计 auditSummaryQuality()**——不通过重试，兜底生成骨架
10. **OpenCode 前端是 Server 状态的纯镜像（Server-Driven Push）**——不自己管理状态

---

## Guga 迁移判断

### P0 — 必须实现（MVP 基础能力）

| 能力 | 推荐方案 | 理由 |
|------|----------|------|
| **自动压缩触发** | Hermes 的 50% 阈值 + 防抖 | 简单可靠，早压缩每次处理量小，摘要质量更高 |
| **结构化摘要** | Hermes v3 的 action-log 模板（11 段）| 比 Claude Code 5 段更丰富，强制编号防模糊 |
| **工具结果截断** | Hermes 三层防护 | 覆盖全面：单结果/轮次聚合/预飞行 |
| **tool_call 配对修复** | `_sanitize_tool_pairs()` | 不修复会导致 API 拒绝整个消息列表 |
| **Session 持久化** | Append-only JSONL（Claude Code 模式）| 写入简单、崩溃友好、增量同步容易 |

### P1 — 应该实现（体验完整性）

| 能力 | 推荐方案 | 理由 |
|------|----------|------|
| **Session Resume** | 简化版 Claude Code 恢复流水线 | 至少做到：读 JSONL → 修复配对 → 中断检测 → 续接 |
| **Post-Compact 状态重注入** | Claude Code 的文件/Plan/Skill 恢复 | 不做则模型压缩后"失忆当前工作台" |
| **本地预处理** | Hermes v3 三阶段（MD5 去重 + Smart Collapse + 参数截断）| 零 LLM 成本砍 30-50%，ROI 极高 |
| **辅助模型做摘要** | 独立 auxiliary client + 廉价模型 | 不占主模型额度，成本 $0.01-0.05/次 |
| **迭代摘要** | Hermes 的 `_previous_summary` 增量更新 | 多次压缩后摘要像持续更新的项目状态文档 |

### P2 — 可以延后（高级能力）

| 能力 | 参考 | 理由 |
|------|------|------|
| **摘要质量审计** | Claude Code `auditSummaryQuality()` | 有价值但增加复杂度 |
| **ContextEngine 插件化** | Hermes ABC | MVP 后才需要策略切换 |
| **远端 ingress 同步** | Claude Code sessionIngress | 纯本地场景暂不需要 |
| **FTS5 历史搜索** | Hermes SessionDB | 依赖 Session 分裂链，后期加 |
| **分块摘要** | Claude Code summarizeChunks/Stages | 单次摘要对常规对话够用，超长场景才需要 |
| **TodoMiddleware 自愈** | DeerFlow | 好设计但需要先有 ThreadState 持久层 |

### 不推荐采用

| 方案 | 原因 |
|------|------|
| DeerFlow 的纯 SummarizationMiddleware | 太依赖 LangChain 内置，定制空间有限 |
| 固定消息数尾部保护 | Hermes 已证明 token 预算制更合理 |
| 无 Session 分裂的压缩 | 压缩后原始内容不可搜索，信息永久丢失 |

---

## 待验证问题

1. **Guga 是否采用 TypeScript 还是 Python？** — 直接影响选 Claude Code 还是 Hermes 的实现模式
2. **目标模型的上下文窗口大小？** — 决定 threshold_percent 和预算分配
3. **是否需要支持 multi-model（主模型 + 辅助摘要模型）？** — Hermes 依赖 auxiliary client
4. **是否有远端同步需求？** — 决定是否需要 ingress 层
5. **压缩摘要的目标语言？** — Claude Code 有 "Write summary in the primary language" 指令
6. **是否需要支持 Sub-agent sidechain？** — Claude Code 的 sidechain transcript 机制相当复杂
7. **OpenCode 的 `compaction.ts`（5,215 tokens）具体分块策略细节** — 分析材料中覆盖较少，需要直接读源码确认
8. **Hermes Smart Collapse 的具体工具模板覆盖率** — 文档列出了 ~15 种工具，Guga 的工具集是否有不同
