---
date: 2026-05-26
topic: m2-provider-ai-sdk-bridge
---

# M2 Provider Runtime 与 AI SDK Bridge 需求文档

## 摘要

M2 要证明：Guga core 可以通过插件接入真实模型 provider，同时不把 OpenAI、Anthropic 或其他厂商 SDK 变成 core 的一部分。这个里程碑不再把 `plugin-provider-openai`、`plugin-provider-anthropic` 作为第一批 first-party transport 插件，而是先定义 Guga 自己的 provider runtime contract，并提供一个默认 `plugin-provider-ai-sdk` bridge，用 Vercel AI SDK 承担供应商 transport 适配。

最终方向是：Guga 学 pi agent 的 runtime 边界和 model registry，学 deepagentsjs 的“不拥有 vendor SDK”姿态，把 Vercel AI SDK 作为默认 provider backend，而不是把 AI SDK 变成 Guga core contract。

---

## 问题背景

M1 解决的是本地插件能否注册 provider、tool、hook，并被 core runtime 消费。M2 的风险更具体：真实模型接入会天然带来 streaming 差异、tool call 差异、usage 差异、错误归一化、fallback、模型能力元数据、成本统计和 credential 解析。如果每个 provider 插件都从头实现这些 vendor transport，Guga 很快会重复造一套 Vercel AI SDK。

但反过来，如果 core 直接采用 Vercel AI SDK 的 provider 类型作为内核契约，Guga 又会失去自己的 runtime 语义：event/audit/replay、hook boundary、permission runtime、fallback policy、model selection trace、usage/cost 事件都会被外部库的抽象牵着走。

因此 M2 的核心问题不是“要不要用 Vercel AI SDK”，而是边界放在哪里：

- Guga core 拥有 agent-runtime 级 provider contract。
- `plugin-provider-ai-sdk` 使用 Vercel AI SDK 实现默认真实模型接入。
- Tool execution、permission、fallback/retry、audit/replay 仍由 Guga runtime 控制。

---

## 参与者

- A1. 宿主应用开发者：希望配置真实模型 provider，而不把厂商 SDK 直接接进 core。
- A2. 插件作者：希望实现或复用 provider bridge，向 Guga runtime 注册模型能力。
- A3. Guga core runtime：通过统一 provider contract 调用模型，并消费统一 `ModelEvent`。
- A4. Guga provider router：根据模型选择、fallback、retry policy 决定具体 provider/model 调用。
- A5. 规划 / 实施 agent：基于本文档规划 M2，不再发明 provider 边界或 first-party 插件范围。

---

## 关键流程

- F1. 宿主启用默认 AI SDK provider bridge
  - **触发：** 宿主应用希望使用真实 OpenAI、Anthropic 或 OpenAI-compatible 模型。
  - **参与者：** A1、A2、A3
  - **步骤：** 宿主挂载 `plugin-provider-ai-sdk`；插件根据配置注册一个或多个 provider/model；runtime 通过 Guga provider contract 调用模型；AI SDK bridge 在插件内部完成 vendor transport。
  - **结果：** Core 不引入 vendor SDK 类型，也能完成真实模型调用。
  - **覆盖：** R1、R2、R3、R4、R5、R6

- F2. Core 消费统一模型事件流
  - **触发：** Agent loop 发起一次 streaming 或 non-streaming 模型调用。
  - **参与者：** A3、A4
  - **步骤：** Provider bridge 将底层 stream/generate 结果归一化为 Guga `ModelEvent`；core 只处理统一事件；文本、reasoning、tool intent、finish、usage、raw metadata 和 error 都以可观察事件进入 runtime。
  - **结果：** Agent loop 中不出现 provider-specific 分支。
  - **覆盖：** R11、R12、R13、R14

- F3. Router 控制 fallback 与 retry
  - **触发：** 模型调用失败、限流、上下文溢出，或宿主配置了主模型 / 辅助模型路由。
  - **参与者：** A1、A3、A4
  - **步骤：** Provider bridge 返回结构化 `ProviderError`；router 根据 Guga policy 决定是否 retry、fallback 或终止；每次选择与失败都产生可观察事件。
  - **结果：** AI SDK 只负责单次模型调用，Guga runtime 保留选择、重试、审计和成本控制权。
  - **覆盖：** R18、R19、R20、R21、R22、R23

