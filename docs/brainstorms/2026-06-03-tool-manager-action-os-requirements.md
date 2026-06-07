---
date: 2026-06-03
topic: tool-manager-action-os
---

# Tool Manager Action OS 需求补强

## Summary

这份文档将 Guga 的 tool runtime 从“可插拔工具执行管线”补强为一套 Action Operating System：工具是带意图、权限、凭证、沙盒、证据、上下文投影和审计语义的行动能力，而不是简单函数注册。

---

## Problem Frame

Guga 的既有 M3 已经定义了 plugin-contributed tools、ExecutionPipeline、PermissionKernel、result budget、hook gate、并发调度和 lifecycle events。这个骨架足以支撑安全执行真实 filesystem、shell、git 和 MCP 类工具的第一版闭环。

新的压力来自 tool 体系继续扩展后的语义复杂度：同一个工具来源可能包含 read、write、external send、subagent delegation、credential-bound API call、sandboxed execution 和大结果证据沉淀。若这些语义只靠工具名、prompt 描述或各插件自觉维护，runtime 很难稳定回答“模型为什么看到这个工具”“这次调用代表谁行动”“哪些资源会被读写”“完整证据在哪里”“结果如何影响 context、memory 或 audit”。

---

## Actors

- A1. Guga core runtime：负责把模型提出的行动请求转成受治理、可审计、可恢复的真实工具执行。
- A2. 插件作者：贡献工具、MCP adapter、skill-like capability、subagent delegation 或 host-provided backend。
- A3. 宿主应用开发者：配置可用工具、权限 profile、sandbox/credential policy、artifact/session store 和 UI 投影。
- A4. 模型 provider bridge：接收 runtime 编译后的模型可见工具视图，并把模型 tool call 归还给 Guga runtime。
- A5. Context / memory / audit 子系统：消费工具结果、artifact、证据引用和生命周期事件，决定哪些内容进入模型上下文或长期记录。
- A6. 后续 planner / implementer：基于本文档规划 tool contract 和 runtime 补强，不重新发明产品边界。

---

## Key Flows

- F1. 编译模型可见工具视图
  - **Trigger:** Runtime 准备一次 provider request。
  - **Actors:** A1, A3, A4
  - **Steps:** Runtime 从 canonical registry 读取工具能力；结合当前任务意图、permission profile、host policy、backend health、workspace/sandbox 和预算过滤工具；生成只对本轮模型调用有效的工具视图；记录哪些工具被暴露、隐藏或拒绝。
  - **Outcome:** 模型只看到当前行动租约允许的工具，而不是完整系统能力或永久权限。
  - **Covered by:** R1, R2, R3, R4, R5

- F2. 将模型调用转成受控行动
  - **Trigger:** 模型返回一个或多个 tool call。
  - **Actors:** A1, A2, A3, A4
  - **Steps:** Runtime 关联用户目标和当前任务；校验工具、参数和资源作用域；运行 pre-call / pre-execute gate；解析权限、凭证和 sandbox 要求；执行工具；归一化结果；把模型可见预览、UI 投影、audit metadata 和 artifact reference 分离。
  - **Outcome:** 真实副作用只发生在 runtime 的确定性边界之后，并且调用链可以被审计、回放和恢复。
  - **Covered by:** R6, R7, R8, R9, R10, R11, R12, R13

- F3. 工具结果成为证据而不是上下文垃圾
  - **Trigger:** 工具产生大输出、结构化结果、外部副作用或验证材料。
  - **Actors:** A1, A5
  - **Steps:** Runtime 保存完整结果或引用；为模型生成预算内 preview；保留 evidence refs、artifact refs、redaction 和 verifier 状态；Context / memory / audit 子系统基于这些视图各取所需。
  - **Outcome:** 模型上下文保持轻量，audit 和 UI 仍能追溯完整事实源。
  - **Covered by:** R14, R15, R16, R17

