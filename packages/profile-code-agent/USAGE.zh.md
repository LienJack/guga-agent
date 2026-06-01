# @guga-agent/profile-code-agent 用法

## 用途

`@guga-agent/profile-code-agent` 提供一方编码代理 profile 辅助函数、权限策略、运行时包组合、仓库上下文发现、测试命令发现和自主代码任务契约。

它组合现有运行时能力。它不拥有第二套代理循环，也不会绕过核心权限或工具执行路径。

## 导入

```ts
import {
  CODE_AGENT_PROFILE_ID,
  CodeTaskController,
  createCodeAgentPlugins,
  createCodeAgentProfile,
  createCodeAgentRuntimeOptions
} from "@guga-agent/profile-code-agent";
```

## 主要 API

- Profile：`createCodeAgentProfile()`、`createCodeAgentSystemPrompt()` 和 `CODE_AGENT_PROFILE_ID`。
- 权限：`createCodeAgentPermissionPolicy()`、`createCodeAgentPermissionResolver()` 和 `isDestructiveShellCommand()`。
- 包辅助函数：`createCodeAgentPlugins()` 和 `createCodeAgentRuntimeOptions()`。
- 仓库/测试上下文：`buildRepoContext()`、`renderRepoContext()` 和 `discoverTestCommands()`。
- 任务控制器和契约：`CodeTaskController`、`createCodeTask()`、`classifyCodeTask()`、`transitionCodeTask()`、`validateCodeTask()`、`buildCodeTaskStagePrompt()`、`runVerification()`、`selectVerificationCommands()`、`summarizeVerificationToolResult()`、`renderCodeTaskContext()`、`createCodeTaskHostRuntime()` 和 `createCodeTaskReinjectionSource()`。
- 用于 profile、包、权限、仓库上下文、测试发现、代码任务、阶段运行、计划检查、验证尝试和任务生命周期的类型。

## 常见用法

```ts
const runtimeOptions = createCodeAgentRuntimeOptions({
  workspaceRoot: process.cwd(),
  skills: { roots: [{ path: ".guga/skills", namespace: "project" }] },
  includeOperations: true
});

const runtime = createAgentRuntime(runtimeOptions);
```

进行任务编排时，请使用 `CodeTaskController`，并由宿主运行时提供阶段运行器。

## 参数说明

- `createCodeAgentProfile(options)` 使用 `CodeAgentProfileOptions`；`workspaceRoot` 可选，传入后会写入返回的 `CodeAgentProfile`，不传则只返回通用 profile 元数据和 system prompt。
- `createCodeAgentPlugins(options)`、`createCodeAgentRuntimeOptions(options)` 和内部的 `createCodeAgentBuiltIns(options)` 使用 `CodeAgentBundleOptions`。`workspaceRoot` 必填，用于默认核心能力；`skills.roots` 可选，传给 `createSkillsPlugin()`；`mcp.servers` 可选，传给 `createMcpPlugin()`；`includeOperations` 默认 `true`，控制是否附带 ops health、audit export 和 eval runner 插件。
- `createCodeAgentPermissionPolicy(options)` 使用 `CodeAgentPermissionOptions`。`delegate` 是宿主权限解析器，可接管非自动允许/拒绝的请求；`timeoutMs` 默认 `30000`。没有 `delegate` 时，写入或执行类请求会被拒绝并标记需要宿主 resolver。
- `buildRepoContext(options)` 的 `workspaceRoot` 必填；`gitStatus`、`activeFiles`、`packageScripts` 和 `notes` 可选。函数会去重/排序文件列表与脚本，并过滤空 notes。`discoverTestCommands(options)` 可传 `packageManager`、`packageScripts` 和 `changedFiles`，默认包管理器为 `"pnpm"`。
- `new CodeTaskController(options)` 需要 `invoker` 和 `runStage`。`invoker` 负责通过运行时工具路径执行验证命令；`runStage` 负责运行 scout/planner/executor/repairer 阶段；`now`、`maxRepairAttempts`、`onTaskCreated`、`onTransition` 和 `onVerificationStarted` 是可选控制点。
- `CodeTaskController.start(options)` 使用 `StartCodeTaskOptions`。`taskId`、`sessionId`、`rootRunId`、`cwd`、`objective` 和 `prompt` 必填；`changedFiles` 用于测试命令发现；`plannedChecks` 可直接提供 `VerificationCommand[]`，覆盖自动发现。
- `createCodeTask(input)` 使用 `CreateCodeTaskInput`。`taskId`、`sessionId`、`rootRunId`、`cwd`、`objective` 和 `now` 必填；`maxRepairAttempts` 可选，默认 `2`。
- `runVerification(options)` 使用 `RunVerificationOptions`。`task`、`invoker` 和 `commands` 必填；`now`、`runId` 和 `onAttemptStarted` 可选。`selectVerificationCommands(options)` 需要 `cwd`，并可接收 `plannedChecks` 或测试发现选项。
- `createCodeTaskHostRuntime(options)` 使用 `CodeTaskHostRuntimeOptions`。`cwd` 必填；`profileId`、`packageManager`、`packageScripts` 和 `maxRepairAttempts` 可选。返回对象的 `start(options)` 需要宿主提供 `emit()`、`runStage()` 和 `invokeTool()`。

## 注意事项

- 包根目录从 `src/index.ts` 导出公共 profile 和任务 API；子模块中的内部辅助函数并非全部公开。
- 验证通过运行时/工具路径执行，因此权限、hook、结果预算和持久事件仍然适用。
- 长时间运行任务的完成需要已验证或已完成的账本项，并且需要通过必需的验证证据。

## 相关包

- `@guga-agent/core` 提供运行时、内置能力、权限和工具执行。
- `@guga-agent/plugin-skills`、`@guga-agent/plugin-mcp`、`@guga-agent/plugin-ops-health`、`@guga-agent/plugin-audit-export` 和 `@guga-agent/plugin-eval-runner` 可以组合进该 profile。