- F4. 模型 tool intent 回到 Guga 工具管线
  - **触发：** 模型输出 tool call / tool input / tool result 相关 stream part。
  - **参与者：** A3、A4
  - **步骤：** AI SDK bridge 把底层 tool call 表达转换为 Guga tool intent 事件；core 将 tool intent 交给 Guga tool registry、hook kernel 和 permission runtime；bridge 不自动执行工具。
  - **结果：** Provider bridge 可以利用 AI SDK 的 provider 兼容能力，但不会绕过 Guga 的 tool 权限与审计边界。
  - **覆盖：** R24、R25、R26、R27

- F5. Model hooks 观察和补充模型调用
  - **触发：** Runtime 即将发起模型调用，或收到模型响应之后。
  - **参与者：** A2、A3、A4
  - **步骤：** `model.request.before` 可以返回 prompt/context/tool definition patches；`model.response.after` 可以记录 usage、cache、trace annotation；hook 不能直接调用 provider，也不能改写 provider 原始响应。
  - **结果：** 插件可以参与模型输入/输出周边行为，同时 provider transport 保持单一受控入口。
  - **覆盖：** R28、R29、R30、R31、R32

---

## 需求

**Core-owned provider contract**

- R1. M2 必须定义 Guga 自己的 provider runtime contract，作为 core 与 provider 插件之间的唯一稳定边界。
- R2. Core provider contract 必须独立于 Vercel AI SDK、LangChain、OpenAI SDK、Anthropic SDK 或任意 vendor SDK 类型。
- R3. Provider 插件必须能向 runtime 注册 provider、model metadata 和模型调用能力。
- R4. Provider contract 必须覆盖主模型和辅助模型路由所需的最小信息，包括模型标识、能力、context window、tool support、reasoning/thinking support 和 usage 可用性。
- R5. M2 必须定义 `ModelRegistry` 或等价模型注册能力，让 runtime 可以查询当前可用模型及其 metadata。
- R6. Model registry 在 M2 只要求支持静态配置、环境变量和宿主注入配置；完整 credential pool、OAuth 和企业密钥治理后置。

**默认 AI SDK bridge**

- R7. M2 第一批 first-party 真实 provider 插件应是 `plugin-provider-ai-sdk`，而不是拆分的 `plugin-provider-openai`、`plugin-provider-anthropic` 和 `plugin-provider-openai-compatible`。
- R8. `plugin-provider-ai-sdk` 必须在插件内部使用 Vercel AI SDK 接入至少 OpenAI、Anthropic 和一个 OpenAI-compatible 或 AI Gateway 路径。
- R9. `plugin-provider-ai-sdk` 必须把 AI SDK 的 provider/model 调用结果转换为 Guga provider contract，不得把 AI SDK 类型泄漏到 core public contract。
- R10. M2 必须保留未来新增原生 provider 插件或 LangChain bridge 的空间，但这些不是 M2 硬验收。

**Model event streaming**

- R11. Core 必须只消费统一 `ModelEvent`，不直接处理 provider-specific stream part。
- R12. `ModelEvent` 必须能表达文本增量、reasoning/thinking 增量、tool intent、finish、usage、provider metadata、raw chunk reference 和 error。
- R13. Streaming 与 non-streaming 调用必须进入同一套 runtime 事件语义，差异只体现在事件产生方式，不体现在 agent loop 分支。
- R14. Provider bridge 必须保留足够 raw metadata 引用用于 debug/audit，但 raw provider response 不能成为 core 行为判断的主要输入。

**Usage、成本与错误归一化**

- R15. Provider bridge 必须输出归一化 `ModelUsage` 或等价 usage 事件，至少覆盖 input tokens、output tokens、total tokens、cache/reasoning token 信息中 provider 可提供的部分。
- R16. M2 必须定义 usage/cost 事件边界：provider bridge 负责上报可得 usage，Guga runtime 负责把 usage 纳入 session/run 级可观察事件。
- R17. 当 AI SDK 或底层 provider 不提供 pricing metadata 时，M2 可以只记录 usage 与未知成本状态，但不得静默伪造成本。
- R18. M2 必须定义 provider error taxonomy，至少覆盖 `auth`、`rate-limit`、`context-overflow`、`payment`、`retryable`、`fatal`。
- R19. Provider error 必须携带足够的 provider/model/request metadata，让 router、debug view 和 audit log 能解释失败来源。

**Routing、fallback 与 retry**

