# @guga-agent/plugin-tools-delegation 用法

## 用途

`@guga-agent/plugin-tools-delegation` 为能够运行隔离子代理的宿主贡献 `delegate_task` 工具形态。它会验证委派输入，调用注入的子运行器，记录精简账本，并向父运行返回有界结果。

## 导入

```ts
import {
  DEFAULT_DELEGATE_TASK_TOOL_NAME,
  createDelegationPlugin,
  createDelegateTaskTool
} from "@guga-agent/plugin-tools-delegation";
```

## 主要 API

- `createDelegationPlugin(options)`：通过运行时插件注册委派工具。
- `createDelegateTaskTool(options)`：直接创建工具定义。
- `buildDelegationInput(input)`：规范化模型提供的输入。
- `validateDelegationConfig(options)`：验证子运行器/工具目录配置。
- 账本辅助函数：`createDelegationLedger()`、`renderDelegationResult()`、`sortEventCounts()` 和 `validateDelegationOutput()`。
- 常量：`DEFAULT_DELEGATE_TASK_TOOL_NAME` 和 `LEGACY_DELEGATE_TASK_TOOL_NAME`。
- 用于子运行器、请求、结果、账本记录、事件计数、状态、验证诊断和工具选项的类型。

## 常见用法

```ts
const runtime = createAgentRuntime({
  plugins: [
    createDelegationPlugin({
      childRunner: async (request) => ({
        status: "completed",
        summary: `Completed: ${request.goal}`,
        events: []
      }),
      toolCatalog: []
    })
  ]
});
```

## 参数说明

- `createDelegationPlugin(options)` 与 `createDelegateTaskTool(options)` 的核心参数是 `DelegateTaskToolOptions`。`childRunner` 必填，宿主通过它真正启动子代理；`parentRunId` 可传字符串或函数；`toolName`、`description`、`defaultAgentType`、`defaultMaxTurns`、`defaultTimeoutMs`、`defaultToolAllowlist` 和 `blockedToolNames` 都是可选覆盖项。
- `DelegationPluginOptions` 在 `DelegateTaskToolOptions` 基础上增加可选 `pluginId`，默认是 `"agent-delegation"`。
- `toolCatalog` 是 `DelegationToolCatalogItem[]`，每项至少包含 `name`。模型传入的 `toolAllowlist` 和 `defaultToolAllowlist` 必须都存在于 `toolCatalog`，并且不能包含 `DEFAULT_DELEGATE_TASK_TOOL_NAME`、`LEGACY_DELEGATE_TASK_TOOL_NAME`、当前 `toolName` 或 `blockedToolNames`。
- `createChildRunId(input)` 与 `createChildSessionId(input)` 可选，用于自定义子运行和子会话 id。省略时会基于父 tool call id、父 run id 和 agent type 生成稳定 id。
- `delegate_task` 工具输入使用 `DelegateTaskInput`。`goal` 必填且不能为空；`context` 可提供额外背景；`agentType` 默认来自 `defaultAgentType` 或 `"general"`；`toolAllowlist` 限制子代理工具；`maxTurns` 与 `timeoutMs` 必须是正整数，省略时使用选项默认值或包内默认值。
- `childRunner(request)` 收到 `DelegationChildRunRequest`，其中 `input` 是 `buildDelegationInput()` 生成的完整提示，另含 `goal`、可选 `context`、`agentType`、`tools`、`maxTurns`、`timeoutMs`、`parentRunId`、`parentToolCallId`、`childRunId`、`childSessionId` 和可选 `signal`。
- `validateDelegationConfig(options)` 只验证静态配置，例如工具目录空名、重复名和递归默认 allowlist；运行时输入仍由工具执行路径单独验证。

## 注意事项

- 宿主必须提供子运行器；此包本身不会生成进程或代理。
- 该工具会阻止递归调用委派工具。
- 默认权限元数据将委派视为外部效果。无头/后台 profile 默认拒绝，而可信会话可以允许。
- 委派任务应保持自包含，并且只传递子任务所需的上下文。

## 相关包

- `@guga-agent/core` 提供工具和插件契约。
- `@guga-agent/profile-code-agent` 可以在更高层的编码工作流中使用委派概念。
