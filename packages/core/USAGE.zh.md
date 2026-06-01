# @guga-agent/core 用法

## 用途

`@guga-agent/core` 是与 provider 无关的运行时内核。它负责契约、agent loop、运行时 facade、provider 路由、能力注册、hooks、权限、事件发布、上下文投影、持久化契约，以及工具执行授权。

当你在构建 host、plugin、测试 fixture 或集成，并且需要在不依赖 CLI、HTTP、UI 或可选生态包的情况下运行 Guga 时，请使用此包。

## 导入

```ts
import { createAgentRuntime, HookEffect, HookPhase } from "@guga-agent/core";
import { createDefaultCoreCapabilities } from "@guga-agent/core/builtins";
```

根入口点暴露契约和运行时原语。内置的文件系统、git、shell 和 AI SDK bridge 辅助能力通过 `@guga-agent/core/builtins` 暴露，这样常规 core 导入不会提前加载可选的 provider SDK。

## 主要 API

- `createAgentRuntime()` 和 `DefaultAgentRuntime`：面向 host 的运行时创建与执行。
- `AgentLoop`：最小模型/工具 turn loop。
- `ProviderRouter`：模型选择、重试、fallback，以及 provider 失败归一化。
- `CapabilityRegistry`：provider、model、tool、skill、hook、context-policy、store、replay 和 operation 发现。
- `PluginHost` 和 `LocalPlugin`：可信的进程内 plugin 生命周期。
- `ExecutionPipeline`、`ToolScheduler` 和 `ResultPolicy`：schema 校验、感知权限的工具执行、调度和输出预算控制。
- `PermissionKernel`：对具有副作用的工具进行 allow/ask/deny 解析。
- `HookKernel`、`HookPhase` 和 `HookEffect`：生命周期、模型、上下文和工具 hook 执行。
- 上下文辅助能力，例如压缩、投影、工具结果视图、重新注入、预算、压力和截断服务。
- 持久化 session、event、artifact、resume、fork、replay 和 corruption 契约。
- 测试 fixture，例如 `createMockProvider()`、`createTestTool()` 和 `createExamplePlugin()`。

## 常见用法

```ts
const runtime = createAgentRuntime({
  plugins: [myPlugin],
  builtIns: {
    capabilities: createDefaultCoreCapabilities({ workspaceRoot: process.cwd() })
  }
});

runtime.onEvent((event) => {
  console.log(event.type);
});

const result = await runtime.run({
  input: "summarize this repository",
  providerId: "mock",
  modelId: "primary"
});
```

## 参数说明

- `createAgentRuntime(options?: AgentRuntimeOptions)`：`options` 可省略；`model` 用于传入旧式本地模型插件；`plugins` 注册进程内 `LocalPlugin`；`builtIns` 可设为 `false` 禁用内置能力，或传入 `capabilities.providers`、`capabilities.models`、`capabilities.tools`；`permissions` 配置 `PermissionPolicy`，包括 `profile`、`timeoutMs` 和 `resolver`；`routerPolicy` 指定 primary model、按 `purpose` 的候选模型和 `maxRetries`；`session` 提供默认 `sessionId`、`branchId` 等身份；`stores` 可接入 events、sessions、artifacts 持久化；`replay` 接入 replay 能力。
- `runtime.run(options: AgentRunOptions)`：`input` 为必填 prompt；`providerId`、`modelId` 可显式选择模型；`purpose` 用于 provider router 的用途路由；`maxTurns` 限制 turn 数；`signal` 用于取消；`runId` 可由 host 指定；`session` 可覆盖运行时默认 session 身份。
- `createDefaultCoreCapabilities(options?: DefaultCoreCapabilitiesOptions)`：`workspaceRoot` 默认为 `process.cwd()`；`filesystem`、`git`、`shell` 可传入各自配置或设为 `false` 禁用；`aiSdk` 需要 `config`，可选 `factory`，启用后会懒加载 AI SDK provider 能力。
- `runtime.invokeTool(options: RuntimeToolInvokeOptions)`：通过 core 权限与执行管线调用工具；调用方应传入工具名、输入、运行上下文和可选 `signal`，不要绕过 runtime 直接执行模型产出的 tool intents。

## 注意事项

- Core 不以内置形式实现 CLI、HTTP、UI、MCP、skills、memory、artifact storage、replay storage、evals 或 delegation。
- Provider SDK 类型不得泄漏到公共契约、loop、registry、hooks、permissions 或 execution pipeline 模块中。
- 模型生成的工具意图必须通过 core pipeline 进入；provider bridge 不应直接执行工具。
- 导出的测试 fixture 对验证很有用，但它们不是生产默认值。

## 相关包

- `@guga-agent/extension-sdk` 使用扩展元数据封装 core plugins。
- `@guga-agent/host-runtime` 将 core runs 投影为 host resources 和 events。
- Plugin packages 添加可选的 stores、MCP、skills、memory、replay、eval 和 operational capabilities。
