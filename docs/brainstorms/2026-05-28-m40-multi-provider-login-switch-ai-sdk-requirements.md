---
date: 2026-05-28
topic: m40-multi-provider-login-switch-ai-sdk
---

# M40 多 Provider 登录、切换与 AI SDK 适配需求文档

## 摘要

Guga 需要把多 LLM 接入产品化为一等本地 agent 能力：用户可以配置或登录多个 provider，查看可用模型，切换主模型和辅助模型，并获得清晰的健康状态与 fallback 行为。默认 AI SDK provider bridge 也必须补强，使 OpenAI、Anthropic、OpenAI-compatible 和 AI Gateway 类路径都通过 Guga 自己的 provider contract 表现一致。

---

## 问题背景

Guga 已经具备 core provider contract、provider router、model events、CLI model config，以及 first-party AI SDK bridge。这些能力证明了架构方向，但产品面还不完整：用户还不能把 Guga 当成一个可靠的多 provider agent 来使用，凭证、模型 alias、可用性、当前选择和 fallback 行为仍不够容易理解和切换。

参考项目把问题拆出了几个有价值的侧面。Pi 展示了较好的用户链路：`/login`、auth storage、自定义模型、按 auth 状态过滤可用模型、交互式模型选择。OpenCode 展示了宽 provider 覆盖：AI SDK-backed provider registry、auth hooks、模型元数据和 provider-specific loader。Claude Code 展示了明确的 provider/model 优先级和 provider-specific 默认值。CC Switch 展示了 provider SSOT 未来可以投影到多个外部 app 配置格式，但跨应用控制面不是 Guga 当前 runtime 的首要问题。

---

## 参与者

- A1. Guga CLI / workbench 用户：配置 provider、登录、选择模型，并期望每次 run 都能解释当前 provider/model。
- A2. Guga CLI / workbench host：解析配置、auth、模型 alias、当前选择、诊断信息和 runtime wiring。
- A3. Guga core runtime：消费 provider/model metadata，路由模型调用，发出可观察的模型与 fallback 事件，并把工具执行权保留在 Guga 内部。
- A4. Provider bridge 维护者：优化默认 AI SDK bridge，同时保持 Guga core contract 边界。
- A5. Plugin 或 extension 作者：可以注册额外 provider、model 或 auth method，而不需要修改 core。
- A6. 规划 / 实施 agent：基于本文档规划功能，不重新发明产品范围。

---

## 关键流程

- F1. 配置或登录 provider
  - **触发：** 用户想使用一个当前在 Guga 中不可用的 provider。
  - **参与者：** A1, A2, A5
  - **步骤：** 用户启动登录或配置流程；Guga 展示该 provider 支持的 auth 方式；凭证或 auth 状态通过认可的来源存储或解析；provider 可用性出现在模型列表和诊断信息中。
  - **结果：** 用户不需要每次 run 都传凭证，也能看到当前 credential/config 来源，且不会暴露 secret。
  - **覆盖：** R1, R2, R3, R4, R5, R16

- F2. 为 run 或 session 选择模型
  - **触发：** 用户打开模型选择、传入模型 selector，或用配置默认值启动 run。
  - **参与者：** A1, A2, A3
  - **步骤：** Guga 基于合并后的配置和 auth 状态解析模型 alias 与 provider/model 标识；不可用模型被隐藏或清晰标记；选中的主模型和辅助模型传给 runtime；run 记录实际 provider/model。
  - **结果：** 用户可以有意切换模型，session/runtime 状态也保持可解释。
  - **覆盖：** R6, R7, R8, R9, R10, R11

- F3. 通过 AI SDK bridge 执行模型调用
  - **触发：** Runtime 将一次主模型或辅助模型请求路由到默认 AI SDK bridge 背后的 provider。
  - **参与者：** A3, A4
  - **步骤：** Runtime 选择 provider/model；bridge 执行一次已选定的调用；provider 输出被归一化为 Guga response/events；tool intent 回到 Guga tool pipeline；usage、error、metadata 和 debug reference 保持可观察。
  - **结果：** 不同 provider mode 通过同一套 Guga provider contract 表现，而不是把 provider-specific 行为泄漏进 agent loop。
  - **覆盖：** R12, R13, R14, R15, R17, R18, R19

