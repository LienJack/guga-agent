# M2 Provider Runtime 与 AI SDK Bridge

## Goal

M2 要证明 Guga core 可以通过插件接入真实模型 provider，同时不把 OpenAI、Anthropic、Vercel AI SDK 或其他厂商 SDK 类型变成 core public contract。默认真实模型接入收敛为一个 `plugin-provider-ai-sdk` bridge：插件内部使用 Vercel AI SDK 做供应商 transport 适配，Guga runtime 继续拥有 provider contract、model events、tool intent、hook、router、fallback/retry、usage/cost observation 和 audit/replay 边界。

## What I Already Know

* 用户已提供完整需求草案：`docs/brainstorms/2026-05-26-m2-provider-ai-sdk-bridge-requirements.md`。
* 当前仓库是 TypeScript + pnpm workspace，已存在 `packages/core`，根脚本包含 `pnpm typecheck`、`pnpm test`、`pnpm build`。
* 当前 core provider contract 位于 `packages/core/src/contracts/provider.ts`，还是 M0/M1 的非 streaming `Provider.generate()` 形态，只表达 final、tool_calls、failure 和基础 usage。
* 当前事件 contract 位于 `packages/core/src/contracts/events.ts`，已有 `model.requested`、`model.responded`、`usage.recorded`、hook/plugin/tool 事件，但尚无 streaming `ModelEvent`、model selection、retry、fallback、provider error taxonomy 或 model registry 事件。
* 当前 hook contract 位于 `packages/core/src/contracts/hooks.ts`，已有 `runtime.start`、`pre_tool.gate`、`runtime.shutdown`，尚无 `model.request.before` / `model.response.after`。
* 当前 plugin contract 位于 `packages/core/src/contracts/plugins.ts`，插件可注册 provider、tool、hook，但 provider metadata/model registry 尚未进入插件上下文。
* `.trellis/spec/backend/directory-structure.md` 和 `.trellis/spec/backend/quality-guidelines.md` 明确要求 `packages/core` 保持小内核，不能引入真实 provider SDK 或真实工具。
* `docs/research/context-packs/provider-abstraction.md` 支持 provider SDK 类型封装在 transport/adapter 边界外，agent loop 只依赖内部统一 contracts。
* `docs/agent-llm-integration.md` 支持先固定内部 LLM/provider boundary，再逐步引入 streaming、capability、error recovery 和 provider platform。

## Assumptions

* M2 基于 M1 plugin host/hook kernel 继续演进，不重新设计插件生命周期。
* `plugin-provider-ai-sdk` 应作为独立 package 接入，而不是放进 `packages/core`；研究建议包名可为 `packages/provider-ai-sdk` 或等价 provider bridge package。
* Core 可以扩展自身 provider contract 和 runtime events，但不能 import AI SDK 或 vendor SDK 类型。
* M2 目标是打通真实 provider bridge 的最小闭环，不进入完整 provider marketplace、credential pool、OAuth、models.dev 自动发现或企业密钥治理。
* 测试应以 contract/unit/integration 为主；真实 API key 路径可作为可选 smoke，不应成为默认 CI 的硬依赖。
* AI SDK bridge 应 pin 自己的 AI SDK dependencies，把 AI SDK API churn 视为 bridge package 的维护范围，而不是 core breaking change。

## Requirements

