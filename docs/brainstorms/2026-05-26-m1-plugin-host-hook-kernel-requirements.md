---
date: 2026-05-26
topic: m1-plugin-host-hook-kernel
---

# M1 插件宿主与 Hook Kernel 需求文档

## 摘要

M1 要证明：在真实 provider 插件进入 M2 之前，Guga core 已经可以被本地插件扩展。这个里程碑聚焦最小插件闭环：宿主应用可以挂载插件，插件可以注册 provider、tool、hook，core 可以消费这些插件能力完成最小运行链路，而不需要为每一种能力写死入口。

---

## 问题背景

M0 已经建立最小可用 core loop：核心契约、registry、event bus、conversation state、runtime facade、mock provider 和 test tool。下一层风险不再是 core 能不能跑完一次 tool-calling turn，而是 core 能不能从自身之外接收能力，并避免退化成一堆 first-party 特例。

Roadmap 把 Guga 定位为“小内核 + 插件生态”。如果 M1 一开始就试图解决完整插件生态，就会把插件作者体验、hook 语义、command 系统、reload、namespace 治理、marketplace trust、真实 provider transport 混在一起，导致里程碑难以验证，也会把 M2/M3 的问题提前塞回第一步插件工作。

因此 M1 的证明点要更窄：本地插件能参与 runtime 构建，注册最小 agent run 所需能力，并在生命周期结束时清理状态。Hook 在 M1 中仍然重要，但只作为生命周期与工具前置 gate 的最小证明，不承担完整未来 hook surface。

---

## 参与者

- A1. 宿主应用开发者：创建或嵌入 Guga runtime，并挂载本地插件。
- A2. 插件作者：编写贡献 runtime 能力的本地插件。
- A3. Guga core runtime：消费已注册能力，并发出可观察的 runtime 事件。
- A4. 规划 / 实施 agent：基于本文档规划 M1，不再发明产品范围。

---

## 关键流程

- F1. 宿主应用启动带插件的 runtime
  - **触发：** 宿主应用希望创建一个启用本地插件的 runtime。
  - **参与者：** A1、A3
  - **步骤：** 宿主提供一个或多个本地插件；core 在 runtime setup 阶段初始化插件；插件注册的能力进入 runtime 可用集合；runtime 使用这些能力执行最小 run。
  - **结果：** 宿主可以使用插件提供的 provider 和 tool 能力，而不需要为了每个能力修改 core。
  - **覆盖：** R1、R2、R3、R4、R5、R12

- F2. 插件作者贡献最小能力集
  - **触发：** 插件作者希望让一个本地插件可被 runtime 使用。
  - **参与者：** A2、A3
  - **步骤：** 插件声明自己是本地 runtime extension；初始化时注册 provider、tool 和 hook；core 将这些注册结果提供给 agent loop。
  - **结果：** 一个综合示例插件能端到端证明第一条插件作者路径。
  - **覆盖：** R3、R4、R5、R6、R7、R8

- F3. Hook 在工具执行前阻断 tool call
  - **触发：** 在带插件的 run 中，模型提出一个应被插件 hook gate 的 tool call。
  - **参与者：** A2、A3
  - **步骤：** Core 调用对应的 pre-tool hook；hook 返回 gate decision；core 在执行工具前尊重该 decision；decision 对测试和调试足够可见。
  - **结果：** M1 证明 hook 能在受控节点影响 runtime 行为，同时不暴露任意 core state mutation。
  - **覆盖：** R6、R7、R9、R10

- F4. Runtime 关闭插件状态
  - **触发：** 宿主应用 dispose runtime 或结束 session。
  - **参与者：** A1、A2、A3
  - **步骤：** Core 调用插件 shutdown 行为；生命周期 hook 完成或以隔离方式失败；shutdown 后旧 runtime 状态不应继续可用。
  - **结果：** 宿主拥有清晰的本地插件生命周期边界。
  - **覆盖：** R8、R11、R12

---

## 需求

**宿主侧插件使用**

- R1. 宿主应用必须能在创建或配置 Guga runtime 时挂载本地插件。
- R2. 宿主侧路径不能要求宿主手动把每个插件提供的 provider、tool 或 hook 接入 core 内部细节。
- R3. 带插件的 runtime 必须能使用插件注册的能力完成一个最小 agent run。

**插件作者接口**

- R4. M1 必须定义本地插件的最小形态，让插件作者能够提供初始化和 shutdown 行为。
- R5. 本地插件必须能注册 provider 能力。
- R6. 本地插件必须能注册 tool 能力。
- R7. 本地插件必须能为 M1 的 hook surface 注册 hook 能力。
- R8. M1 必须包含一个综合示例插件，在同一个插件内注册 provider、tool 和 hook。

**最小 hook 行为**

