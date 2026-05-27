---
date: 2026-05-27
topic: m4-context-policy-plugins
---

# M4 Context Policy Plugins

## Summary

M4 将把 Guga 的 context 管理定义为插件驱动的模型输入投影系统。它需要把 context 装配、预算、工具结果治理、压缩、压缩后复灌和来源审计讲清楚，让后续 planning 可以直接拆实现任务，同时不把长期记忆或检索提前塞进这个 milestone。

---

## Problem Frame

当前 roadmap 已经把 Guga 定位为小内核加插件生态。Context 管理是最难的边界，因为它同时牵扯 agent loop、provider context window、工具结果、skills/resources、compaction、event log、UI projection 和未来 replay。如果 M4 被写成一个单体 `ContextManager`，它要么会膨胀进 core，要么会把插件和 host 必须能观察的策略决策藏起来。

参考项目在同一个压力点上收敛：模型输入必须是 durable facts 的一次 projection，而不是 durable fact 本身。工具输出比普通对话历史更容易撑爆上下文；压缩如果忽略消息结构，会破坏 tool-call 配对；压缩后必须恢复当前工作状态；每次模型请求都需要来源信息，后续 replay 和 audit 才能解释模型到底看见了什么。

---

## Requirements

**Projection Contract**

- R1. M4 必须把模型输入定义为由 context sources 装配出来的 projection，而不是直接修改 conversation history。
- R2. 每次模型输入 projection 必须包含 source metadata、token estimate、reserved output budget、policy decisions，以及足够支撑 replay/audit 重建输入的标识。
- R3. Context policy plugins 可以贡献 sources 或 typed patches，但不能直接 mutate 原始 event log 或 conversation state。

**Tool Result Governance**

- R4. M4 必须先治理大工具结果，再做通用对话摘要；raw result、LLM preview、UI view 和 audit metadata 是不同视图。
- R5. 大工具输出给模型时必须变成 preview 和 artifact reference，并清楚说明省略了什么、如何重新读取。
- R6. 工具结果截断必须保留测试、搜索、文件读取、diff、shell output 继续有用所需的关键信息。

**Compaction And Recovery**

- R7. Context overflow 必须是可恢复分支：在安全条件下 compact、重建 projection，并重试当前用户意图。
- R8. Compaction 必须保留 system messages、pending turn state、recent tail，以及合法的 tool call/result 配对。
- R9. Compaction 必须产生可见的 boundary、summary、trigger、pre/post token、retained-source 和 failure events。
- R10. Post-compact reinjection 必须恢复 active files/resources、plan/todo、active skills、active tools、permission mode 和 host context。

**Plugin Surface**

- R11. M4 必须支持 resource discovery、context assembly、budgeting、truncation、compaction-before、compaction-after 和 reinjection hooks。
- R12. Hook effects 必须声明、排序、设置 timeout、限定 permission scope，并进入 audit。
- R13. Session reload、fork 或 replacement 后，旧的 context hook state 必须失效。

**Roadmap Shape**

- R14. M4 应该拆成实现切片：projection skeleton、tool result budget、reactive compaction、policy hooks、post-compact replay readiness。
- R15. M4 必须明确延后 long-term memory、vector search、FTS/session search、enterprise policy UI 和 summary quality eval。

---

## Success Criteria

- Planner 可以把 M4 直接拆成实现任务，而不需要重新发明 context policies 的职责边界。
- M4 在架构模式层面覆盖全部九个参考项目，同时把具体实现细节留给 planning。
- Roadmap 能清楚说明哪些内容属于 M4，哪些应该进入 M5、M6 或 M8。
- 后续代码工作可以分别测试 context projection、大工具结果治理、compaction recovery 和 source provenance。

---

## Scope Boundaries

- M4 不实现 long-term memory 或用户偏好提炼。
- M4 不实现 vector search 或 semantic retrieval。
- M4 不实现完整 session store 持久化，只预留 M5 所需的 projection/replay contract。
- M4 不实现企业 policy 管理或插件 trust UI。
- M4 不决定精确 schema、文件名或 package layout；这些留给 planning。

---

## Key Decisions

- 将 context 视为 projection，而不是 state store：这样 event log、UI、replay 和 model input 不会塌缩成一个脆弱表示。
- 先治理工具输出，再总结对话历史：参考项目反复证明，大工具结果是 context 失败的第一爆点。
- 让 compaction 可见且可审计：静默替换摘要会伤害恢复能力和用户信任。
- 将 M4 拆成阶段切片：第一阶段可以不依赖 LLM summary 先交付，后续再加入 reactive/proactive compaction 和 reinjection。

---

## Dependencies / Assumptions

- M4 依赖 M3 的 tool result contract、permission runtime、tool lifecycle events 和 provider overflow normalization。
- M4 为 M5 的 append-only event store 和 projection replay 做准备，但不完成它们。
- 实现语言和具体 package layout 仍然是 planning 阶段决策。
