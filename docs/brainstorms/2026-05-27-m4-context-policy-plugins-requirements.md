---
date: 2026-05-27
topic: m4-context-policy-plugins
---

# M4 Context Policy Plugins 需求文档

## Summary

M4 要把 Guga 的 context 管理做成插件驱动的模型输入投影系统：模型输入由 durable events、conversation state、工具 artifact、resources、skills、pending turn 和 compaction summary 共同投影，而不是由 agent loop 临时拼 prompt。这个里程碑交付 context assembly、预算、工具结果治理、压缩恢复、压缩后复灌和 source audit 的产品级边界，同时明确把长期记忆、向量检索和企业策略平台后置。

---

## Problem Frame

M0-M3 让 Guga 逐步拥有 core loop、plugin host、provider bridge、tool pipeline 和 permission runtime。下一层最容易失控的是 context：一旦工具输出、历史消息、资源文件、skills、summary、host context 和 provider limits 混在一起，agent 会开始“看见太多、忘掉关键、压缩不可解释、恢复不可验证”。

参考项目给出的共同结论是：context 的复杂度不在“摘要算法”，而在边界。模型输入不能等同于完整历史；summary 不能替代事实源；工具结果必须先被预算和引用化；压缩必须保护 system/pending/tool pairing；压缩后必须复灌当前工作台状态；每次模型输入都要能解释来源，否则 M5 的 session replay 和 M8 的 audit/eval 都会没有根。

---

## Actors

- A1. 宿主应用开发者：配置 context policy、模型窗口、资源发现路径、artifact store 和默认压缩行为。
- A2. 插件作者：通过 context policy plugin 贡献资源、预算策略、截断策略、compaction 行为或 post-compact reinjection。
- A3. Guga core runtime：拥有 projection contract、hook execution、event/audit 记录和 replay-safe 决策边界。
- A4. Tool runtime：向 context policy 提供 raw result、LLM preview、UI projection、artifact metadata 和 result budget 信号。
- A5. Provider bridge / router：提供模型 context window、usage、reserved output、overflow error taxonomy 和 auxiliary summary model 能力。
- A6. Host UI / replay consumer：消费 compact boundary、context pressure、projection source list 和 audit view。
- A7. 规划 / 实施 agent：基于本文档规划 M4，不再重新决定 context policy 的职责边界或非目标。

---

## Key Flows

- F1. 组装一次模型输入 projection
  - **Trigger:** Agent loop 即将调用 provider。
  - **Actors:** A2, A3, A4, A5
  - **Steps:** Runtime 收集 system/history/pending/tool result/resource/skill/summary sources；context policies 贡献或调整 sources；budgeter 估算 token；projection 输出 provider messages、tool definitions、source metadata 和 audit hash。
  - **Outcome:** Agent loop 不再散落 prompt 拼接逻辑，每次模型输入都能解释来源。
  - **Covered by:** R1, R2, R3, R4, R5, R6

- F2. 大工具结果进入模型前被治理
  - **Trigger:** 工具产生超长日志、搜索结果、文件内容、diff 或 shell/test 输出。
  - **Actors:** A3, A4, A6
  - **Steps:** Tool runtime 保留 raw result；context policy 生成 LLM preview、head/tail、Smart Collapse 或 artifact reference；UI/audit 仍可访问完整或更丰富视图。
  - **Outcome:** 大工具结果不会直接撑爆模型输入，模型知道省略了什么以及如何重读。
  - **Covered by:** R7, R8, R9, R10, R11

- F3. Context overflow 后恢复当前用户意图
  - **Trigger:** Provider 返回 context-overflow / prompt-too-long，或 projection 估算超过安全阈值。
  - **Actors:** A2, A3, A5, A6
  - **Steps:** Runtime 记录 overflow；触发 `context.compact.before`；保护 system、pending 和未闭合工具轮次；生成 summary + recent tail + boundary；重建 projection；重试当前用户意图。
  - **Outcome:** overflow 成为可恢复分支，而不是 run 的致命失败。
  - **Covered by:** R12, R13, R14, R15, R16, R17

- F4. 压缩后恢复工作台状态
  - **Trigger:** Manual compact、auto compact 或 reactive compact 完成。
  - **Actors:** A2, A3, A4, A6
  - **Steps:** Runtime 记录 compaction boundary；reinjection policy 恢复当前文件/资源、plan/todo、active skills、active tools、permission mode 和 host context；projection source list 关联 summary parent/cutoff。
  - **Outcome:** Agent 压缩后仍知道当前目标、约束、文件、计划和下一步。
  - **Covered by:** R18, R19, R20, R21

