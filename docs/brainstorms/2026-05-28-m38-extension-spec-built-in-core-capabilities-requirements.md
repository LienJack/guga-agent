---
date: 2026-05-28
topic: m38-extension-spec-built-in-core-capabilities
---

# M38 Extension 规范与 Built-in Core Capabilities 需求文档

## 一句话结论

Guga 要引入统一的 extension 作者规范，同时把 runtime 能力边界拆成三层：core kernel、built-in core capabilities、extensions。filesystem、git、shell、provider-ai-sdk 应成为类似 pi built-ins 的内建核心能力，并作为 `packages/core` 默认随包能力提供；可选生态能力逐步迁移到 extension 规范。

---

## 问题背景

Guga 当前已经具备 plugin-oriented runtime，但现有包形态会让所有 first-party 能力看起来都像同一类 plugin。这会模糊一个重要产品边界：有些能力属于默认 coding-agent substrate，有些能力则是可选工作流、集成或生态扩展。

pi 参考项目在这里划线很清楚。它的 kernel、built-in tools、built-in providers、modes 本身不是 extensions；它们是默认 harness。Extension 是 workflow-specific 行为的作者接口，例如 plan mode、custom providers、permission gates、subagents、sandbox execution、custom UI、可通过 package 分发的扩展能力。Guga 应采用这种 layering，同时保留自己更强的 core authority：permission、hooks、execution、audit、replay 仍由 core 控制。

---

## 参与者

- A1. Guga core/runtime 维护者：负责小内核、runtime authority 和能力组合规则。
- A2. Built-in capability 维护者：维护 Guga 默认随包发行的 filesystem、git、shell、provider-ai-sdk 能力。
- A3. Extension 作者：使用统一 extension 规范添加可选工具、资源、hooks、集成、工作流或 capability bundle。
- A4. Host/workbench 开发者：加载 built-ins 和 extensions，解释 capabilities，并呈现 diff、permission 和 audit 结果。
- A5. 规划 / 实施 agent：基于本文档规划 extension spec 和 package-boundary migration，不重新发明产品范围。

---

## 关键流程

- F1. Runtime 启动并加载 built-in core capabilities
  - **触发条件：** Host 创建一个普通 Guga runtime 用于 coding-agent。
  - **参与者：** A1, A2, A4
  - **步骤：** Runtime 初始化 core kernel；built-in core capabilities 通过同一 capability registry 与 execution pipeline 注册；capability discovery 将它们标记为 built-in；默认工具和 provider bridge 行为无需加载可选 extension 即可使用。
  - **结果：** Guga 拥有类似 pi 的默认 harness，同时 runtime authority 仍集中在 core。
  - **覆盖需求：** R1, R2, R3, R4, R5

- F2. Extension 贡献可选能力
  - **触发条件：** Host 或项目启用某个 extension。
  - **参与者：** A3, A4
  - **步骤：** Extension 声明 metadata、capabilities、permissions、hooks、resources 和 override intent；loader 将其适配进 runtime；注册后的 capabilities 带着 source 和 owner metadata 进入 discovery 与 diff surface。
  - **结果：** 可选生态行为遵循同一作者规范，并且可解释。
  - **覆盖需求：** R6, R7, R8, R9, R10, R11

- F3. Extension override 或增强 built-in capability
  - **触发条件：** Extension 想替换或包装某个 built-in tool、provider 或相关 capability。
  - **参与者：** A2, A3, A4
  - **步骤：** Extension 显式声明 override；runtime 检查 namespace、trust、permission 和 effect metadata；discovery 与 diff 解释这次 replacement；所有执行仍流经 core permission、hook、execution、result 和 audit pipeline。
  - **结果：** Guga 支持类似 pi 的灵活性，但不会静默或不可审计地替换默认能力行为。
  - **覆盖需求：** R12, R13, R14, R15, R16

