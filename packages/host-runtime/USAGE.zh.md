# @guga-agent/host-runtime 用法

## 用途

`@guga-agent/host-runtime` 将 `@guga-agent/core` 封装成进程内 host service。它负责 session 和 run state projection、canonical host events、queued run input、permissions、interactions、task projection 和 operational views。

当 host 需要运行时行为但还不想选择 transport 时，请使用它。

## 导入

```ts
import { HostRuntime, createHostRuntime, projectAgentEvent } from "@guga-agent/host-runtime";
```

## 主要 API

- `HostRuntime`：用于 sessions、runs、event streams、permissions、interactions、capabilities、operational status 和 task resources 的进程内 service。
- `createHostRuntime(options)`：`HostRuntime` 的 factory wrapper。
- `projectAgentEvent(event, context)`：将 core `AgentEvent` facts 映射为 host protocol events。
- Types：`HostRuntimeOptions`、`StartRunOptions`、`EnqueueRunInputOptions`、`PermissionResponseResult` 和 `RequestInteractionOptions`。

## 常见用法

```ts
const hostRuntime = createHostRuntime({
  runtimeOptions: {
    plugins: [myPlugin]
  }
});

const session = await hostRuntime.createSession({ title: "Local work" });
const run = await hostRuntime.startRun({
  sessionId: session.id,
  input: "summarize the current project",
  providerId: "mock",
  modelId: "primary"
});

const events = await hostRuntime.listRunEvents(run.id);
```

## 参数说明

- `createHostRuntime(options?: HostRuntimeOptions)`：`runtime` 可传入已有 `AgentRuntime`；`runtimeOptions` 用于创建内部 runtime；`now` 和 `idFactory` 便于测试中固定时间与 ID；`profileId` 和 `cwd` 传给 code task 分类；`codeTasks` 提供可选的 code-task runtime。
- `hostRuntime.createSession(options?: { title?: string })`：`title` 可选；省略时创建无标题 session，并默认建立 `main` branch。
- `hostRuntime.startRun(options: StartRunOptions)`：`sessionId` 和 `input` 必填；`providerId`、`modelId` 可选，用于显式模型选择；`maxTurns` 可选，用于限制 agent loop turn 数。`startRun()` 等待运行完成；`startRunDetached()` 使用同一 options 但立即返回初始 `RunResource`。
- `hostRuntime.enqueueRunInput(runId, options: EnqueueRunInputOptions)`：`runId` 必填；`options.mode` 为 `"steer"` 或 `"follow_up"`；`text` 必填且会进入队列预览。terminal run 会返回 `undefined`。
- `hostRuntime.requestInteraction(options: RequestInteractionOptions)`：`sessionId` 和 `request` 必填；`runId` 可选，传入时会验证该 run 属于 session，并发出 interaction event。
- `hostRuntime.respondPermission(permissionId, resolution: PermissionResolution)`：`permissionId` 必填；`resolution.decision` 为 `"allow"` 或 `"deny"`；`remember`、`reason`、`updatedInput` 可选，非法或非 pending 权限会返回结构化失败结果。

## 注意事项

- 此包不实现 HTTP、CLI、Web UI 或 desktop UI。
- `HostRuntimeOptions` 包含 code-task 集成点，但若干相关内部 helper types 不会从包根入口重新导出。
- 配置 durable stores 后，host-sourced task 和 verification facts 可以作为 durable event envelopes flush。

## 相关包

- `@guga-agent/core` 运行 model/tool turns。
- `@guga-agent/host-protocol` 定义发出的 DTOs。
- `@guga-agent/host-local-server` 提供 HTTP/SSE transport。