* 定义 Guga-owned provider runtime contract，作为 core 与 provider 插件之间唯一稳定边界。
* Core provider contract 必须独立于 Vercel AI SDK、LangChain、OpenAI SDK、Anthropic SDK 或任意 vendor SDK 类型。
* Provider 插件必须能注册 provider、model metadata 和模型调用能力；runtime 能查询当前可用模型及能力。
* 引入统一 `ModelEvent` 或等价事件流，表达 text delta、reasoning/thinking delta、tool intent、finish、usage、provider metadata、raw chunk reference 和 error。
* Streaming 与 non-streaming 调用必须进入同一套 runtime 事件语义，agent loop 不应出现 provider-specific 分支。
* `plugin-provider-ai-sdk` 作为 M2 first-party 真实 provider bridge，内部使用 Vercel AI SDK 覆盖至少 OpenAI、Anthropic 和一个 OpenAI-compatible 或 AI Gateway 路径。
* AI SDK bridge 必须把 AI SDK result/stream/tool-call/usage/error 转换为 Guga provider contract，不得把 AI SDK 类型泄漏到 core public contract。
* AI SDK bridge 不应给 AI SDK tool definition 传 `execute`，M2 也不应使用 SDK-managed `stopWhen` 多步 loop；这样可以避免 AI SDK 自动执行工具或绕过 Guga loop。
* Provider bridge 只执行 router 选定的单次 provider/model 调用；模型选择、retry、fallback、final failure 决策必须属于 Guga router。
* 每次 model selection、retry、fallback、final failure 都必须产生 runtime 可观察事件。
* Provider bridge 必须输出归一化 usage；当 pricing metadata 不可靠或缺失时，成本必须明确为 unknown，不得伪造成本。
* Provider error taxonomy 至少覆盖 `auth`、`rate-limit`、`context-overflow`、`payment`、`retryable`、`fatal`，并携带 provider/model/request metadata。
* 模型产生的 tool call 必须转换为 Guga tool intent 并回到 Guga tool pipeline；bridge 不得自动执行工具或绕过 hook/permission/tool registry。
* 新增 `model.request.before` 和 `model.response.after` hook 的 contract-first 边界：M2 只定义类型、phase、effect、patch/annotation/failure shape 和测试夹具，不实现完整 hook 执行管线。
* Model hook contract 必须保证 hook 不能拿到可绕过 router 的 provider client，不能改写 provider 原始响应，也不能 retroactively 改变已经进入 event log 的模型事实。

## Acceptance Criteria

* [ ] Core public exports 和 `packages/core/src/contracts/**` 不包含 AI SDK、OpenAI、Anthropic 或其他 vendor SDK 类型。
* [ ] `plugin-provider-ai-sdk` 能在插件内部接入 OpenAI 与 Anthropic 路径，并通过同一套 Guga provider contract 输出 model events。
* [ ] 至少一个 OpenAI-compatible 或 AI Gateway 路径被覆盖，且默认 CI 不依赖真实外部 API key。
* [ ] Agent loop 通过统一 `ModelEvent` / provider event 语义处理 streaming 与 non-streaming 响应，无 provider-specific 条件分支。
* [ ] Usage 事件能表达 token 信息和成本 unknown 状态；缺少 pricing metadata 时不会填入伪造成本。
* [ ] Rate-limit 或等价可重试错误会被归一化为 provider error，router 负责 fallback/terminate 决策，并记录 selection/failure 事件。
* [ ] 模型 tool call 只产生 Guga tool intent，真实执行仍进入 core tool pipeline；测试证明 bridge 不自动执行工具。
* [ ] `model.request.before` / `model.response.after` 的 contract 与测试夹具覆盖 patch、annotation、failure、耗时字段和安全边界；完整 hook execution pipeline 明确留给后续任务。
* [ ] 主模型和至少一种辅助模型用途能通过 model registry/config 表达，并能在 debug/test 输出中解释 provider、model、能力和用途。
* [ ] `pnpm typecheck`、`pnpm test`、`pnpm build` 通过。

## Out of Scope

* 不实现单独的原生 `plugin-provider-openai`、`plugin-provider-anthropic` 或 `plugin-provider-openai-compatible` transport。
* 不把 Vercel AI SDK 类型设为 Guga core public contract。
* 不实现 provider marketplace、动态 provider 安装、插件签名或远程插件信任模型。
* 不实现完整 credential pool、OAuth、企业密钥轮换或 provider health pool。
* 不实现 M3 的真实 tool permission runtime，但必须保持 tool execution 边界可接管。
* 不实现完整 `model.request.before` / `model.response.after` hook 执行管线；M2 只做 contract-first 定义和测试边界。
* 不实现 context compaction、session replay、host adapters 或 UI projection。
* 不实现 LangChain bridge，只保留后续可接入空间。
* 不要求完整成本定价表；pricing metadata 缺失时记录 unknown。
* 不承诺支持所有 AI SDK provider，只要求覆盖 OpenAI、Anthropic 和一个 OpenAI-compatible 或 AI Gateway 路径。

