---
date: 2026-06-03
topic: m4-context-policy-plugins
---

# M4 Context Manager / Context Policy Plugins 需求文档

## Summary

M4 要把 Guga 的 context 管理从“模型输入投影插件”升级为可恢复、可审计、可替换的 Attention OS：Raw Event Log 保存事实，State/Memory/Summary/Trace 形成语义投影，Context Policy 把这些材料编译成每一轮 provider request 的最小充分输入。

---

## Problem Frame

M0-M3 让 Guga 逐步拥有 core loop、plugin host、provider bridge、tool pipeline 和 permission runtime。下一层最容易失控的是 context：工具输出、历史消息、资源文件、skills、summary、host context、provider limits 和用户约束会在长任务里互相挤压，agent 开始“看见太多、忘掉关键、压缩不可解释、恢复不可验证”。

旧模型把 context 近似成不断追加的 messages，最多在窗口快满时做一次摘要。这在 demo 里足够，但撑不起可恢复 agent runtime：summary 会被误当事实源，大工具结果会污染注意力，压缩边界无法审计，session resume 只能恢复聊天文本而不是工作现场。

参考项目和 Guga 现有 roadmap 的共同结论是：context 的核心不是摘要算法，而是事实源、投影和编译产物的边界。模型输入只是某一轮的临时视图；原始事件、工具证据、artifact、压缩边界、策略决策和状态投影必须能被记录、重建和解释。

---

## Actors

- A1. 宿主应用开发者：配置 context policy、模型窗口、资源发现路径、artifact store、默认压缩行为和 host-injected context。
- A2. 插件作者：通过 context policy plugin 贡献资源、预算策略、截断策略、compaction 行为、reinjection source 或审计 annotation。
- A3. Guga core runtime：拥有事实源边界、projection contract、hook execution、event/audit 记录和 replay-safe 决策边界。
- A4. Tool runtime：提供 raw result、LLM preview、UI projection、artifact metadata、tool lifecycle correlation 和 result budget 信号。
- A5. Provider bridge / router：提供模型 context window、usage、reserved output、overflow error taxonomy 和 auxiliary summary model 能力。
- A6. Host UI / replay consumer：消费 context pressure、compact boundary、projection source list、trace/audit view 和恢复诊断。
- A7. 规划 / 实施 agent：基于本文档规划 M4，不再重新决定 context ontology、事实源边界或非目标。

---

## Key Flows

- F1. 从事实源重建当前工作现场
  - **Trigger:** Agent loop 即将处理新用户输入、resume session、fork branch 或 compact 后继续任务。
  - **Actors:** A3, A4, A6
  - **Steps:** Runtime 读取 durable events、messages、tool lifecycle、artifact refs、summary boundary 和 prior context decisions；投影出当前 goal、constraints、facts、decisions、open questions、active resources 和 recent tail。
  - **Outcome:** 当前现场不是从 provider-visible messages 猜出来的，而是从可审计事实源和派生投影重建。
  - **Covered by:** R1, R2, R3, R4, R5

- F2. 组装一次模型输入 projection
  - **Trigger:** Agent loop 即将调用 provider。
  - **Actors:** A2, A3, A4, A5
  - **Steps:** Runtime 收集 system/developer instructions、pending turn、state projection、recent coherent turns、tool previews、artifact references、resources、skills、summary 和 host context；context policies 贡献或调整 sources；budgeter 估算 token；projection 输出 provider messages、tool definitions、source metadata、policy decisions 和 audit hash。
  - **Outcome:** Agent loop 不再散落 prompt 拼接逻辑，每次模型输入都能解释来源、优先级、预算和策略决策。
  - **Covered by:** R6, R7, R8, R9, R10, R11

- F3. 大工具结果进入模型前被治理
  - **Trigger:** 工具产生超长日志、搜索结果、文件内容、diff、截图或 shell/test 输出。
  - **Actors:** A3, A4, A6
  - **Steps:** Tool runtime 保留 raw evidence；context policy 生成 LLM preview、head/tail、Smart Collapse、summary 或 artifact reference；UI/audit 仍能访问完整或更丰富视图；projection 只接收可预算的模型可见片段。
  - **Outcome:** 大工具结果不会直接撑爆模型输入，模型知道省略了什么以及如何重读完整证据。
  - **Covered by:** R12, R13, R14, R15, R16