- F4. 诊断健康状态并执行 fallback
  - **触发：** 选中的 provider 缺少凭证、校验失败、rate limit、context overflow、返回 provider error，或被 host-supplied check 标记为不健康。
  - **参与者：** A1, A2, A3
  - **步骤：** Guga 分类当前状态；诊断面展示 redacted 且可操作的状态；router policy 决定 retry、fallback 或停止；model selection / fallback 事件被记录。
  - **结果：** 失败原因可理解，fallback 行为由 Guga 控制，而不是隐藏在 provider bridge 内部。
  - **覆盖：** R20, R21, R22, R23, R24

---

## 需求

**Provider auth 与配置**
- R1. Guga 必须支持为自身 runtime 配置多个命名 provider，而不是只有一个全局 provider/model。
- R2. Provider auth 至少必须支持环境变量解析的 API key 和 Guga 管理的本地 credential 来源；如果支持配置文件明文 secret，必须清晰提示风险。
- R3. Provider auth 状态必须能展示为已配置、缺失、无效或未知，且不能打印 secret 值。
- R4. Provider 登录 / 配置流程必须足够 provider-aware，能展示相关 auth 选择，而不是强迫所有 provider 走同一个裸 key prompt。
- R5. Provider/auth 配置必须与 Guga Home layered config 方向组合，而不是另起一套一次性机制。

**Model registry 与切换**
- R6. Guga 必须维护一个 model registry，将 built-in models、用户 / 项目配置、extension-registered models 和 provider auth 状态合并成一个可查询视图。
- R7. 模型列表必须区分可用模型和不可用模型，并在模型不可用时解释阻塞原因。
- R8. 模型选择必须同时支持面向用户的 alias 和显式 provider/model 标识。
- R9. Runtime 模型解析至少必须支持一个主模型和一个辅助用途模型，使便宜 / 快速 helper 调用不被迫使用主推理模型。
- R10. CLI / workbench 模型选择必须在 session override、CLI 参数、环境变量、项目配置、用户配置和默认值之间有确定性的优先级。
- R11. Session 中的模型选择变化必须在 session/runtime metadata 中可观察，使后续 resume、audit 和 debugging 能解释当时使用了哪个模型。

**AI SDK bridge 适配**
- R12. 默认 AI SDK bridge 必须保持为 provider plugin/package 的实现细节；Guga core public contract 不得暴露 AI SDK、OpenAI SDK、Anthropic SDK 或 provider-specific SDK 类型。
- R13. Bridge 必须以 MVP 质量支持 OpenAI、Anthropic、OpenAI-compatible 和 AI Gateway 类访问路径。
- R14. Bridge 必须将 provider 输出归一化为 Guga provider response 与 model event 语义，包括 text、finish reason、可用 usage、tool intent、provider metadata 和 provider errors。
- R15. 通过 AI SDK-backed provider 产生的 tool call 必须回到 Guga tool registry、hook 和 permission pipeline；bridge 不得在内部执行工具。
- R16. Bridge 必须接收 host 或 auth 层解析后的 credential/config 材料，但不得成为 credential storage policy 的所有者。
- R17. Provider-specific 差异，例如模型调用方式、headers、usage 缺口和 capability flags，必须隔离在 bridge/provider 层，并在影响行为时作为 metadata 或 diagnostics 暴露。
- R18. Bridge 必须保留足够的 redacted raw/provider metadata 用于 debugging 和 audit，但 raw provider response 不得成为 core runtime 决策的主要依据。
- R19. Bridge 必须能在没有真实 provider credentials 的情况下测试，并保留 normalization、tool-intent mapping 和 error mapping 的 hermetic tests。

**Health、fallback 与可观察性**
- R20. Guga 必须提供 provider/model health 诊断面，诊断过程不能暴露 secrets，也不能要求每个 check 默认都调用真实远端 provider。
- R21. Health diagnostics 必须区分 configuration/auth 问题和 runtime provider failure，例如 rate limit、payment、context overflow、retryable transport error 和 fatal error。
- R22. Fallback 和 retry 决策必须由 Guga provider router 或 runtime policy 拥有，而不是隐藏在 AI SDK bridge 内部。
- R23. 每次 model selection、retry、fallback、最终 provider failure 和 fallback success 都必须在 runtime events 或 diagnostics 中可观察。
- R24. 第一版 fallback policy 必须保持最小且显式：足以表达 primary-to-backup 行为和 auxiliary model routing，但不演变成完整 credential pool。