## Technical Approach

M2 应沿用小内核 + 插件边界：

* `packages/core` 只拥有 provider/model/event/router/hook 的 runtime contract 和可测试控制流。
* `plugin-provider-ai-sdk` 作为独立 package 拥有 AI SDK dependency、provider construction、stream normalization、tool-call normalization、usage/error mapping；可落在 `packages/provider-ai-sdk`，对外返回 core `Provider`/provider plugin。
* Core 事件体系扩展为 model-call 级事实源：model selection、request、stream delta、tool intent、usage、finish、retry/fallback/failure 都进入 runtime observable events。
* Provider router 在 Guga 侧组合主模型/辅助模型用途、retry/fallback policy 和 provider errors；bridge 内部不隐藏跨模型 fallback。
* Tool execution boundary 保持单向：provider bridge 接收 tool definitions，输出 tool intent；tool registry、hook kernel 和未来 permission runtime 决定是否执行。
* Model hooks 在 M2 采用 contract-first：定义 phase、context、patch/annotation/failure/result shape 和测试 fixture，但不把执行接入 runtime critical path。

## Research Notes

AI SDK research landed at `research/ai-sdk-provider-bridge.md` with these M2-specific takeaways:

* Current AI SDK packages provide provider registries, custom providers, Gateway, OpenAI, Anthropic, OpenAI-compatible providers, streaming, tool calling and usage metadata, but these should remain bridge-local.
* AI SDK only auto-executes tools when tool definitions include `execute`; Guga can pass tool specs without `execute` and avoid `stopWhen` so Guga runtime keeps the multi-step/tool execution boundary.
* Gateway is attractive as a production-facing default because it centralizes model breadth, pricing/discovery metadata, generation IDs and routing options.
* OpenAI-compatible is attractive as deterministic smoke coverage because it can point at a local/proxy endpoint and keep default CI free of real OpenAI/Anthropic credentials.
* Direct OpenAI/Anthropic coverage is still useful for compatibility tests, but provider-specific options must stay bridge-local.

## Decision Candidates

### Approach A: Core Contract + External AI SDK Bridge（推荐候选）

* How: 在 core 中升级 Guga provider/model contracts 与 router/event/hook 边界；新增独立 `packages/plugin-provider-ai-sdk`，内部依赖 AI SDK。
* Pros: 符合小内核原则；可真实接入 provider；AI SDK breaking changes 被隔离在 bridge package。
* Cons: 需要设计 bridge package 与 core contract 的适配层，M2 范围比只接一个 SDK call 更大。

### Approach A1: Gateway-first + OpenAI-compatible Smoke（推荐细化）

* How: bridge package 生产默认支持 Gateway；测试/CI 优先用 OpenAI-compatible fake/local/proxy endpoint 做 message/tool/usage mapping smoke；OpenAI/Anthropic 作为可选真实 provider compatibility path。
* Pros: 同时覆盖 provider breadth 与 CI 可维护性；能保留 Gateway pricing/generation metadata，同时不让真实 key 成为默认验收硬依赖。
* Cons: 需要清楚区分“默认生产路径”和“默认 CI 验收路径”，避免文档读者误以为 Gateway 是唯一 supported path。

## Decision (ADR-lite)

**Context**: M2 需要证明真实 provider bridge 可以进入 Guga runtime，同时保住 core-owned provider contract、model events、router、usage/error、tool intent 和 SDK isolation。原需求也提出 `model.request.before` / `model.response.after`，但完整 hook 执行管线会牵动 HookKernel、runtime ordering、patch application、audit 和 failure semantics，容易让 M2 超出“provider bridge 闭环”。

**Decision**: 采用“核心闭环 + hooks contract-first”。M2 实现 model registry、ModelEvent、provider router、AI SDK bridge、usage/error normalization 和 tool intent boundary；`model.request.before` / `model.response.after` 只定义 contract 与测试边界，完整 hook 执行放入后续小任务。