- F5. Context policy 作为插件参与而不篡改事实源
  - **Trigger:** 宿主启用或重载一个 context policy plugin。
  - **Actors:** A1, A2, A3
  - **Steps:** 插件声明 hook phase/effect/permission；runtime 按优先级和 timeout 执行；插件只能贡献 source、返回 patch/gate/annotation；所有 mutating/blocking decision 进入 audit。
  - **Outcome:** 不改 core 就能扩展 context 行为，但 event log 和 conversation state 仍由 core 保护。
  - **Covered by:** R22, R23, R24, R25, R26

---

## Requirements

**Projection contract**

- R1. M4 必须定义 `ModelInputProjection` 或等价 contract，作为 agent loop 发起 provider request 前的唯一模型输入边界。
- R2. Projection 必须区分 durable facts 与 model-visible messages；原始 event log、tool result 和 artifact 不得被 summary 替代。
- R3. Projection 必须记录 source metadata、token estimate、reserved output budget、policy decisions、projection hash 和 provider/model 相关 context 信息。
- R4. Projection source 至少覆盖 system/developer prompt、session history、pending turn、tool result preview、artifact reference、resource file、skill body、plan/todo、compaction summary 和 host-injected context。
- R5. Agent loop 不得在 M4 之后散落手写 prompt 拼接；模型输入必须通过 projection 流程生成。
- R6. Projection 超预算时必须产生结构化 context-pressure event，即使当前 policy 选择先不压缩。

**Tool result governance**

- R7. M4 必须把工具结果拆成 raw result、LLM preview、UI projection 和 audit metadata，避免把单一字符串同时当作事实源、界面和模型输入。
- R8. 大工具结果必须在进入模型前经过 result budget、截断、摘要化或 artifact reference 处理。
- R9. 工具结果 preview 必须说明省略了什么、保留了什么，以及模型或 agent 后续如何重新读取完整内容。
- R10. 搜索、文件读取、shell/test 输出、diff、构建日志等不同工具类型必须允许不同保留策略，不能只做统一字符数截断。
- R11. 工具结果治理必须保留 tool call/result 配对和 lifecycle correlation，服务后续 compaction、audit 和 replay。

**Compaction and recovery**

- R12. M4 必须支持 reactive compaction：provider context overflow / prompt too long 后 compact 并重试当前用户意图。
- R13. M4 必须支持 proactive compaction：根据上一轮 usage 或 projection estimate 接近阈值时，在下一次模型调用前 compact。
- R14. Compaction 必须保护 system messages、pending turn、未闭合工具轮次和 recent tail。
- R15. Compaction 必须避免产生 orphan tool call/tool result；发现非法配对时必须修复、保守保留或拒绝压缩。
- R16. Compaction result 必须包含 summary、boundary、trigger、pre/post token、retained sources、cutoff/parent 关系和失败信息。
- R17. Compact 失败不得静默吞掉；runtime 必须产生可见 error event，并可降级到更保守的本地 truncation。

**Post-compact reinjection**

- R18. M4 必须在 compact 后恢复当前工作状态，包括活动文件/资源、plan/todo、active skills、active tools、permission mode 和 host context。
- R19. Reinjection 不能把低优先级历史摘要提升成 system/developer instruction。
- R20. Compact boundary、summary 和 reinjected sources 必须能投影给 UI/replay/audit consumer。
- R21. 压缩后 agent 必须能继续当前任务，而不是只记得抽象总结却丢失下一步操作上下文。

**Plugin surface and hook safety**

- R22. M4 必须支持 `resources.discover`、`context.assemble`、`context.budget`、`context.truncate`、`context.compact.before`、`context.compact.after` 和 `context.reinject` 等 hook phase。
- R23. Context policy hook 必须声明 phase、effect、priority、timeout、permission scope 和可审计身份。
- R24. Context policy hook 只能贡献 source、返回 typed patch、返回 gate decision 或 annotation；不得直接 mutate event log、conversation state 或 provider request。
- R25. Mutating、blocking 或 compaction-relevant hook decision 必须进入 runtime/audit event。
- R26. Session reload、fork、switch 或 replacement 后，旧 hook context 必须失效，防止 stale plugin state 写入新 session。

**Staged delivery**

- R27. M4 必须拆成 M4a-M4e：projection skeleton、tool result budget、reactive compaction、policy hooks、post-compact reinjection/replay readiness。
- R28. M4a 可以只交付预算检查和最近窗口保护，不要求 LLM summary。
- R29. M4b 必须先解决大工具结果落盘/preview/reference，再进入通用 compaction。
- R30. M4c 必须把 context overflow 变成可恢复分支。
- R31. M4d 必须证明不改 core 也能新增 context policy。
- R32. M4e 必须为 M5 的 projection replay 准备 source list、projection hash 和 context decisions。