- R20. Guga provider router 必须拥有模型选择、fallback 和 retry policy 的最终决策权。
- R21. AI SDK bridge 只执行 router 选定的单次 provider/model 调用，不在插件内部隐藏跨模型 fallback 决策。
- R22. 每次 model selection、retry、fallback、final failure 都必须以 runtime 可观察事件呈现。
- R23. M2 必须支持宿主表达主模型和至少一种辅助模型用途，但不要求实现复杂多模型调度。

**Tool 与 permission 边界**

- R24. Provider bridge 可以接收并传递 tool definitions，但模型产生的 tool intent 必须回到 Guga tool pipeline。
- R25. Provider bridge 不得自动执行工具，也不得绕过 Guga hook kernel、tool registry 或 permission runtime。
- R26. AI SDK 的 tool streaming / tool call normalization 可以作为 bridge 内部实现细节复用，但 Guga core 只接收 Guga tool intent 事件。
- R27. M2 不要求完成 M3 的真实 tool permission runtime，但 provider bridge 的设计不能让 M3 无法接管 tool execution。

**Model hooks**

- R28. `model.request.before` hook 必须能在模型调用前返回受控 prompt/context/tool definition patches。
- R29. `model.request.before` hook 不能直接调用 provider，也不能拿到可绕过 router 的 provider client。
- R30. `model.response.after` hook 必须能观察模型响应、usage、cache、trace annotation 和 provider metadata。
- R31. `model.response.after` hook 不能改写 provider 原始响应，也不能 retroactively 改变已经进入 event log 的模型事实。
- R32. Model hook 的 patch、annotation、failure 和耗时必须对测试、debug 和 audit 足够可观察。

---

## 验收示例

- AE1. **覆盖 R1、R2、R7、R8、R9。** 给定宿主挂载 `plugin-provider-ai-sdk` 并配置 OpenAI 模型，当 runtime 发起一次模型调用时，core 不依赖 OpenAI SDK 或 AI SDK 类型，也能收到统一 Guga model events。
- AE2. **覆盖 R7、R8、R11、R12、R13。** 给定同一条 agent loop 测试分别使用 OpenAI 与 Anthropic 路径，当模型返回文本和 finish 信息时，core 通过同一套 `ModelEvent` 语义处理两次响应。
- AE3. **覆盖 R15、R16、R17。** 给定 provider 返回 usage 信息，当模型调用结束时，runtime 产生 usage 事件；如果成本无法计算，事件明确标记成本未知，而不是填入错误成本。
- AE4. **覆盖 R18、R19、R20、R21、R22。** 给定一次模型调用遇到 rate-limit error，当 provider bridge 返回归一化错误时，router 根据 Guga policy 决定 fallback 或终止，并记录 model selection / failure 事件。
- AE5. **覆盖 R24、R25、R26、R27。** 给定模型通过 AI SDK bridge 输出 tool call，当 runtime 收到该 tool intent 时，工具执行仍进入 Guga tool pipeline，bridge 不直接执行工具。
- AE6. **覆盖 R28、R29、R30、R31、R32。** 给定插件注册了 model hooks，当 runtime 发起并完成模型调用时，请求前 patch 和响应后 annotation 可观察，且 hook 无法绕过 router 或改写 provider 原始响应。
- AE7. **覆盖 R3、R4、R5、R6、R23。** 给定宿主配置主模型和一个辅助模型，当 runtime 初始化 provider registry 时，调试输出可以解释每个模型的 provider、能力和用途。

---

## 成功标准

- Agent loop 中没有 `if provider === ...` 或 provider-specific SDK 类型判断。
- Guga core 的 provider contract 可以被 `plugin-provider-ai-sdk` 实现，但不依赖 AI SDK 类型。
- 至少两个真实 provider 路径通过同一套 model event / usage / error normalization 测试。
- Provider router 的 fallback/retry 决策在 Guga runtime 内可观察、可审计，而不是隐藏在 bridge 内部。
- 模型产生的 tool intent 不会绕过 Guga tool registry、hook kernel 和未来 permission runtime。
- `ce-plan` / Trellis 规划可以从本文档进入 M2，不需要再决定 M2 是否自研 OpenAI/Anthropic transport。

---

## 范围边界

