---
date: 2026-05-27
topic: m5-session-store-replay-plugins
---

# M5 Session Store And Replay Plugins 需求文档

## Summary

M5 要把 Guga Agent 从内存态 agent loop 推进到可恢复、可回放、可分叉的 durable workbench。这个里程碑采用 **Memory-Ready Substrate** 方向：先把 session、event、artifact、projection replay 和 provenance 打牢，为后续 Hermes 式长期记忆与学习进化提供可信事实底座，但不在 M5 直接实现完整 memory 系统。

---

## Problem Frame

M0-M4 已经让 Guga 具备 core loop、plugin host、provider bridge、tool/permission runtime 和 context projection。此时最大的结构性风险是：agent 的运行事实仍主要停留在内存中。进程重启、context overflow、工具执行中断、hook 决策、permission 决策、compaction boundary 和模型实际输入如果不能持久化，后续的恢复、审计、eval、memory extraction 都只能靠猜。

Hermes agent 的“会学习”不是一个单独 memory 类，而是建立在稳定 session 历史、可搜索历史、可编辑长期记忆、provider 生命周期、压缩前抢救和离线轨迹处理上的组合能力。Guga 当前更需要先解决底座：系统必须先可靠地知道“发生过什么、模型看见过什么、工具做过什么、哪些内容被压缩或引用化”，然后长期记忆才能作为受治理的 projection 生长出来。

---

## Actors

- A1. 宿主应用开发者：为 Guga 配置本地 session/artifact/replay 插件，并在 CLI、server、worker 或测试环境中恢复 session。
- A2. 插件作者：实现或替换 session store、artifact store、replay/audit view，或在未来基于事件底座实现 memory/search/eval 插件。
- A3. Guga core runtime：拥有运行时事实、事件发布、projection、permission、hook 和 replay-safe 决策边界。
- A4. Context / projection consumer：需要重建 conversation view、model input view 和 audit view 的 UI、eval、debug 或 replay 工具。
- A5. Future memory plugin：未来基于 M5 事件和 provenance 提取长期记忆、检索上下文或生成训练轨迹的能力。
- A6. 规划 / 实施 agent：基于本文档进入 M5 规划，不再重新决定 M5 是否包含完整长期记忆、FTS 或自我进化。

---

## Key Flows

- F1. 创建并持久化一个 session
  - **Trigger:** 宿主创建新的 agent session 并开始一次 run。
  - **Actors:** A1, A3
  - **Steps:** Runtime 建立 session identity；运行中产生 run、turn、message、model、tool、permission、hook、context 等事实；store 以 append-only 方式记录这些事实；大内容通过 artifact reference 关联。
  - **Outcome:** session 不再只是内存状态，后续可以 resume、replay、fork 或审计。
  - **Covered by:** R1, R2, R3, R4, R5, R6, R7, R10

- F2. 重启后恢复 session
  - **Trigger:** 进程重启后，宿主要求恢复一个已有 session。
  - **Actors:** A1, A3, A4
  - **Steps:** Store 读取 durable event log；runtime 重建 session tree、active leaf、conversation state 和 projection ledger；检测未完成 run 或 turn；对不确定的 model/tool/hook 状态标记 interrupted；恢复到可继续或可分叉的边界。
  - **Outcome:** session 能安全回到可操作状态，且不会假装未完成副作用已经成功。
  - **Covered by:** R8, R9, R11, R12, R13, R20

- F3. 从历史节点 fork
  - **Trigger:** 用户或宿主选择历史节点继续另一个方向。
  - **Actors:** A1, A3, A4
  - **Steps:** Runtime 定位历史节点；创建新的 branch/fork lineage；保留原始历史不可变；新分支从选定节点继续写入新的事件；replay/audit view 能解释 fork 来源。
  - **Outcome:** Guga 支持 pi-style 工作台导航，历史不会被覆盖。
  - **Covered by:** R14, R15, R16, R26

- F4. 回放模型实际输入和审计轨迹
  - **Trigger:** UI、eval、debug 或测试需要确认某一 turn 中模型看到了什么、工具为什么执行、context 为什么被压缩。
  - **Actors:** A3, A4
  - **Steps:** Replay 从 durable events 和 recorded decisions 派生 conversation view、model input view、audit view；projection hash、source refs、policy decisions、permission decisions、hook decisions 和 artifact refs 共同解释结果。
  - **Outcome:** replay 不依赖当前内存状态，也不重跑 provider/tool/mutating hook。
  - **Covered by:** R17, R18, R19, R21, R22