- F4. First-party 可选 plugins 迁移到 extension spec
  - **触发条件：** Guga 维护者将现有可选 first-party packages 转换到新的 extension authoring surface。
  - **参与者：** A1, A3, A5
  - **步骤：** 每个 package 被分类为 built-in core capability 或 optional extension；optional packages 采用 extension spec；测试验证 capability discovery、diff、shutdown 和 stale-context 行为仍然干净。
  - **结果：** Guga 避免 internal plugins 和 future external extensions 长期分裂成两套作者接口。
  - **覆盖需求：** R17, R18, R19, R20

---

## 需求

**Runtime 分层**

- R1. Guga 必须定义三层 runtime 边界：core kernel、built-in core capabilities、extensions。
- R2. Core kernel 必须保持小内核，只负责 contracts、capability registry、hook kernel、permission kernel、execution pipeline、event/audit authority 和 runtime composition。
- R3. Filesystem、git、shell、provider-ai-sdk 必须被视为 built-in core capabilities，而不是普通 optional extensions。
- R4. Built-in core capabilities 必须通过同一 capability registry 注册，并通过与 extension-provided capabilities 相同的 permission、hook、execution、result、audit pipeline 执行。
- R5. Capability discovery 必须区分 built-in core capabilities 与 extension-provided capabilities。

**Extension 作者规范**

- R6. Guga 必须为 optional ecosystem capabilities 定义统一 extension authoring spec。
- R7. Extension spec 必须支持 capability metadata、ownership、source、namespace、declared effects、permission requirements、dependencies 和 lifecycle behavior。
- R8. Extension spec v1 必须支持 optional tools、providers/models、skills/resources、MCP configurations、hooks、context policies、operations 和 capability metadata。
- R9. Commands、UI components、shortcuts、renderers 不属于 extension v1 runtime scope 的硬要求；这些能力可以等 host/workbench extension surface 稳定后再加入。
- R10. Extension authoring 必须能被 first-party optional packages 和未来 external packages 通过同一 public contract 使用。
- R11. Extension setup context 必须清楚声明可用 runtime powers，并且不能暴露绕过 core authority 的 unrestricted escape path。

**Override 与安全性**

- R12. Extension 只能通过显式 override declaration 来增强或替换 built-in core capabilities。
- R13. Built-in override behavior 必须可 discovery、可 diff、可 audit，包括哪个 extension 拥有 override、影响哪个 built-in capability。
- R14. Extension 不得静默替换 built-in core capability 或 trusted capability。
- R15. Extension-provided tools 和 overridden tools 必须仍然通过 Guga core permission、hook、execution、result、audit pipeline 执行。
- R16. Extension hooks 必须声明 phase 和 effect；mutating 或 blocking decisions 必须可审计。

**迁移与包边界**

- R17. 现有 first-party packages 必须被分类为 built-in core capability 或 optional extension。
- R18. Filesystem、git、shell、provider-ai-sdk 应作为 `packages/core` 内的 built-in core capability implementation modules 提供，但 core kernel 子层不应与具体 implementation details 混在一起。
- R19. MCP、skills、memory、artifact、replay/audit、ops/eval、delegation 以及未来 workflow integrations 等 optional first-party packages，应逐步迁移到统一 extension spec。
- R20. Migration 必须保留现有 capability behavior，除非有明确产品决策改变行为。

**可观测性与生命周期**

- R21. Runtime capability discovery 必须解释 source layer、owner、namespace、capability type、可用 trust metadata 和 registration status。
- R22. Capability diff 必须解释 built-in capabilities、extension-added capabilities、removed capabilities、overrides 和 skipped conflicts。
- R23. Extension enable、disable、reload、shutdown 不得留下 stale callable capabilities 或 active hook contexts。
- R24. Extension context 必须在 unload、reload、runtime shutdown 或 session replacement 后失效。

---

## 验收示例