- F4. Context overflow 后恢复当前用户意图
  - **Trigger:** Provider 返回 context-overflow / prompt-too-long，或 projection 估算超过安全阈值。
  - **Actors:** A2, A3, A5, A6
  - **Steps:** Runtime 记录 overflow；触发 compaction gate；保护 system、pending、未闭合工具轮次和 recent tail；生成 summary + boundary + retained source list；重建 projection；重试当前用户意图。
  - **Outcome:** Overflow 成为可恢复分支，而不是 run 的致命失败。
  - **Covered by:** R17, R18, R19, R20, R21, R22

- F5. 压缩后恢复工作台状态
  - **Trigger:** Manual compact、auto compact 或 reactive compact 完成。
  - **Actors:** A2, A3, A4, A6
  - **Steps:** Runtime 记录 compaction boundary；reinjection policy 恢复当前文件/资源、plan/todo、active skills、active tools、permission mode、host context 和 critical constraints；projection source list 关联 summary parent/cutoff。
  - **Outcome:** Agent 压缩后仍知道当前目标、约束、证据、计划和下一步，而不是只记得抽象摘要。
  - **Covered by:** R23, R24, R25, R26

- F6. Context policy 作为插件参与而不篡改事实源
  - **Trigger:** 宿主启用、重载或替换一个 context policy plugin。
  - **Actors:** A1, A2, A3
  - **Steps:** 插件声明 hook phase/effect/permission；runtime 按优先级和 timeout 执行；插件只能贡献 source、返回 patch/gate/annotation/reinjection decision；所有 mutating/blocking/compaction-relevant decision 进入 audit。
  - **Outcome:** 不改 core 就能扩展 context 行为，但 event log、conversation state、artifact evidence 和 provider request 边界仍由 core 保护。
  - **Covered by:** R27, R28, R29, R30

---

## Requirements

**Context ontology and source of truth**

- R1. M4 必须明确区分 Raw Event Log、Message、State Projection、Memory Candidate、Artifact、Trace、Policy Decision 和 Model Input Projection 的职责边界。
- R2. Raw event、raw tool result、artifact reference 和 compaction boundary 必须被视为可审计事实源；summary、state、memory 和 trace 是派生投影，不得替代事实源。
- R3. State projection 必须能表达当前目标、用户硬约束、已验证事实、重要决策、活动资源、关键 artifact、open questions、最近验证结果和下一步工作。
- R4. Trace 必须保存可公开、可审计的推理骨架，例如 goal、assumptions、evidence、decisions、actions、observations、validation 和 next steps；不得依赖隐藏 chain-of-thought 作为恢复基础。
- R5. Memory 在 M4 只能作为治理后的候选来源或 future slot 出现；任何跨 session 长期记忆都必须保留 scope、source、confidence、sensitivity 和 usage 语义，实际 memory 平台后置。

**Projection and attention compilation**

- R6. M4 必须定义 `ModelInputProjection` 或等价 contract，作为 agent loop 发起 provider request 前的唯一模型输入边界。
- R7. Projection 必须从 typed sources 编译 provider-visible messages 和 tools，而不是把完整聊天历史直接传给 provider。
- R8. Projection 必须记录 source metadata、token estimate、reserved output budget、policy decisions、projection hash、provider/model context 信息和 model-visible / internal-only 区分。
- R9. Projection source 至少覆盖 system/developer prompt、session history、pending turn、state projection、tool result preview、artifact reference、resource file、skill body、plan/todo、compaction summary、active tools、permission mode 和 host-injected context。
- R10. Agent loop 不得在 M4 之后散落手写 prompt 拼接；模型输入必须通过 projection 流程生成，并保留可用于 replay/audit 的决策记录。
- R11. Projection 超预算时必须产生结构化 context-pressure event，即使当前 policy 选择先不压缩。

**Tool result and artifact governance**

- R12. M4 必须把工具结果拆成 raw result、LLM preview、UI projection 和 audit metadata，避免把单一字符串同时当作事实源、界面和模型输入。
- R13. 大工具结果必须在进入模型前经过 result budget、截断、摘要化、Smart Collapse 或 artifact reference 处理。
- R14. 工具结果 preview 必须说明省略了什么、保留了什么，以及模型或 agent 后续如何重新读取完整内容。
- R15. 搜索、文件读取、shell/test 输出、diff、构建日志、截图等不同工具类型必须允许不同保留策略，不能只做统一字符数截断。
- R16. 工具结果治理必须保留 tool call/result 配对、lifecycle correlation、source refs 和 artifact refs，服务后续 compaction、audit、resume 和 replay。

**Compaction and recovery**