- F5. 为未来长期记忆准备事实来源
  - **Trigger:** 后续 memory/search/eval 插件希望从 session 历史中提取偏好、决策、项目事实或训练轨迹。
  - **Actors:** A2, A5
  - **Steps:** 插件读取 durable events、projection records、compaction boundaries 和 artifact refs；按自己的 policy 生成 memory/search/RL projection；原始 session log 保持不可变。
  - **Outcome:** Hermes 式学习能力有可信来源，但不会污染 M5 的 core/session store 边界。
  - **Covered by:** R23, R24, R25, R26

---

## Requirements

**Durable store contracts**

- R1. M5 必须定义可替换的 session、event 和 artifact store 契约，让 first-party 插件和未来宿主实现能接入同一 runtime 边界。
- R2. Durable event log 必须采用 append-only 语义；正常运行中不得通过覆盖历史来表达状态变化。
- R3. 每个 durable event 必须携带不可省略的 envelope 字段：event id、schema version、session id、branch id、parent event id、stream revision 或 sequence、created_at、actor/source。
- R4. 每个 durable event 必须携带 schema version；schema 演进默认采用加性兼容和 read/replay-time upcaster，正常运行不得为了适配新 schema 改写历史事件。
- R5. Event append 必须支持 expected revision 或 idempotency key，避免 retry、崩溃恢复或并发 append 重复写入 tool result、permission decision、projection record 等事实。
- R6. Artifact reference 必须携带最小可验证 metadata：artifact id、content hash、size、mime/type、created_at；privacy tag、retention、redaction state 等治理字段留给 planning 决定粒度。
- R7. Store 层必须区分小型结构化事件和大型 artifact 内容；大工具输出、文件片段、原始 provider payload 或敏感 blob 不应默认内联进 session event。

**Session resume and interruption**

- R8. M5 必须支持进程重启后恢复 session，恢复结果至少包含可继续的 conversation state、session tree/leaf 状态和相关 projection records。
- R9. M5 必须检测 interrupted run / turn / model request / tool execution / compaction，并以结构化状态暴露给宿主。
- R10. M5 必须在关键生命周期前后持久化 marker，使恢复逻辑能够区分 completed、failed、cancelled、timeout、denied 和 interrupted。
- R11. 对未完成 provider、tool 或 mutating hook，默认恢复策略必须保守：标记 interrupted 或要求宿主决策，不自动重跑副作用。
- R12. 恢复过程必须保护 tool call / tool result 配对，不得生成会让 provider API 拒绝的非法对话链。
- R13. 恢复过程必须能发现 event log 读取异常或尾部损坏，并提供可诊断、可隔离的失败状态。

**Fork and tree navigation**

- R14. M5 必须支持从历史节点 fork 或切换 active leaf，并把 branch/fork/leaf 变化作为 durable fact 记录。
- R15. Fork 不得修改原始历史；原 session 或原 branch 必须保持 append-only 可审计。
- R16. Replay/audit view 必须能解释一个 session 或 branch 从哪里 fork、当前 leaf 是什么、哪些事件属于当前可见路径。

**Projection replay and audit**

- R17. M5 必须能从 durable events 和 recorded projection decisions 重建 conversation view、model input view 和 audit view。
- R18. Model input replay 必须能说明某一 turn 中模型实际可见的 messages、tools、context sources、policy decisions、compaction summaries、artifact refs 和 projection hash。
- R19. Audit replay 必须能解释工具调用、权限决策、hook 决策、context pressure、截断/预算、compaction boundary、usage 和错误事件。
- R20. Replay 默认不得重跑 provider、tool execution 或 mutating hook；若未来支持 simulation replay，必须作为新的 fork/trajectory，而不是覆盖原始历史。
- R21. Projection 和 replay records 必须可序列化，不应把 runtime 函数、AbortSignal、native Error 对象或不可稳定 JSON 化的数据写入持久层。
- R22. Projection records 应作为可重建的事实或索引存在；快照可以作为加载优化，但不能取代 event log 的 source-of-truth 地位。

**Memory-ready substrate**

- R23. M5 必须保留未来 curated memory 所需的 provenance：来源事件、actor/source、scope、时间、session/branch lineage、compaction boundary 和 projection decision。
- R24. M5 必须把长期记忆、session search、semantic retrieval、RL dataset export 视为后续 projection，而不是 M5 store 的隐藏副作用。
- R25. M5 的 session/fork/resume/compaction/replay 事件必须足够稳定，使未来 memory plugin 能在不重写 core 历史的情况下提取和治理长期事实。
- R26. M5 必须在 compaction commit 前、session switch 和 fork 时发布可订阅的生命周期事件，为未来 memory plugin 提供抢救事实、更新 session identity、避免 stale context 写入的窗口。