- R9. M1 必须支持 session/runtime start 与 shutdown 生命周期 hook。
- R10. M1 必须支持 pre-tool gate hook，可以在工具执行前允许或阻断模型提出的 tool call。
- R11. Hook 执行必须对 M1 测试足够受控：对当前插件集合有确定性顺序，与直接 core state mutation 隔离，并且在产生 gate decision 或失败时可观察。

**Runtime 可观察性与清理**

- R12. 插件初始化、能力注册、hook decision、hook failure 和插件 shutdown 必须对自动化测试与 debug inspection 足够可观察。
- R13. 插件 shutdown 必须为加载它的 runtime 实例清理插件生命周期状态。
- R14. 插件在初始化、hook 执行或 shutdown 中失败时，必须以结构化 runtime failure 或事件暴露，不能静默消失。

---

## 验收示例

- AE1. **覆盖 R1、R2、R3、R5、R6、R8。** 给定宿主使用综合示例插件创建 runtime，当它执行一个最小 user turn 时，runtime 使用插件注册的 provider 与插件注册的 tool 完成该 turn。
- AE2. **覆盖 R7、R9、R10、R11、R12。** 给定示例插件注册了 pre-tool gate hook，当模型提出一个被该 hook 阻断的 tool call 时，该 tool 不会执行，且 gate decision 可观察。
- AE3. **覆盖 R9、R13、R14。** 给定带插件的 runtime 已初始化，当 runtime shutdown 时，插件 shutdown 行为会运行，shutdown failure 会暴露而不是被吞掉。
- AE4. **覆盖 R4、R5、R6、R7、R8。** 给定插件作者阅读 M1 插件作者契约，当他们查看示例插件时，能够识别 provider、tool 和 hook 如何通过同一本地插件形态完成注册。

---

## 成功标准

- 宿主应用开发者可以把本地插件挂到 runtime 上，而不需要为该插件的 provider、tool 或 hook 修改 core 代码。
- 插件作者可以通过示例插件和测试理解最小 authoring contract。
- M1 e2e 测试证明插件提供的 provider/tool 路径和插件提供的 pre-tool gate hook。
- Runtime 事件或等价可观察输出能让插件生命周期、注册、hook decision 和失败行为可测试。
- `ce-plan` / Trellis 规划可以从本文档进入 M1，不需要再决定 command 注册、reload、namespace 治理或真实 provider transport 是否属于范围。

---

## 范围边界

- M1 不实现真实 OpenAI、Anthropic、Gemini 或 OpenAI-compatible provider 插件。
- M1 不实现 provider fallback、stream normalization、usage normalization、cost normalization、credential routing 或 provider-specific error taxonomy。
- M1 不实现 plugin reload 或 hot reload。
- M1 不把 namespace 规则、同名冲突处理或能力覆盖治理作为硬验收。
- M1 不实现 command 注册。
- M1 不实现 resource discovery、model input patching、tool result post-processing、context compaction hook 或 projection hook。
- M1 不实现 plugin marketplace、remote install、sandboxing、signing、trust policy 或 enterprise allowlist。
- M1 不实现 MCP、skills、session store、replay 或 host adapter。

---

## 关键决策

- 先做最小插件闭环：M1 先证明插件注册与 runtime 消费，再扩展到真实 provider transport 或更完整生态治理。
- Provider、tool、hook 是首批注册能力：它们足以证明 core agent loop 可被扩展，不需要提前引入 command 或 MCP 复杂度。
- Hook surface 保持有意收窄：生命周期与 pre-tool gate hook 是 M1 唯一硬需求。
- 选择一个综合示例插件，而不是多个示例插件：第一阶段优先让 authoring path 清楚，再测试多插件组合。
- Reload 延后：启动时本地插件加载足以证明 runtime contract。
- Namespace 与冲突处理延后：M1 不应静默依赖它们，但它们不是本里程碑硬验收。
- 成功标准同时看插件边界两侧：宿主应用必须能消费插件，插件作者必须能写出插件。

---

## 依赖 / 假设

- M1 假设 M0 core contracts、registry、event bus、runtime facade、mock provider 和 test tool 行为已经可用。
- M1 假设插件提供的 provider 和 tool 可以复用现有 core capability 概念，而不是重新定义 provider/tool 语义。
- M1 假设本地插件在该里程碑中是可信的开发期 extension；marketplace 与第三方 trust 问题明确后置。
- M1 假设 debug/test 可观察性可以通过 runtime events 或与 M0 对齐的等价 core-observable 机制满足。

---

## 待规划阶段解决的问题

- [影响 R1、R4][技术] 哪种宿主侧插件挂载 API 最贴合现有 runtime facade？
- [影响 R4、R8][技术] M1 应采用什么最小本地插件 packaging 形态，既方便当前测试又方便后续演进？
- [影响 R11、R12][技术] 哪些事件名称和 payload 粒度足以满足 M1 可观察性，同时不过度承诺未来 audit schema？
- [影响 R13][技术] 基于当前 M0 runtime 生命周期，M1 可以强制哪些清理保证？