- R17. M4 必须支持 reactive compaction：provider context overflow / prompt too long 后 compact 并重试当前用户意图。
- R18. M4 必须支持 proactive compaction：根据上一轮 usage 或 projection estimate 接近阈值时，在下一次模型调用前 compact。
- R19. Compaction 必须保护 system/developer authority、pending turn、未闭合工具轮次、recent tail、当前用户目标和不可丢用户约束。
- R20. Compaction 必须避免产生 orphan tool call/tool result；发现非法配对时必须修复、保守保留或拒绝压缩。
- R21. Compaction result 必须包含 summary、boundary、trigger、pre/post token、retained sources、compacted sources、cutoff/parent 关系、failure/degradation 信息和质量信号插槽。
- R22. Compact 失败不得静默吞掉；runtime 必须产生可见 error event，并可降级到更保守的本地 truncation 或明确终止。

**Post-compact reinjection and state continuity**

- R23. M4 必须在 compact 后恢复当前工作状态，包括活动文件/资源、plan/todo、active skills、active tools、permission mode、host context、关键事实和 open questions。
- R24. Reinjection 不能把低优先级历史摘要、旧 memory candidate 或 tool output 提升成 system/developer instruction。
- R25. Compact boundary、summary、reinjected sources 和 retained source list 必须能投影给 UI/replay/audit consumer。
- R26. 压缩后 agent 必须能继续当前任务，而不是只记得抽象总结却丢失下一步操作上下文、证据引用或用户约束。

**Plugin surface and hook safety**

- R27. M4 必须支持 `resources.discover`、`context.assemble`、`context.budget`、`context.truncate`、`context.compact.before`、`context.compact.after` 和 `context.reinject` 等 hook phase。
- R28. Context policy hook 必须声明 phase、effect、priority、timeout、permission scope 和可审计身份。
- R29. Context policy hook 只能贡献 source、返回 typed patch、返回 gate decision、reinjection decision 或 annotation；不得直接 mutate event log、conversation state、artifact evidence 或 provider request。
- R30. Mutating、blocking、reinjection 或 compaction-relevant hook decision 必须进入 runtime/audit event；session reload、fork、switch 或 replacement 后，旧 hook context 必须失效，防止 stale plugin state 写入新 session。

**Staged delivery**

- R31. M4 必须拆成 M4a-M4e：projection skeleton、tool result budget、reactive compaction、policy hooks、post-compact reinjection/replay readiness。
- R32. M4a 可以只交付预算检查、source descriptors、state projection skeleton 和最近窗口保护，不要求 LLM summary。
- R33. M4b 必须先解决大工具结果落盘/preview/reference，再进入通用 compaction。
- R34. M4c 必须把 context overflow 变成可恢复分支。
- R35. M4d 必须证明不改 core 也能新增或替换 context policy。
- R36. M4e 必须为 M5 的 projection replay、session resume 和 audit timeline 准备 source list、projection hash、context decisions 和 compaction boundary。

---

## Acceptance Examples

- AE1. **Covers R1, R2, R3, R6, R8.** Given agent loop 即将调用 provider，当 runtime 生成模型输入时，输入来自 typed projection，并能区分事实源、状态投影、summary、tool preview、artifact reference 和 policy decision。
- AE2. **Covers R3, R23, R26.** Given 一次 compact 成功，当下一轮模型调用发生时，agent 仍能看到当前目标、硬约束、活动资源、关键事实、open questions 和下一步，而不是只看到历史摘要。
- AE3. **Covers R12, R13, R14, R15.** Given shell/test 工具返回 5MB 日志，当结果进入下一轮模型输入时，模型只看到保留关键信息的 preview 和 artifact reference，并知道完整结果如何重新读取。
- AE4. **Covers R17, R19, R20, R21.** Given provider 返回 context overflow，当 runtime 触发 reactive compact 后，system/developer authority、pending turn 和 tool call/result 配对仍合法，并产生 compact boundary 与 summary metadata。
- AE5. **Covers R22, R34.** Given compact 过程失败，当 runtime 无法安全生成 summary 时，run 不静默丢状态，而是记录失败并降级到更保守的本地 truncation 或明确终止。
- AE6. **Covers R24, R25, R29, R30.** Given 插件在 compact 后贡献 reinjection source，当该 source 生效时，runtime 保持其权限低于 system/developer instruction，并记录插件、phase、decision、source provenance 和原因。
- AE7. **Covers R30.** Given session 被 reload 或 fork，当旧 session 的 context hook 仍尝试写入时，runtime 拒绝 stale context 并产生可诊断事件。
- AE8. **Covers R31, R32, R33, R35, R36.** Given M4 分阶段实施，当只完成 M4a/M4b 时，系统已经能通过 projection 和工具结果治理降低爆窗风险；当完成 M4e 时，M5 可以基于 projection source list、context decisions 和 compaction boundary 设计 replay/resume。