**扩展性与兼容性**
- R25. Extensions 或 plugins 必须能够注册额外 provider/model definitions，而不需要修改 Guga core。
- R26. 该功能必须为未来 OAuth providers、credential pools、外部 app config projection 和 provider marketplace 预留空间，但这些不属于 MVP 必须完成项。

---

## 验收示例

- AE1. **覆盖 R1, R2, R3, R6, R7。** 给定用户配置了 Anthropic 和 OpenAI-compatible providers，但只有一个 provider 有有效凭证，当用户列出模型时，Guga 展示有凭证 provider 的可用模型，并清晰标记或解释不可用 provider，且不暴露 secrets。
- AE2. **覆盖 R8, R9, R10, R11。** 给定用户有一个默认模型 alias，并为当前 run 传入另一个模型 selector，当 run 启动时，显式 selector 生效，选中的 provider/model 会出现在 runtime/session diagnostics 中。
- AE3. **覆盖 R12, R13, R14, R19。** 给定 hermetic tests 中配置了两个 AI SDK-backed provider modes，当两者分别返回等价 text/tool/usage/error 情况时，Guga 收到等价的归一化 provider responses/events，且 core 不导入 provider SDK 类型。
- AE4. **覆盖 R15。** 给定 AI SDK-backed model 发出 tool call，当 runtime 收到模型输出时，该调用被视为 Guga tool intent，并进入正常 tool registry/hook/permission 路径，而不是在 bridge 内执行。
- AE5. **覆盖 R20, R21, R22, R23, R24。** 给定 primary provider 失败且错误被分类为可 retry 或可 fallback，同时配置了 backup model，当 router 应用 policy 时，run 记录失败、选中的 fallback 和最终结果。
- AE6. **覆盖 R16, R17, R18。** 给定某 provider 需要 provider-specific options 或 metadata 才能正确调用，当 host 解析配置且 bridge 执行调用时，secrets 不进入 debug 输出，但影响行为的 provider 细节仍可诊断。
- AE7. **覆盖 R25, R26。** 给定 extension 注册了一个带 auth metadata 的 custom provider 和 model，当 Guga 刷新模型可用性时，该模型可以和 built-in providers 一样出现在同一个 registry 与 selection flow 中，且不需要修改 core。

---

## 成功标准

- 用户可以配置或登录多个 provider，并切换 Guga 的活跃模型，而不需要改代码或重启到另一套 provider-specific 模式。
- 模型列表和诊断能让 provider 可用性变得可理解：用户能判断模型是被 missing auth、invalid config、provider health 还是 unsupported capability 阻塞。
- OpenAI、Anthropic，以及至少一个 OpenAI-compatible 或 AI Gateway 类路径通过同一套 Guga provider contract 与 bridge 边界运行。
- Fallback 行为可见、有边界，并由 Guga runtime/router policy 拥有。
- `ce-plan` 可以直接规划 auth/config resolution、model registry、AI SDK bridge hardening、health diagnostics、fallback events 和 tests，而不需要发明产品行为或改变 core provider 边界。

---

## 范围边界

- 不在本里程碑构建 CC Switch 式写回 Claude Code、Codex、OpenCode 或其他外部 app 的 live configuration。
- 不构建 provider marketplace。
- 不构建完整 multi-key credential pools、lease management、cooldown recovery 或 enterprise key governance。
- 不要求第一版对每个 provider 都支持 OAuth。
- 不构建长期 billing dashboard、team spend controls 或 enterprise policy enforcement。
- 不把 AI SDK 类型变成 Guga core public contracts。
- 不把工具执行权移入 provider bridges。
- 不让 provider health checks 默认依赖真实网络调用；live checks 可以是 opt-in 或 host-supplied。

---

## 关键决策

