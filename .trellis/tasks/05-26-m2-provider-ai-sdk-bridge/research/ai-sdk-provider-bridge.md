# AI SDK Provider Bridge 研究

## 摘要

Guga M2 应把 Vercel AI SDK 当作 adapter 的内部实现细节，而不是 core contract。当前 AI SDK packages 已经提供成熟的 provider/model 抽象（`ai` + first-party provider packages），但 bridge 应放在 `@guga-agent/core` 外部，让 Guga public `Provider`、`ProviderRequest`、`ProviderResponse`、`ToolCall`、`ToolDefinition` contract 保持 vendor-neutral。

## 版本信息

- Repo 状态：TypeScript pnpm monorepo，当前有 `packages/core`；`@guga-agent/core` 没有 runtime dependencies，并且明确排除真实 provider SDK integration。
- 2026-05-26 查询到的当前 npm 版本：`ai@6.0.191`、`@ai-sdk/gateway@3.0.120`、`@ai-sdk/openai@3.0.65`、`@ai-sdk/anthropic@3.0.79`、`@ai-sdk/openai-compatible@2.0.48`、`@ai-sdk/provider@3.0.10`。
- 废弃 / sunset 检查：搜索了 “Vercel AI SDK AI Gateway deprecated sunset shutdown 2026”、“Vercel AI Gateway breaking changes migration 2026” 和 “Vercel AI SDK OpenAI Compatible provider deprecated migration”；没有发现官方 sunset notice。但 AI SDK 旧版本到新版本有活跃 migration guides 和 API churn，因此 bridge package 应 pin 版本，把升级影响隔离在 bridge 内。

## 关键概念

- `ai` 提供核心调用与工具：`generateText`、`streamText`、`tool`、`stepCountIs`、`customProvider`、`createProviderRegistry`、`gateway`、`createGateway`。
- Provider registry：`createProviderRegistry({ gateway, openai, anthropic })` 会返回一个 provider，可解析类似 `openai:gpt-5.1` 的 model id；默认 separator 是 `:`，也支持自定义 separator。
- Custom provider：`customProvider({ languageModels, fallbackProvider })` 可以把稳定的应用侧别名映射到具体模型，也可以应用 middleware/default settings。
- AI Gateway：`gateway` provider 已包含在 `ai` 中，也可以从 `@ai-sdk/gateway` 导入。`creator/model` 形式的普通 model string 默认走 Gateway。Gateway 支持 model discovery、pricing metadata、credit lookup、generation lookup、routing/fallback provider options、tags 和 user attribution。
- Direct providers：`@ai-sdk/openai` 暴露 `openai` / `createOpenAI`；`@ai-sdk/anthropic` 暴露 `anthropic` / `createAnthropic`；OpenAI-compatible endpoint 通过 `@ai-sdk/openai-compatible` 的 `createOpenAICompatible` 接入。
- Tool execution：AI SDK 只有在 tool definition 带有 `execute` 函数时才会自动执行工具。如果省略 `execute`，tool calls 会被返回并需要调用方自行处理。`toolChoice: "none"` 可以禁用 tool use；`stopWhen` 会启用 SDK-managed multi-step loop，省略时默认只做 single generation。

## 实现建议

推荐的 Guga 形态：

1. 新增独立 bridge package，例如 `packages/provider-ai-sdk`，依赖 `@guga-agent/core`、`ai` 和被选中的 AI SDK provider packages。
2. 导出类似 `createAiSdkProvider({ id, model, mode, providerOptions })` 的 factory，返回 core `Provider`。
3. 只在 bridge package 内部把 core `CoreMessage[]` 转换成 AI SDK `ModelMessage[]`。
4. 把 core `ToolDefinition[]` 转换成不带 `execute` 的 AI SDK tool specs；provider 返回 `tool_calls` 后，由 Guga `AgentLoop` 执行工具。
5. M2 可以先调用 `generateText`。等 Guga 拥有稳定 streaming event contract 后，再加入 `streamText`。
6. 把 AI SDK result fields 映射回 core response：final text -> `{ type: "final" }`，tool calls -> `{ type: "tool_calls" }`，failures -> `{ type: "failure" }`，usage -> core `Usage`。

不要从 core 导出 AI SDK `LanguageModel`、`ModelMessage`、`Tool`、`ToolCallPart`、`providerMetadata` 或 provider option types。如果 bridge 需要 typed config，应暴露 bridge-local config types，或在边界上使用 `unknown` / narrow records。

## 最佳实践