---

## Success Criteria

- Guga 的 agent loop 不再直接拼接最终 prompt；每次模型输入都来自可审计 projection。
- Context 系统能解释“事实源是什么、状态从哪里投影、模型看见了什么、为什么看见、哪些内容被压缩或省略”。
- 大工具输出不会完整塞进模型输入，且模型、UI、audit 对同一工具结果有各自合适的视图。
- Context overflow 是可恢复分支，能够 compact 后继续当前用户意图。
- Compaction 不破坏 system/developer authority、pending turn 或 tool call/result 配对。
- 压缩后当前工作状态会复灌，agent 不会因为摘要而忘记活动文件、计划、skills、工具状态、关键事实或用户硬约束。
- Context policy 可以由插件扩展或替换，但不能绕过 core 的 event/audit/replay 边界。
- `ce-plan` 可以从本文档进入 M4，不需要重新决定 context ontology、长期记忆是否纳入 M4、或 projection / facts / summary 的职责边界。

---

## Scope Boundaries

- M4 不实现长期记忆、用户偏好自动提炼或跨 session semantic memory。
- M4 不实现 vector search、FTS/session search 或历史会话检索 UI。
- M4 不完成 M5 的完整 append-only event store、artifact store、session resume、fork 或 tree navigation；只定义 projection/replay 所需前置事实和边界。
- M4 不实现 M6 的完整 skills/MCP marketplace，只支持 context policy 接收 resource discovery contributions。
- M4 不实现 M8 的 enterprise context policy 管理、trust model、summary quality eval、sensitive data filtering 或 audit export。
- M4 不决定精确 TypeScript 接口、schema 字段、包路径或持久化格式；这些属于 planning。
- M4 不要求第一版 compaction 具备完美摘要质量；必须先保证结构安全、可恢复和可审计。
- M4 不把隐藏 chain-of-thought 作为 trace、resume 或 audit 的事实源。

---

## Key Decisions

- Context Manager 是 Attention OS，不是 messages 管理器：它负责在有限预算下治理事实、状态、证据、策略和模型可见视图。
- Context 是 projection，不是账本：event log、tool result、artifact、summary、trace 和 state 都保留各自职责；模型输入只是某次调用的编译产物。
- Summary 是续航手段，不是事实源：压缩摘要必须保留 parent/cutoff/boundary 和 source refs，不能覆盖原始事件或提升为高优先级指令。
- 先治理工具输出，再做通用摘要：参考项目反复证明，大工具结果是 context 爆窗的第一风险源。
- Compaction 是 runtime 事件，不是静默字符串替换：boundary、trigger、summary、pre/post token、retained sources 和 failure/degradation 都必须可见。
- Context policy 插件只能通过 typed contribution/patch/gate/reinjection/annotation 参与，不能直接改 core state 或 provider request。
- 长期记忆和检索后置：没有稳定 projection、tool result governance、compaction、state continuity 和 replay，memory 会污染 context 而不是解决 context。
- M4 采用阶段化交付：先 projection/state skeleton，再 tool result budget，再 reactive/proactive compact，最后 policy hooks、reinjection 与 replay readiness。

---

## Dependencies / Assumptions

- M4 假设 M3 已经定义稳定的 tool result contract、tool lifecycle events、permission runtime 和 provider overflow normalization。
- M4 假设 M2 能提供模型 context window、usage、reserved output 和 context-overflow error taxonomy。
- M4 假设 M1 已经提供 HookKernel、PluginHost、CapabilityRegistry、hook ordering、timeout 和 stale context guard 的基本能力。
- M4 假设完整 event store 和 artifact store 会在 M5 落地；M4 只需要定义 replay/resume 所需 projection metadata、source references 和 boundary semantics。
- M4 假设第一版可以以本地/工作区 artifact reference 表达大工具结果，不需要远端对象存储。
- M4 假设 Memory 在本阶段只作为 candidate/source 类型和未来扩展边界，不承担跨 session 自动召回职责。

---

## Outstanding Questions

### Deferred to Planning