**First-party plugin scope**

- R27. M5 必须提供本地优先的 JSONL session/event store 插件，证明 append-only、resume、fork 和 replay 能通过 public store contract 实现。
- R28. M5 必须提供 filesystem artifact store 插件，证明大结果可通过 artifact reference 跨进程重读。
- R29. M5 必须提供 replay/audit 插件或等价 first-party capability，证明 conversation/model-input/audit 三类 view 能从 durable facts 派生。
- R30. First-party plugins 必须使用与 third-party 插件相同的 store/replay contract，不得依赖 core 私有捷径。

---

## Acceptance Examples

- AE1. **Covers R1, R2, R3, R4, R5, R8, R27.** Given 一个 session 已经完成多轮 user/model/tool 交互，当进程退出并重启后，宿主可以从本地 durable store 恢复该 session，且恢复结果保留合法的对话和工具配对。
- AE2. **Covers R9, R10, R11.** Given 一次 run 已记录开始但没有完成 marker，当恢复发生时，runtime 将该 run 标记为 interrupted，而不是 failed 或 completed，并把可选恢复动作交给宿主。
- AE3. **Covers R12.** Given event log 中存在 tool call started 但没有对应的 tool result / finished event，当恢复生成 conversation view 时，不会向 provider 暴露悬空 tool_use；系统要么标记 interrupted 等待 host 决策，要么按 pairing safety 规则净化。
- AE4. **Covers R14, R15, R16.** Given 用户从历史 turn fork，一个新的 branch/session lineage 被创建，原始历史保持不变，audit view 能显示 fork 来源。
- AE5. **Covers R14, R15, R16, R23.** Given 一个 session 已经发生过 compaction，当用户从 compaction 之前的 turn fork，新 branch 能引用或恢复 compaction 之前的原始事件路径，而不是只能看到 compaction summary。
- AE6. **Covers R17, R18, R20, R21.** Given 需要回放某一 turn 的模型输入，replay 使用 recorded projection 和 durable events 重建模型可见输入，并且不重新调用 provider。
- AE7. **Covers R6, R7, R19, R28.** Given 工具返回超大输出，event log 只保存 bounded preview 和 artifact reference，audit view 能解释完整输出在哪里、大小/hash 是什么、模型看见了什么。
- AE8. **Covers R23, R24, R25, R26.** Given 后续 memory plugin 想提取“用户偏好”或“项目决策”，它能从 M5 events 找到来源和 scope，并能订阅 compaction/session switch/fork 生命周期，但 M5 本身不会自动把该事实写入长期记忆。
- AE9. **Covers R24.** Given M5 完成一次完整 turn，durable store 中不存在对 `MEMORY.md`、`USER.md` 或 curated memory store 的自动写入；任何未来 memory plugin 写入都必须由独立 policy gate 负责。
- AE10. **Covers R13, R22.** Given JSONL session 文件尾部损坏，store 读取时能识别最长合法前缀并暴露 corruption 状态，而不是静默产生错误 replay。

---

## Success Criteria

- 进程重启后，Guga 可以恢复一个真实 session，并明确知道哪些 run/turn/tool 处于 completed、failed、cancelled 或 interrupted。
- 任何一次模型调用都能被 replay 到“模型当时实际看见了什么”的层级，而不是只展示当前重新拼出来的 prompt。
- 历史节点 fork 不会覆盖原始历史，branch/leaf 状态可解释、可审计。
- 大工具输出和 artifact 不再依赖内存 buffer；跨进程 replay 仍能引用或重读。
- M5 结束后，`ce-plan` 可以直接规划 store contracts、first-party plugins、resume/fork/replay 测试，不需要重新决定长期记忆是否进入本里程碑。
- 后续 memory milestone 可以把 curated memory、session search、retrieval injection、RL/export 建在 M5 事实底座上，而不是另起一套隐性历史。

---

## Scope Boundaries

- 不做 `MEMORY.md` / `USER.md` 或其他 curated memory 文件的实现。
- 不做自动 memory extraction、用户画像更新、跨 session memory injection。
- 不做 FTS/session search、向量记忆、图谱记忆或 semantic retrieval。
- 不做自我进化/RL loops、trajectory compression、batch runner 或自主 skill creation。
- 不做远端同步、多人协作、多 writer conflict resolution。
- 不做完整 privacy/retention/redaction 产品面；M5 只保留必要的 tag/reference/tombstone 方向，具体治理后置。
- 不做 replay 时默认重跑 provider、tool 或 mutating hook。
- 不把 SQLite SessionDB 作为 M5 默认主存储；SQLite/search 可以作为后续 projection 或替代 store 研究。