- F4. 多来源 capability 进入统一行动语义
  - **Trigger:** 插件、MCP server、skill、CLI backend、HTTP API 或 subagent capability 被启用。
  - **Actors:** A1, A2, A3
  - **Steps:** Capability 先被归一化为 canonical action capability；声明来源、effect、risk、permission、credential、sandbox、context policy、observability 和 trust metadata；runtime 再决定是否进入模型工具视图或仅作为 runtime-only capability。
  - **Outcome:** 不同来源的能力共享同一套治理语言，而不是在 agent loop 中形成分支和例外。
  - **Covered by:** R18, R19, R20, R21

---

## Requirements

**Canonical capability and model projection**

- R1. Guga 必须区分 canonical tool/capability descriptor 与 provider-specific tool schema；发给模型的 schema 是临时编译产物，不是系统事实源。
- R2. Runtime 必须支持 ToolView / capability lease 语义：一次模型请求中的工具可见性只对当前任务阶段、权限 profile、host policy、backend 状态和预算有效。
- R3. Tool visibility 决策必须可解释，至少能说明工具为何可见、隐藏、禁用、缺 backend、被 policy 拒绝或不在 workspace/sandbox 范围内。
- R4. Provider bridge 不得根据完整 registry 自行组装或执行工具；它只能消费 runtime 编译后的工具视图，并把模型 tool call 返回 runtime。
- R5. 同名能力、第三方能力和 MCP 能力不得静默覆盖 first-party 或 host-protected 工具；冲突、跳过和显式覆盖必须可观察。

**Intent and action governance**

- R6. Tool call 必须关联可审计的行动意图，而不只是工具名和参数；该意图应能表达用户目标、当前任务、行动类别、目标资源、预期副作用和约束摘要。
- R7. Runtime 必须保留“模型提出行动”和“runtime 执行行动”的边界；模型可以建议调用，真实执行必须经过 validation、policy、permission、sandbox 和 hook gate。
- R8. Tool effect 语义必须比单一 read/write 更细，能覆盖读取、搜索、计算、转换、写入、执行、外部发送、删除、管理动作、认证、记忆读写和 subagent delegation 等行动类别。
- R9. 权限决策必须同时考虑工具 effect、资源作用域、principal/credential 约束、host profile、session remembered decision 和 hook gate，而不是只依赖工具静态默认值。
- R10. 高风险、外部副作用、credential-bound、destructive 或 open-world 能力必须默认 fail closed，除非 host policy 明确给出更宽松的运行边界。
- R11. Runtime 必须能表达工具使用的 principal 和 credential binding；凭证明文不得进入 prompt、message、tool result preview 或普通 artifact projection。
- R12. 工具执行必须能声明 sandbox/环境要求，包括工作区边界、网络出站边界、执行 backend、timeout、输出预算和可取消性。
- R13. Tool lifecycle event 必须能串起 request、visibility、validation、permission、credential/sandbox resolution、execution、result projection、artifact/evidence 和 terminal status。

**Results, evidence, and context boundary**

- R14. 工具结果必须至少区分完整事实源、模型可见 preview、UI projection 和 audit metadata；不同视图不得互相污染。
- R15. 大工具输出、外部响应、日志、diff、测试结果和网页内容不得默认完整进入模型上下文；应通过 preview、摘要、artifact reference 或 evidence reference 进入后续投影。
- R16. Tool result projection 必须显式标注截断、redaction、artifact 引用、重新读取提示或 verifier 状态，避免模型误把 preview 当完整事实。
- R17. 工具结果可以产生 memory candidate 或 state patch，但这些派生更新必须可追溯到 tool evidence，不能把工具输出直接混进长期记忆。

**Multi-source capability ontology**

- R18. Tool Manager 必须统一描述 builtin、first-party plugin、third-party plugin、MCP、host、CLI/backend、skill-like procedure 和 subagent delegation 的来源与 trust level。
- R19. Skill 不应被简单等同于 tool；skill 更偏 procedure/context activation，只有其中可执行的受控动作才进入 tool-like capability。
- R20. MCP 工具进入统一 registry 前必须被 namespaced、标注来源、继承或补全 effect/risk/permission/context policy，并接受相同 visibility 和 execution pipeline 约束。
- R21. Subagent delegation 必须作为 tool-like capability 治理：输入、允许上下文、允许工具、预算、超时、权限、summary result、artifact 和 trace 都应受控。

**Evaluation and operability**