**Consequences**: M2 能以较小风险验证真实 provider integration 和 runtime-owned decisions；hooks 的类型边界会提前固定，避免后续设计漂移；但本轮不能把 model hooks 用作可运行扩展点，相关 runtime behavior 需要在后续任务中补齐。

### Approach B: Thin LLMClient First

* How: 先只新增极薄 `LLMClient`/provider adapter，打通一个 streaming call，再后置完整 router/model registry/hook。
* Pros: 工程量小，真实 provider 可更快跑通。
* Cons: 与需求草案中 fallback、model registry、tool intent、hook/audit 边界不完全匹配，后续可能二次拆分。

### Approach C: Provider Platform Early

* How: 一次性引入 models.dev、credential pool、provider profile、health/fallback pool 和完整 model registry。
* Pros: 更接近商业 provider 平台。
* Cons: 明显超过 M2；会把还没有真实压力验证的复杂度提前引入。

## Expansion Sweep

### Future Evolution

* 1-3 个月内可能扩展到 provider profiles、models.dev metadata、credential pool、主/辅模型更多用途、成本仪表盘和 host UI projection。
* 现在值得保留的 extension point 是 model metadata/capability、router policy、usage/cost unknown、raw metadata reference 和 bridge-private provider config。

### Related Scenarios

* 与 M1 plugin host 保持一致：first-party provider bridge 也应通过普通 plugin 注册能力，而不是 core 特例。
* 与 M3 tool permission runtime 保持一致：模型只提出 tool intent，permission/runtime 决定执行。

### Failure & Edge Cases

* 需要明确 auth/rate-limit/context-overflow/payment/retryable/fatal 的最小 taxonomy，否则 router 无法可靠决策。
* 需要明确 stream 中途失败、usage 缺失、tool call malformed、AbortSignal、fallback 后 usage 归属和 hook failure 的事件语义。

## Open Questions

* OpenAI-compatible 与 AI Gateway 二选一时，M2 默认验收更偏向哪条路径？
* 成本补全是否只记录 unknown，还是引入最小 pricing policy 接口但不内置价格表？
* Router fallback/retry 的最小配置形态是固定策略 fixture，还是 host-configurable policy？

## Research References

* `docs/research/context-packs/provider-abstraction.md` — provider SDK 类型应封装在 transport/adapter 边界外，agent loop 只依赖内部统一 contracts。
* `docs/agent-llm-integration.md` — LLM 接入应从 L1 contract、L2 streaming event、L3 capability、L4 error recovery 逐层演进。
* `docs/roadmap.md` — Guga 方向是小内核、强插件、可恢复、可审计，真实 provider SDK 不进入 core。
* `research/ai-sdk-provider-bridge.md` — AI SDK 当前 provider/model bridge API、版本隔离、Gateway/OpenAI-compatible 测试路径、usage/pricing 和 tool execution 边界。

## Technical Notes

* Current core files inspected:
  * `packages/core/src/contracts/provider.ts`
  * `packages/core/src/contracts/events.ts`
  * `packages/core/src/contracts/hooks.ts`
  * `packages/core/src/contracts/plugins.ts`
  * `packages/core/src/loop/agent-loop.ts`
* Relevant project specs:
  * `.trellis/spec/backend/directory-structure.md`
  * `.trellis/spec/backend/quality-guidelines.md`
  * `.trellis/spec/backend/error-handling.md`
  * `.trellis/spec/backend/logging-guidelines.md`
* Initial complexity: complex architecture task. Requires brainstorm + research before implementation.

## Definition of Done

* Tests added/updated for provider contract, model events, router fallback/retry, AI SDK bridge normalization, usage/cost unknown, tool intent boundary, and model hooks.
* Lint/typecheck/test/build green via `pnpm typecheck`, `pnpm test`, `pnpm build`.
* Docs/notes updated if public behavior or package layout changes.
* Rollout/rollback considered: bridge package can be omitted/disabled without breaking core runtime.