---

## Acceptance Examples

- AE1. **Covers R1, R2, R3, R4, R5.** Given agent loop 即将调用 provider，当 runtime 生成模型输入时，输入来自 `ModelInputProjection`，并能列出 system、history、pending、tool previews、resources 和 summary 的来源。
- AE2. **Covers R7, R8, R9, R10.** Given shell/test 工具返回 5MB 日志，当结果进入下一轮模型输入时，模型只看到保留关键信息的 preview 和 artifact reference，并知道完整结果如何重新读取。
- AE3. **Covers R12, R14, R15, R16.** Given provider 返回 context overflow，当 runtime 触发 reactive compact 后，system、pending 和 tool call/result 配对仍合法，并产生 compact boundary 与 summary metadata。
- AE4. **Covers R17, R30.** Given compact 过程失败，当 runtime 无法安全生成 summary 时，run 不静默丢状态，而是记录失败并降级到更保守的本地 truncation 或明确终止。
- AE5. **Covers R18, R19, R20, R21.** Given 一次 auto compact 成功，当下一次模型调用发生时，agent 仍能看到当前计划、活动文件、active skills 和下一步，而不是只看到历史摘要。
- AE6. **Covers R22, R23, R24, R25.** Given 插件注册 `context.compact.before` hook 并取消一次 compaction，当该 decision 生效时，runtime 记录插件、phase、effect、decision 和原因。
- AE7. **Covers R26.** Given session 被 reload 或 fork，当旧 session 的 context hook 仍尝试写入时，runtime 拒绝 stale context 并产生可诊断事件。
- AE8. **Covers R27, R28, R29, R31, R32.** Given M4 分阶段实施，当只完成 M4a/M4b 时，系统已经能通过 projection 和工具结果治理降低爆窗风险；当完成 M4e 时，M5 可以基于 projection source list 设计 replay。

---

## Success Criteria

- Guga 的 agent loop 不再直接拼接最终 prompt；每次模型输入都来自可审计 projection。
- 大工具输出不会完整塞进模型输入，且模型、UI、audit 对同一工具结果有各自合适的视图。
- Context overflow 是可恢复分支，能够 compact 后继续当前用户意图。
- Compaction 不破坏 system 优先级、pending turn 或 tool call/result 配对。
- 压缩后当前工作状态会复灌，agent 不会因为摘要而忘记活动文件、计划、skills 或工具状态。
- Context policy 可以由插件扩展，但不能绕过 core 的 event/audit/replay 边界。
- `ce-plan` 可以从本文档进入 M4，不需要重新决定 M4 是否包含长期记忆、向量检索、FTS 或企业 policy 平台。

---

## Scope Boundaries

- M4 不实现长期记忆、用户偏好自动提炼或跨 session semantic memory。
- M4 不实现 vector search、FTS/session search 或历史会话检索 UI。
- M4 不完成 M5 的 append-only event store、artifact store、session resume、fork 或 tree navigation，只定义 projection/replay 所需前置。
- M4 不实现 M6 的完整 skills/MCP marketplace，只支持 context policy 接收 resource discovery contributions。
- M4 不实现 M8 的 enterprise context policy 管理、trust model、summary quality eval、sensitive data filtering 或 audit export。
- M4 不决定精确 TypeScript 接口、schema 字段、包路径或持久化格式；这些属于 planning。
- M4 不要求第一版 compaction 具备完美摘要质量；必须先保证结构安全、可恢复和可审计。

---

## Key Decisions

- Context 是 projection，不是账本：event log、tool result、artifact 和 summary 都保留，模型输入只是某次调用的投影。
- 先治理工具输出，再做通用摘要：参考项目反复证明，大工具结果是 context 爆窗的第一风险源。
- Compaction 是 runtime 事件，不是静默字符串替换：boundary、trigger、summary、pre/post token 和 retained sources 都必须可见。
- Context policy 插件只能通过 typed contribution/patch/gate/annotation 参与，不能直接改 core state。
- M4 采用阶段化交付：先 projection skeleton，再 tool result budget，再 reactive/proactive compact，最后 reinjection 与 replay readiness。
- 长期记忆和检索后置：没有稳定 projection、tool result governance、compaction 和 replay，memory 会污染 context 而不是解决 context。

---

## Dependencies / Assumptions