- R22. Tool metadata 必须被视为模型行为控制面；工具名、描述、use-when/do-not-use-when、参数说明和负例应该能被 eval。
- R23. Guga 必须支持 tool selection eval：给定 golden prompts 和 negative prompts，可以评估期望工具选择、参数有效性、unsafe call rate 和 approval trigger rate。
- R24. Debug / audit 视图必须能回答一次工具调用前模型看到了哪些工具、哪些工具被过滤、为什么调用该工具、谁授权、在哪个环境执行、读写了什么、完整证据在哪里。

---

## Acceptance Examples

- AE1. **Covers R1, R2, R3, R4.** Given runtime 正在准备一次模型请求，当某个工具因缺少 backend 或 host policy 不允许而不可用时，模型工具视图不包含该工具，audit 能解释过滤原因。
- AE2. **Covers R6, R7, R9, R13.** Given 模型提出一个写入类工具调用，当该调用需要用户确认时，runtime 先创建权限决策并记录行动意图；若用户拒绝，真实工具不执行，模型收到结构化未执行结果。
- AE3. **Covers R10, R11, R12.** Given 一个外部 API 工具需要用户 OAuth scope，当 scope 不满足或凭证不可用时，runtime fail closed，并且不会把 token 或 secret 暴露给模型上下文。
- AE4. **Covers R14, R15, R16, R17.** Given shell/test 工具输出大量日志，当结果回流时，模型只收到预算内 preview 和 evidence/artifact reference；audit 仍能追踪完整输出及其是否被截断。
- AE5. **Covers R18, R20.** Given MCP server 贡献一个第三方工具，当它进入 Guga registry 时，它拥有稳定 namespace、source/trust metadata、effect/risk/permission 标注，并经过与 first-party 工具相同的 visibility filter。
- AE6. **Covers R19, R21.** Given 一个 skill 或 subagent 可以执行真实动作，当 agent 想调用它时，runtime 以 tool-like capability 管理其输入、预算、权限、上下文隔离和返回摘要。
- AE7. **Covers R22, R23.** Given 一个新工具描述容易诱导模型误用，当 tool selection eval 跑过负例 prompts 时，系统能暴露误选率或 unsafe call rate，而不是只依靠人工读描述判断。
- AE8. **Covers R24.** Given 宿主打开审计视图检查一次危险工具调用，当调用已经完成或被拒绝时，视图能重建工具可见性、调用意图、权限来源、执行环境、资源作用域、结果投影和证据引用。

---

## Success Criteria

- Guga 的 tool 体系可以被描述为“行动治理层”：模型只提出行动，runtime 决定可见性、授权、隔离、执行、证据和回流。
- 未来新增 MCP、skill、subagent、HTTP/API 或 credential-bound 工具时，不需要在 agent loop 中新增工具来源分支。
- Downstream `ce-plan` 可以从本文档规划 contract/runtime 补强，而不需要重新决定 ToolView、ToolIntent、credential/sandbox/evidence/eval 是否属于 tool 范围。
- 宿主和 audit 能解释每次工具调用的可见性、意图、权限、执行环境、结果视图和证据来源。
- Context / memory 相关工作可以消费工具 evidence 和 artifact reference，而不是直接吞掉未治理的大工具输出。

---

## Scope Boundaries

- 不直接替换既有 M3；本文是对 M3 tool/runtime 的需求补强和后续演进边界。
- 不在本需求中指定具体 TypeScript 字段、类名、文件结构或 provider wire format；这些属于规划和实现阶段。
- 不实现企业级 policy engine、marketplace governance、插件签名、组织级审批流或策略控制台。
- 不要求第一版实现完整远程 sandbox、container/VM provider、credential broker 产品或 OAuth 刷新流程。
- 不要求把所有 skill 变成 tool；只治理其中产生真实动作或 tool-like delegation 的部分。
- 不要求 MCP 支持所有传输协议；本文只要求 MCP 工具进入统一治理语义。
- 不要求 UI 完整实现审计页面或权限弹窗；本文只定义 runtime 必须提供足够信息。
- 不要求 immediate code implementation；本文档先作为 `ce-plan` 的输入。

---

## Key Decisions