- [Affects R1, R3, R6][Technical] 最小 context ontology 如何与现有 core event/message/context contracts 对齐？
- [Affects R3, R23][Technical] State projection 的第一版事实源来自 conversation state、event stream、plan/todo、artifact refs 还是它们的组合？
- [Affects R8, R10][Technical] Projection hash 和 source list 的粒度如何设计，才能支撑 M5 replay，同时避免记录过多敏感内容？
- [Affects R11, R18][Technical] Proactive compaction 阈值采用固定比例、provider usage、token estimate，还是组合策略？
- [Affects R12, R13, R14][Technical] Tool result store 在 M4 是否依赖 M5 artifact store，还是先实现最小本地 reference adapter？
- [Affects R15][Technical] shell/test、grep/search、read file、diff、screenshot 的 preview 策略分别采用哪些默认规则？
- [Affects R17, R21][Technical] Summary 使用主模型、辅助模型，还是先只支持手动/本地 truncation 后再接 LLM summary？
- [Affects R20][Technical] Tool call/result 配对修复应在 compaction 前、provider request 前，还是两个阶段都做？
- [Affects R23, R24][Technical] Post-compact reinjection 中 plan/todo、active skills、active tools、permission mode 和 critical constraints 的事实源分别由哪些 runtime capability 提供？
- [Affects R27, R29][Technical] Context hook 的 patch 语义如何设计，才能既可组合又不会产生难以解释的 patch 冲突？
- [Affects R4][Technical] Accountable trace 第一版如何表达 assumptions/evidence/decisions/actions，而不暴露隐藏 chain-of-thought？

---

## 参考依据

- `docs/roadmap.md`：`Fact`，定义 M4 在整体 roadmap 中的目标、范围、first-party plugins、退出标准和后续落点。
- `docs/research/agent-context-management.md`：`Fact`，提供 Guga context 管理从 L0 到 L5 的分阶段研究结论。
- `docs/research/context-policy-plugins.md`：`Fact`，记录当前 projection、hook safety、default policy、summary contract 和 ledger 边界。
- `docs/research/context-packs/context-compression.md`：`Fact`，总结 Claude Code、Hermes、OpenCode、DeerFlow 的 compaction、工具结果治理、resume 和 post-compact reinjection 模式。
- `docs/research/context-packs/agent-loop.md`：`Fact`，总结 context overflow recovery、工具配对修复、retry/fallback 和 loop integration 对 M4 的约束。
- `docs/research/context-packs/tool-registry.md`：`Fact`，说明 tool result budget、permission、hook、MCP/skills 渐进披露和工具池治理如何影响 context。
- `docs/research/context-packs/provider-abstraction.md`：`Fact`，说明 provider context window、usage、auxiliary model 和 overflow error taxonomy 对 M4 的依赖。
- `docs/research/context-packs/multi-agent.md`：`Fact`，说明 multi-agent context isolation 和 delegated prompt 自包含原则，提醒 M4 不提前做全局共享 memory。
- 用户提供的 Context Manager / Attention OS 范式稿：`Fact`，提供 Context Manager 作为 Attention OS 的范式口径，包括事件事实源、状态投影、上下文编译、压缩审计、artifact、memory、trace 和 policy plane。
- `blade-code`：`Fact`，其 `ConversationState` 分层与 snip compaction 支撑 system/history/pending 与 tool pairing 保护。
- `blade-agent-sdk`：`Fact`，其 loop recovery hooks 支撑 context overflow 作为可恢复分支。
- `claude-code`：`Fact`，其 auto-compact、PTL fallback、append-only session log 和 post-compact 状态重注入提供产品态经验。
- `opencode`：`Fact`，其 compaction message/part 与 session projection 说明 compact boundary 应成为协议事实。
- `hermes-agent`：`Fact`，其 ContextEngine、Smart Collapse、三层大工具结果防护和结构化 summary 说明 context policy 应可插拔。
- `deepagentsjs`：`Fact`，其中间件组合、大结果文件化和 summary middleware 状态处理说明 context 能力不应写死进主循环。
- `deer-flow`：`Fact`，其 middleware 兜底、dangling tool call 修复和 todo/context 自愈说明 compaction 必须保护结构合法性。
- `cc-haha`：`Fact`，其 compact boundary 进入客户端协议说明 UI/replay 需要看见 context 变化。
- `pi`：`Fact`，其 `resources_discover`、`context`、`session_before_compact` 和 runtime replacement 说明 context policy 应是 extension-first。
- 本文综合判断：`Inference`，Guga 应采用 Attention OS / projection-first / tool-result-first / plugin-policy-first 的 M4 设计，而不是单体 `ContextManager` 或提前做长期记忆平台。