- M4 假设 M3 已经定义稳定的 tool result contract、tool lifecycle events、permission runtime 和 provider overflow normalization。
- M4 假设 M2 能提供模型 context window、usage、reserved output 和 context-overflow error taxonomy。
- M4 假设 M1 已经提供 HookKernel、PluginHost、CapabilityRegistry、hook ordering、timeout 和 stale context guard 的基本能力。
- M4 假设完整 event store 和 artifact store 会在 M5 落地；M4 只需要定义 replay 所需 projection metadata。
- M4 假设第一版可以以本地/工作区 artifact reference 表达大工具结果，不需要远端对象存储。

---

## Outstanding Questions

### Deferred to Planning

- [Affects R1, R3][Technical] `ModelInputProjection` 的最小字段如何与现有 core event/message contract 对齐？
- [Affects R6, R13][Technical] Proactive compaction 阈值采用固定比例、provider usage、token estimate，还是组合策略？
- [Affects R7, R8, R9][Technical] `ToolResultStore` 在 M4 是否依赖 M5 artifact store，还是先实现最小本地 reference adapter？
- [Affects R10][Technical] shell/test、grep/search、read file、diff 的 preview 策略分别采用哪些默认规则？
- [Affects R12, R16][Technical] Summary 使用主模型、辅助模型，还是先只支持手动/本地 truncation 后再接 LLM summary？
- [Affects R15][Technical] Tool call/result 配对修复应在 compaction 前、provider request 前，还是两个阶段都做？
- [Affects R18, R19][Technical] Post-compact reinjection 中 plan/todo、active skills、active tools 的事实源分别由哪些 runtime capability 提供？
- [Affects R22, R24][Technical] Context hook 的 patch 语义如何设计，才能既可组合又不会产生难以解释的 patch 冲突？
- [Affects R32][Technical] Projection hash 和 source list 的粒度如何设计，才能支撑 M5 replay，同时避免记录过多敏感内容？

---

## 参考依据

- `docs/roadmap.md`：`Fact`，定义 M4 在整体 roadmap 中的目标、范围、first-party plugins、退出标准和后续落点。
- `docs/research/agent-context-management.md`：`Fact`，提供 Guga context 管理从 L0 到 L5 的分阶段研究结论。
- `docs/research/context-packs/context-compression.md`：`Fact`，总结 Claude Code、Hermes、OpenCode、DeerFlow 的 compaction、工具结果治理、resume 和 post-compact reinjection 模式。
- `docs/research/context-packs/agent-loop.md`：`Fact`，总结 context overflow recovery、工具配对修复、retry/fallback 和 loop integration 对 M4 的约束。
- `docs/research/context-packs/tool-registry.md`：`Fact`，说明 tool result budget、permission、hook、MCP/skills 渐进披露和工具池治理如何影响 context。
- `docs/research/context-packs/provider-abstraction.md`：`Fact`，说明 provider context window、usage、auxiliary model 和 overflow error taxonomy 对 M4 的依赖。
- `docs/research/context-packs/multi-agent.md`：`Fact`，说明 multi-agent context isolation 和 delegated prompt 自包含原则，提醒 M4 不提前做全局共享 memory。
- `blade-code`：`Fact`，其 `ConversationState` 分层与 snip compaction 支撑 system/history/pending 与 tool pairing 保护。
- `blade-agent-sdk`：`Fact`，其 loop recovery hooks 支撑 context overflow 作为可恢复分支。
- `claude-code`：`Fact`，其 auto-compact、PTL fallback、append-only session log 和 post-compact 状态重注入提供产品态经验。
- `opencode`：`Fact`，其 compaction message/part 与 session projection 说明 compact boundary 应成为协议事实。
- `hermes-agent`：`Fact`，其 ContextEngine、Smart Collapse、三层大工具结果防护和结构化 summary 说明 context policy 应可插拔。
- `deepagentsjs`：`Fact`，其中间件组合、大结果文件化和 summary middleware 状态处理说明 context 能力不应写死进主循环。
- `deer-flow`：`Fact`，其 middleware 兜底、dangling tool call 修复和 todo/context 自愈说明 compaction 必须保护结构合法性。
- `cc-haha`：`Fact`，其 compact boundary 进入客户端协议说明 UI/replay 需要看见 context 变化。
- `pi`：`Fact`，其 `resources_discover`、`context`、`session_before_compact` 和 runtime replacement 说明 context policy 应是 extension-first。
- 本文综合判断：`Inference`，Guga 应采用 projection-first、tool-result-first、plugin-policy-first 的 M4 设计，而不是单体 `ContextManager` 或提前做长期记忆平台。