- 如果 M2 目标是 provider 覆盖面、model discovery、pricing lookup 和单一 auth path，早期集成优先考虑 Gateway。
- 如果要测试 provider-specific 行为，优先直接使用 `@ai-sdk/openai` / `@ai-sdk/anthropic`，例如 OpenAI `parallelToolCalls: false`、`store: false`，或 Anthropic `disableParallelToolUse` / `toolStreaming`。
- 使用 `customProvider` alias 表达稳定的 Guga model names（如 `fast`、`reasoning`、`cheap`），不要把具体 model id 写死进 core。
- Pin bridge dependencies，并把 AI SDK upgrade 视为 bridge-package 工作。保持 `@guga-agent/core` dependency-free。
- 不传 AI SDK `execute` 函数，以禁用 / 避免自动 tool execution。M2 也应避免使用 `stopWhen`，防止 SDK 在 Guga loop 外部运行自己的 multi-step loop。
- OpenAI-compatible smoke tests 如果需要 streaming usage metadata，可设置 `includeUsage: true`。

## 常见问题

- Missing tool results：AI SDK 期望未解决的 tool calls 在后续 model call 中跟随 tool-result messages。Bridge 必须保留 `toolCallId`，并正确映射 Guga tool messages。
- Parallel tool calls：OpenAI 和 Anthropic 默认倾向 parallel tool use。Guga 可以支持一个 provider response 中多个 tool calls，也可以在 M2 tests 中通过 provider options 强制 one-at-a-time。
- Provider-executed tools：Gateway/OpenAI/Anthropic 暴露 server-side tools，例如 web search、shell 或 Gateway tools。M2 应避免使用这些能力，除非 Guga 显式建模 provider-executed tool effects，因为它们会绕过 Guga permission/hook/tool execution boundary。
- Usage/pricing boundary：core `Usage` 应保持 token-level。Gateway cost/generation metadata 应放在 bridge metadata/events 或 host logs 中；除非 Guga 新增 vendor-neutral billing contract，否则不应进入 core provider contracts。

## M2 可选方案

1. **Gateway-first bridge package**
   - Dependencies：初始只依赖 `ai`；如需 direct imports，可选 `@ai-sdk/gateway`。
   - Test path：Gateway model string 或 `gateway("provider/model")`；可用 `gateway.getAvailableModels()` / REST model list 做 discovery 和 pricing。
   - Boundary：收集 `providerMetadata.gateway.generationId`；cost lookup 留在 bridge/host 侧。
   - Tool policy：不传 AI SDK `execute`，不使用 `stopWhen`，避免 Gateway/provider-executed tools。

2. **OpenAI-compatible smoke bridge**
   - Dependencies：`ai`、`@ai-sdk/openai-compatible`。
   - Test path：通过 `createOpenAICompatible({ name, baseURL, apiKey, includeUsage: true })` 指向 local/proxy OpenAI-compatible endpoint。
   - Boundary：这是验证 message/tool-call mapping 的最低成本路径，不把 Guga 绑定到 OpenAI/Anthropic account semantics。
   - Tool policy：不传 `execute`；可选 `toolChoice: "auto"` 生成 tool call，或 `"none"` 只测 final-only。

3. **Direct OpenAI/Anthropic bridge slice**
   - Dependencies：`ai`、`@ai-sdk/openai`、`@ai-sdk/anthropic`，仅 bridge package 内使用。
   - Test path：通过 `createProviderRegistry` 或显式 provider selection 覆盖一个 OpenAI model 和一个 Anthropic model。
   - Boundary：provider options 保持 bridge-local；不要把 `OpenAILanguageModelResponsesOptions` 或 `AnthropicLanguageModelOptions` 泄漏到 core。
   - Tool policy：如果 M2 想要每个 loop step 只产生一个 call，可设置 OpenAI `parallelToolCalls: false` 与 Anthropic `disableParallelToolUse: true`；保持 SDK auto execution disabled。

## 推荐结论

构建 `packages/provider-ai-sdk`：用方案 2 作为确定性的 smoke path，用方案 1 作为默认 production-facing path。等 adapter 能正确映射 messages/tool calls 后，再把方案 3 作为 focused compatibility test。这能同时给 Guga 带来版本隔离、低摩擦测试 endpoint，以及通向 Gateway pricing/observability 的清晰路径，同时不污染 `packages/core`。

## 参考链接

- AI SDK provider management: https://ai-sdk.dev/docs/ai-sdk-core/provider-management
- `createProviderRegistry` reference: https://ai-sdk.dev/docs/reference/ai-sdk-core/provider-registry
- `customProvider` reference: https://ai-sdk.dev/docs/reference/ai-sdk-core/custom-provider
- AI SDK providers/models overview: https://ai-sdk.dev/docs/foundations/providers-and-models
- AI SDK tool calling and `stopWhen`: https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling
- AI Gateway provider docs: https://ai-sdk.dev/providers/ai-sdk-providers/ai-gateway
- Vercel AI Gateway models/pricing API: https://vercel.com/docs/ai-gateway/models-and-providers
- OpenAI provider docs: https://ai-sdk.dev/providers/ai-sdk-providers/openai
- Anthropic provider docs: https://ai-sdk.dev/providers/ai-sdk-providers/anthropic
- OpenAI-compatible provider docs: https://ai-sdk.dev/providers/openai-compatible-providers