- Tool schema 是编译产物，不是事实源：这保留 provider 可替换性，并避免把 OpenAI/Anthropic/MCP wire shape 误当 core contract。
- ToolView 使用能力租约语义：工具可见性随任务、权限、环境和预算变化，避免模型把工具列表理解为永久授权。
- Intent 是 tool call 的一等审计对象：Guga 不记录隐藏思维链，但需要记录可公开解释的行动摘要。
- Credential 与 sandbox 纳入 tool runtime 语义：真实 agent 工具迟早会代表用户或服务账号行动，不能靠 prompt 管 secret 和执行边界。
- 工具结果先成为 evidence，再进入 context：这让 Context Manager、Memory 和 Audit 能共享事实源，但按各自预算投影。
- Skill、MCP、CLI/backend 和 subagent 是不同层：它们可以贡献 tool-like capability，但不能被混成同一种 function wrapper。
- Tool metadata 必须 eval：工具描述是模型选择行为的控制面，应该像 prompt 一样被测试。

---

## Dependencies / Assumptions

- 依赖既有 M3 的 ExecutionPipeline、PermissionKernel、hook gate、scheduler、result budget 和 lifecycle event 基线。
- 依赖 M4 的 context projection / tool result store / artifact reference 思路继续承接工具结果治理。
- 依赖 M5 之后的 durable session / replay / artifact store 能保存足够审计事实。
- 依赖 M6 的 skills/MCP/capability discovery 将多来源能力接入统一 registry。
- 假设 Guga 继续坚持 core-owned safety boundary，插件可以贡献能力和 hook，但不能独占最终执行授权。
- 假设第一版允许用轻量 metadata 表达 credential/sandbox/verifier 语义，不一次性实现完整产品级 broker 或 sandbox marketplace。

---

## Outstanding Questions

### Deferred to Planning

- [Affects R1, R2][Technical] ToolView / capability lease 应该如何与现有 capability registry 和 provider tool projection 对齐，避免重复维护两套可见性逻辑？
- [Affects R6][Technical] ToolIntent 的最小可审计字段是什么，既能解释行动，又不泄漏隐藏推理或制造过重记录负担？
- [Affects R8, R9][Technical] Action/effect taxonomy 应该如何从现有 `read/write/execute/external` 演进，才能兼容旧工具并覆盖新风险类别？
- [Affects R11, R12][Technical] Credential binding 和 sandbox policy 第一版是否只作为 metadata/audit 语义，还是需要进入执行前强制 gate？
- [Affects R14, R15, R16][Technical] Tool result 的完整事实源、LLM preview、UI projection 和 audit metadata 是否由同一个 result policy 生成，还是拆成独立 policy 能力？
- [Affects R18, R20][Needs research] MCP 工具 effect/risk/permission 缺失时，Guga 应默认禁止、默认 external/ask，还是允许 host 提供补充 policy？
- [Affects R22, R23][Technical] Tool selection eval 应该接入现有 eval flywheel，还是先作为 tool package 级 fixture 单独维护？

---

## 参考依据

- `docs/brainstorms/2026-05-26-m3-tool-plugins-permission-runtime-requirements.md`：`Fact`，现有工具插件、权限 runtime、执行管线、结果预算和 lifecycle event 需求基线。
- `docs/roadmap.md`：`Fact`，定义 Guga core、plugin ecosystem、tool/permission、context、skills/MCP、host protocol 和 audit/replay 的整体路线。
- `docs/research/context-packs/tool-registry.md`：`Fact`，总结参考项目在工具注册、权限三态、并发、MCP、hook 和结果截断上的共识。
- `docs/research/context-packs/context-compression.md`：`Fact`，提供工具结果治理、artifact reference、context projection 和 tool call/result 配对约束。
- `docs/solutions/architecture-patterns/tool-permission-runtime.md`：`Fact`，沉淀 M3 的核心架构决策与当前限制。
- `docs/brainstorms/2026-05-27-m6-skills-mcp-capability-discovery-requirements.md`：`Fact`，说明 skills/MCP/capability discovery 与统一 registry 的关系。
- 本文综合判断：`Inference`，Guga 的下一步不是重写 M3，而是将 tool contract 从执行安全扩展为行动治理语义。