- **优先服务 Guga 自身 runtime，而不是外部 app projection：** CC Switch 是有价值的后续 workbench 模式，但当前产品缺口是让 Guga 自己成为可靠的多 provider agent。
- **AI SDK 是 bridge backend，不是 core contract：** 这样既利用 AI SDK 的 provider 覆盖，又保留 Guga 的 audit、replay、hook、permission、fallback 和 event 语义。
- **采用 Pi 式用户体验：** `/login`、模型列表、auth-aware availability、自定义模型和交互式选择最贴近 Guga 用户需求。
- **谨慎采用 OpenCode 式 provider 广度：** Provider metadata、AI SDK-backed loading 和 custom auth hooks 有价值，但 Guga 应保持更小的 runtime contract 与 event model。
- **保持 fallback 显式且最小：** 第一版先证明 primary/backup 和 auxiliary routing 可理解，再进入生产级 credential pools。
- **Provider diagnostics 必须 redacted：** Debuggability 很重要，但 credentials 和 raw provider payloads 不能变成随手可见的 UI 输出。

---

## 依赖 / 假设

- 依赖 `docs/brainstorms/2026-05-26-m2-provider-ai-sdk-bridge-requirements.md` 中已有的 M2 provider runtime 与 AI SDK bridge 方向。
- 依赖 `docs/brainstorms/2026-05-28-guga-home-config-session-memory-requirements.md` 中已有的 Guga Home layered config 方向。
- 依赖现有 provider contracts、router、model events、CLI config 和默认 provider bridge 在 planning 阶段继续可用。
- 假设第一版可以广泛覆盖 API key 路径，并选择性增加 OAuth，而不是要求所有 provider 立即拥有 first-class OAuth。
- 假设 model metadata 可以先来自 configured/static/built-in sources；更丰富的外部 metadata source 可以后置。
- 假设 provider health 在 MVP 中可以部分是 synthetic 或 config-based；真实远端检查可以是可选能力。

---

## 待解决问题

### 留到规划阶段

- [影响 R2, R4][技术] 第一版哪些 provider 需要 first-class `/login` 流程，哪些先作为 API-key/config-only？
- [影响 R5, R6, R10][技术] 当用户配置和项目配置定义同一个 alias 或 provider 时，model registry 数据应如何与现有 Guga Home config 计划合并？
- [影响 R13, R17][技术] MVP 应 pin 哪些 AI SDK package versions 和 provider modes，才能让 provider 行为保持可测试？
- [影响 R14, R18, R19][技术] 当前 AI SDK bridge 缺少哪些精确的 normalized event/response 覆盖，哪些场景需要新增 fixtures？
- [影响 R20, R21][技术] 哪些 health checks 是纯本地诊断，哪些由 host 注入，哪些可以选择性调用 provider？
- [影响 R22, R24][技术] 什么样的最小 fallback policy 能覆盖 primary-to-backup 和 auxiliary routing，同时不演变成 credential pool？
- [影响 R25][技术] Extension-registered provider/model/auth capabilities 在 running session 中应如何刷新或失效？

---

## 研究依据

- `docs/research/context-packs/provider-abstraction.md`：`Fact`，总结 provider transport、credential、models.dev、prompt caching、fallback 等跨项目模式。
- `docs/research/context-packs/cc-switch-core-management.md`：`Fact`，说明 CC Switch 的 provider SSOT、live projection、proxy switch 和跨应用适配边界。
- `docs/research/source-analysis/learn-opencode/docs/internals/provider.md`：`Fact`，说明 OpenCode 的 AI SDK provider registry、auth、models.dev 和 model selection 形态。
- `docs/research/repomix/pi-token-tree.txt`：`Fact`，定位 Pi 的 auth storage、model registry、custom provider、login/model selector 等实现材料。
- `docs/research/repomix/pi-focused-context.xml`：`Fact`，提供 Pi provider/auth/model 相关源码与文档聚焦上下文。
- `docs/research/repomix/claude-code-focused-context.xml`：`Fact`，提供 Claude Code provider selection、model precedence、OpenAI/Gemini compatibility、Bedrock/Vertex/Foundry routes 等聚焦上下文。
- `docs/brainstorms/2026-05-26-m2-provider-ai-sdk-bridge-requirements.md`：`Fact`，确立 Guga core-owned provider contract 与 AI SDK bridge 边界。
- `docs/brainstorms/2026-05-28-guga-home-config-session-memory-requirements.md`：`Fact`，确立 Guga Home、layered config、model aliases 和 default model 的产品方向。