- AE1. **覆盖 R1, R2, R3, R4, R5。** 给定一个普通 Guga runtime 启动，当请求 capability discovery 时，filesystem、git、shell、provider-ai-sdk capabilities 以 built-in core capabilities 形式出现，并通过同一个 core-controlled pipeline 执行。
- AE2. **覆盖 R6, R7, R8, R10, R11。** 给定一个 optional extension 声明 tool、skill resource 和 hook，当 runtime 加载它时，这些 capabilities 会带着 source、owner、namespace、effect 和 permission metadata 注册。
- AE3. **覆盖 R12, R13, R14, R15。** 给定一个 extension 尝试替换 built-in filesystem tool，当 override 未显式声明时，runtime 会 reject 或 skip 并产生可解释 conflict；当 override 显式声明且被允许时，discovery 和 diff 会显示这次 override。
- AE4. **覆盖 R17, R18, R19, R20。** 给定 first-party packages 被迁移，当维护者检查 package list 时，built-in core capabilities 和 optional extensions 有清楚 ownership categories，并且 optional extension 行为没有被非故意丢失。
- AE5. **覆盖 R21, R22, R23, R24。** 给定一个 extension 被 disable 或 reload，当随后请求 capability discovery 或尝试 tool execution 时，stale capabilities 和旧 hook contexts 不再可用，diff 能解释发生了什么变化。

---

## 成功标准

- Guga 拥有清楚的 pi-like 默认 built-in capabilities 与 optional extensions 边界。
- First-party optional packages 和未来 external packages 共用同一 extension authoring spec。
- Built-in capabilities 受到 explicit override、discovery、diff、permission 和 audit semantics 保护。
- `packages/core` 默认包含 built-in core capabilities，但内部仍保持 core kernel 与 concrete built-in implementation modules 的清晰边界。
- 下游 `ce-plan` 可以规划 package classification、extension SDK/spec work 和 first-party migration，而不需要重新打开产品边界讨论。

---

## 范围边界

- 本工作不把 core kernel internals 变成 extensions。
- 本工作不要求 commands、shortcuts、UI components 或 renderers 进入 extension v1 runtime scope。
- 本工作不建设 marketplace、signing、remote install、plugin scoring 或 package search。
- 本工作不要求所有 optional first-party packages 在一个 implementation step 内完成迁移。
- 本工作不允许 extensions 绕过 core permission、hook、execution、result、audit 或 replay authority。
- 本工作允许 `packages/core` 包含 filesystem、git、shell、provider-ai-sdk 的 built-in implementation modules，但不允许 kernel contracts/registry/hooks/permissions/execution 子层直接与具体实现耦合。

---

## 已确认决策

- Built-in core capabilities 与 optional extensions 分层：filesystem、git、shell、provider-ai-sdk 是默认 harness capabilities，类似 pi built-ins。
- Core kernel 小于 built-ins：registry、hooks、permissions、execution authority 属于 kernel；filesystem、git、shell、provider-ai-sdk 作为 `packages/core` 内的 built-in capability modules 默认提供。
- Extension spec 是 optional-capability 的共同作者接口：optional first-party packages 应迁移到这套规范，让 external extension authors 不会拿到二等 API。
- Overrides 允许但必须显式：Guga 可以比 hard deny model 更灵活，但绝不允许静默替换 built-in 或 trusted capabilities。
- Commands 和 UI extension surfaces 后置：host/workbench protocol 稳定前，不应过早锁死插件 UI。

---

## 依赖与假设

- 本文假设 Guga 继续坚持 small kernel 和 explicit runtime authority。
- 本文假设现有 plugin packages 可以增量迁移。
- 本文假设 planning 阶段会决定 built-in core capabilities 的 package layout，且不会削弱 dependency boundaries。
- 本文假设 pi 的 built-ins 与 extensions 分层适合作为 Guga 默认 coding-agent substrate 的参考模型。

---

## 待定问题

### 留待规划阶段确认

- [影响 R3, R18][技术] `packages/core` 内部应如何划分 kernel 子层与 built-in implementation modules，才能默认提供能力同时保持依赖方向清楚？
- [影响 R7, R11][技术] Extension authors 应拿到什么精确 setup context，哪些 powers 必须保持不可用？
- [影响 R12, R13, R14][技术] v1 override declaration shape 和 built-in capability replacement policy 应如何定义？
- [影响 R17, R19][技术] 哪个现有 optional first-party package 最适合作为 extension spec dogfood 首个迁移对象？
- [影响 R21, R22][技术] Capability discovery 与 diff 需要哪些 descriptor fields，才能清楚解释 built-in vs extension source？