---

## Key Decisions

- **采用 Memory-Ready Substrate，而不是 Memory MVP。** M5 负责把 session/event/artifact/projection/replay 打牢，长期记忆作为后续 projection 实现。
- **事件是事实源。** Session search、curated memory、eval、RL dataset 和 UI audit 都应从 durable events 派生，而不是维护一套隐形真相。
- **本地 JSONL / filesystem 是 first-party MVP。** 它匹配 roadmap 的 local-first 范围，也最接近 Pi 和 Claude Code 的 append-only 恢复模型。
- **Replay 默认不重跑副作用。** Provider、tool execution 和 mutating hook 的结果来自 recorded decisions；未来 simulation replay 必须写成新 fork。
- **Artifact 与 model-visible preview 分离。** 工具完整结果、UI view、audit metadata 和 LLM preview 是不同视图，不能继续依赖单一字符串。
- **Hermes 式学习后置但不忽略。** M5 必须记录未来 memory/search/RL 所需 provenance，否则后续学习能力会变成不可审计的旁路。

---

## Dependencies / Assumptions

- M5 假设 M4 的 `ModelInputProjection`、projection hash、context decision ledger、compaction boundary 和 tool result view 是 replay 的基础输入。
- M5 假设 M3 的 tool lifecycle、permission decision、hook decision 和 result budget 事件已经足够稳定，能被持久化和审计。
- M5 假设 first-party plugins 与 third-party plugins 使用同一 contract，只是信任级别和打包方式不同。
- M5 假设 local-first store 足以支撑本里程碑；远端同步、多客户端 source-of-truth 和多人协作后置。
- M5 假设长期记忆写入需要独立 policy gate；session event log 只保存事实和 provenance，不自动把事实变成长期记忆。

---

## Outstanding Questions

### Deferred to Planning

- [Affects R3, R5][Technical] 可议 envelope 字段的第一版范围如何定：payload hash、previous event hash、causation/correlation id、privacy tag 是否全部进入 M5 MVP？
- [Affects R4][Technical] Schema upcaster 的注册、测试和失败策略如何设计，才能支持未来格式演进但不把 M5 变成迁移框架？
- [Affects R6][Technical] Artifact privacy tag、retention、redaction state 的第一版粒度如何定，才能预留治理但不过度实现 privacy 产品面？
- [Affects R8, R12][Technical] Resume 时 conversation state 如何从事件重建，同时复用现有 tool pairing safety 规则？
- [Affects R9, R11][Technical] Interrupted run 的 host-facing 状态和可选动作如何表达，才能同时服务 CLI、server、worker 和 test？
- [Affects R14, R16][Technical] Fork 是同 session 内 branch，还是新 session lineage，或者两者都支持分阶段交付？
- [Affects R17, R18, R21][Technical] Persisted model input projection 中哪些内容需要完整保存，哪些只保存 descriptor/hash/reference？
- [Affects R27][Technical] JSONL corruption handling 是接受最长合法前缀、隔离尾部，还是要求显式 repair command 才能继续？
- [Affects R29][Technical] `plugin-replay-audit` 第一版应该输出哪些 view，才能最小证明 replay 能力但不提前做 UI 产品？

---

## Research References

- `docs/roadmap.md`：`Fact`，定义 M5 的目标、范围、first-party plugins、退出标准和非目标。
- `docs/agent-memo.md`：`Fact`，给出 session persistence、curated long-term memory、retrieval/context injection 三层分离建议。
- `STRATEGY.md`：`Fact`，明确长期记忆和向量搜索应等待 session recovery、event log 和 context projection 稳定。
- `.trellis/tasks/05-27-m5-session-store-replay-plugins/research/current-codebase-constraints.md`：`Fact`，确认当前 Guga 已有事件、projection、compaction、tool result view 基础，但缺 durable store 和 resume/fork seam。
- `.trellis/tasks/05-27-m5-session-store-replay-plugins/research/session-replay-reference-patterns.md`：`Fact + Inference`，总结 Pi、Claude Code、OpenCode、Hermes 的 session/replay 模式。
- `.trellis/tasks/05-27-m5-session-store-replay-plugins/research/hermes-memory-learning-boundaries.md`：`Fact + Inference`，界定 Hermes 式学习中 M5 应准备和应后置的内容。
- `.trellis/tasks/05-27-m5-session-store-replay-plugins/research/event-sourcing-replay-best-practices.md`：`Inference`，总结 append-only、schema version、projection rebuild、artifact indirection、interrupted recovery 的工程约束。