- M2 不实现单独的原生 `plugin-provider-openai`、`plugin-provider-anthropic` 或 `plugin-provider-openai-compatible` transport。
- M2 不把 Vercel AI SDK 类型设为 Guga core public contract。
- M2 不实现 provider marketplace。
- M2 不实现完整 credential pool、OAuth、企业密钥轮换或 provider health pool。
- M2 不实现 M3 的真实 tool permission runtime，但必须保持 tool execution 边界可接管。
- M2 不实现 context compaction、session replay、host adapters 或 UI projection。
- M2 不实现 LangChain bridge；只保留后续可接入空间。
- M2 不要求完整成本定价表；当 pricing metadata 不可靠或缺失时，明确记录未知状态即可。
- M2 不承诺支持所有 AI SDK provider，只要求覆盖 OpenAI、Anthropic 和一个 OpenAI-compatible 或 AI Gateway 路径。

---

## 关键决策

- Guga 拥有 provider runtime contract，AI SDK 只是默认 bridge 的内部依赖。
- M2 first-party provider 插件从多个 vendor-native 插件收敛为一个 `plugin-provider-ai-sdk`。
- 不重复造 Vercel AI SDK 已经解决的 vendor transport 适配，但也不把 Guga 的 audit/replay/hook/router 语义外包给 AI SDK。
- 借鉴 pi agent 的 `Provider`、`ModelRegistry`、stream event、usage/cost 边界，但把 M2 范围收窄到 Guga 当前 plugin host 能验证的最小闭环。
- 借鉴 deepagentsjs 的外部模型对象姿态：Guga 不需要拥有每个 vendor SDK；不同之处是 Guga 需要比 deepagentsjs 更强的事件、fallback、usage、审计和 hook contract。
- Tool execution 永远回到 Guga runtime；模型只能提出 tool intent，provider bridge 不能决定工具是否执行。
- Router 在 Guga 侧做 fallback/retry；AI SDK bridge 做单次 provider/model 调用。
- `model.request.before` 与 `model.response.after` 是 M2 的 model hook 边界，但 hook 不能直接调用 provider 或改写 provider 原始响应。

---

## 依赖 / 假设

- M2 假设 M1 已经提供可用的 plugin host、capability registry、hook kernel 和最小 provider 注册路径。
- M2 假设 core 已有或即将稳定基本 message、tool intent、usage、event bus 和 agent loop contract。
- M2 假设 Vercel AI SDK 足以覆盖 M2 的默认真实 provider 接入，不需要在该里程碑自研 OpenAI/Anthropic transport。
- M2 假设 provider API key 可以通过环境变量、宿主配置或静态配置注入；复杂 credential 体系后置。
- M2 假设不同 provider 的 reasoning、cache、usage 字段不完全一致，因此 normalization 必须允许字段缺失和 provider metadata 保留。

---

## 参考依据

- `docs/research/context-packs/provider-abstraction.md`：`Fact`，提供 provider abstraction 的跨项目对比与 Guga 迁移建议。
- Vercel AI SDK：`Fact`，`ProviderV3` / `LanguageModelV3`、`customProvider`、provider registry、middleware、AI Gateway、OpenAI-compatible provider 说明其适合作为 bridge backend。
- pi agent：`Fact`，其 `Provider`、`Model`、`ModelRegistry`、stream event、usage/cost 设计说明 runtime contract 应属于 agent 自身。
- deepagentsjs：`Fact`，其 `LanguageModelLike | string` 模型注入方式说明 agent framework 可以不拥有 vendor SDK。
- 本文综合判断：`Inference`，Guga 应学习 pi 的 runtime 边界，学习 deepagentsjs 的 vendor SDK 外置姿态，并使用 Vercel AI SDK 作为默认 provider bridge，而不是照搬任何一个项目。

---

## 待规划阶段解决的问题

- [影响 R1、R11、R12][技术] Guga `ModelEvent` 的精确字段、事件粒度和 raw metadata 引用方式是什么？
- [影响 R7、R8、R9][技术] M2 应 pin 哪个 Vercel AI SDK package/version，以及如何隔离其 breaking changes？
- [影响 R8、R17][技术] OpenAI-compatible 或 AI Gateway 测试路径选择哪一个 provider，才能同时覆盖兼容性和 CI 可维护性？
- [影响 R15、R16、R17][技术] 当 AI SDK usage 缺少 pricing metadata 时，成本事件由 bridge、router 还是独立 pricing policy 负责补全？
- [影响 R24、R25、R26][技术] 如何明确禁用或绕开 AI SDK 的自动 tool execution，只保留 tool call normalization？
- [影响 R20、R21、R22][技术] Router fallback/retry policy 的最小配置形态是什么，才能覆盖 M2 验收而不提前进入生产级 provider health pool？
