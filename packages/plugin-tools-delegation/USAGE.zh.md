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
- 账本辅助函数：`createDelegationLedger()`、`renderDelegationResult()`、`renderDelegationBatchResult()`、`countDelegationStatuses()`、`mergeDelegationEventCounts()`、`sortEventCounts()` 和 `validateDelegationOutput()`。
- 批量 runner 辅助函数：`runDelegationBatch()`，方便宿主在注册工具之外复用同一套有界子任务执行原语。
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

工具输入支持旧的单任务形态：

```json
{
  "goal": "Review the API docs",
  "context": "Focus on missing examples",
  "agentType": "review",
  "toolAllowlist": ["fs_read"],
  "maxTurns": 2,
  "timeoutMs": 300000
}
```

也支持有界批量子任务：

```json
{
  "tasks": [
    { "id": "docs", "goal": "Review documentation gaps", "toolAllowlist": ["fs_read"] },
    { "id": "tests", "goal": "Review missing tests", "toolAllowlist": ["fs_read"] }
  ],
  "maxConcurrency": 2
}
```

## 参数说明

- `createDelegationPlugin(options)` 与 `createDelegateTaskTool(options)` 的核心参数是 `DelegateTaskToolOptions`。`childRunner` 必填，宿主通过它真正启动子代理；`parentRunId` 可传字符串或函数；`toolName`、`description`、`toolCatalog`、`resolveToolCatalog`、`defaultAgentType`、`defaultMaxTurns`、`defaultTimeoutMs`、`defaultMaxConcurrency`、`maxBatchTasks`、`maxInputChars`、`maxChildMetadataChars`、`defaultToolAllowlist`、`blockedToolNames` 和 `blockedCapabilities` 都是可选覆盖项。
- `DelegationPluginOptions` 在 `DelegateTaskToolOptions` 基础上增加可选 `pluginId`，默认是 `"agent-delegation"`。
- `toolCatalog` 是 `DelegationToolCatalogItem[]`，每项至少包含 `name`，也可以声明 `delegation`、`user-clarification`、`memory-mutation`、`user-presentation` 等能力标签。模型传入的 `toolAllowlist` 和 `defaultToolAllowlist` 必须都存在于当前目录，并且不能包含被拦截的工具名或能力。
- 默认拦截递归委派、用户澄清、记忆写入和直接面向用户展示相关能力，避免子代理越过父代理边界。
- `createChildRunId(input)` 与 `createChildSessionId(input)` 可选，用于自定义子运行和子会话 id。省略时会基于父 tool call id、父 run id 和 agent type 生成稳定 id。
- `delegate_task` 工具输入使用 `DelegateTaskInput`。它要么提供根级 `goal`，要么提供非空 `tasks` 数组，不能两者同时提供。批量输入可以提供 `maxConcurrency`；每个子任务各自携带 `goal`、`context`、`agentType`、`toolAllowlist`、`maxTurns` 和 `timeoutMs`。
- `maxTurns`、`timeoutMs` 与 `maxConcurrency` 必须是正整数。批量任务数受 `maxBatchTasks` 限制，默认最多 `3` 个。
- `childRunner(request)` 收到 `DelegationChildRunRequest`，其中 `input` 是 `buildDelegationInput()` 生成的完整提示，另含 `goal`、可选 `context`、`agentType`、`tools`、`maxTurns`、`timeoutMs`、`parentRunId`、`parentToolCallId`、`childRunId`、`childSessionId` 和可选 `signal`。
- `validateDelegationConfig(options)` 只验证静态配置，例如工具目录空名、重复名、非法数值和被拦截的默认 allowlist；运行时输入仍由工具执行路径单独验证。

## 注意事项

- 宿主必须提供子运行器；此包本身不会生成进程或代理。
- 该工具会阻止递归调用委派工具，并默认拦截不适合子代理直接使用的能力。
- 单任务失败仍保留旧的工具失败语义。批量调用会在所有子任务 settled 后返回精简的成功工具结果，并在内容和审计 metadata 中标出每个子任务的 failed、cancelled 或 timed_out 状态。
- 默认权限元数据将委派视为外部效果。无头/后台 profile 默认拒绝，而可信会话可以允许。
- 委派任务应保持自包含，并且只传递子任务所需的上下文。

## 相关包

- `@guga-agent/core` 提供工具和插件契约。
- `@guga-agent/profile-code-agent` 可以在更高层的编码工作流中使用委派概念。
