# @guga-agent/host-sdk 用法

## 用途

`@guga-agent/host-sdk` 是本地 Guga host protocol 的带类型 client。它也提供用于启动进程内 local host server 的 helper，适合 tests、local apps 或 CLI 风格集成。

## 导入

```ts
import { connectHost, createLocalGugaHost, HostClientError } from "@guga-agent/host-sdk";
```

## 主要 API

- `connectHost({ baseUrl, bridgeToken, fetch })`：创建带类型的 `HostClient`。
- `HostClient`：protocol、session、run、event stream、queued input、permission、interaction、task、capability、provider health、audit、metrics 和 operational status 方法。
- `createLocalGugaHost(options)`：启动 local host server，并返回 client 和 close handle。
- `streamHostEvents()` 和 `parseSsePayload()`：底层 SSE helpers。
- `HostClientError`：结构化 HTTP/protocol error。
- Types：`ConnectHostOptions`、`CreateSessionRequest`、`StartRunRequest`、`SendRunInputRequest`、`RequestInteractionRequest`、`LocalGugaHostOptions` 和 `StreamHostEventsOptions`。

## 常见用法

```ts
const host = await createLocalGugaHost({
  runtimeOptions: {
    plugins: [myPlugin]
  }
});

try {
  const session = await host.client.createSession({ title: "SDK run" });
  const run = await host.client.startRun(session.id, { input: "hello" });

  for await (const event of host.client.streamRunEvents(run.id)) {
    console.log(event.type);
  }
} finally {
  await host.close();
}
```

## 参数说明

- `connectHost(options: ConnectHostOptions)`：`baseUrl` 必填，末尾斜杠会被规整；`bridgeToken` 可选，调用 mutating routes 时通常必需；`fetch` 可选，用于注入测试或非默认 fetch 实现。
- `createLocalGugaHost(options?: LocalGugaHostOptions)`：继承 `HostLocalServerOptions`，可配置 `hostRuntime`、`runtimeOptions`、`bridgeToken`、`pollIntervalMs` 和 `disposeRuntimeOnClose`；额外的 `listen` 可传 `host`、`port`。返回 `baseUrl`、`client`、`server` 和 `close()`。
- `client.createSession(request?: CreateSessionRequest)`：`title` 可选。
- `client.startRun(sessionId, request: StartRunRequest)`：`sessionId` 和 `request.input` 必填；`providerId`、`modelId`、`maxTurns` 可选。
- `client.streamRunEvents(runId, options?)`：`runId` 必填；`afterSeq` 可从指定序号之后继续消费；`signal` 可取消 SSE 读取。
- `client.sendRunInput(runId, request: SendRunInputRequest)`：`runId` 必填；`request.mode` 为 `"steer"` 或 `"follow_up"`；`text` 必填。
- `client.requestInteraction(sessionId, request: RequestInteractionRequest)`：`sessionId` 和 `request.request` 必填；`runId` 可选。`client.respondPermission(permissionId, resolution)` 使用 `PermissionResolution`，其中 `decision` 必填，`remember`、`reason`、`updatedInput` 可选。

## 注意事项

- 包根入口不会从 `client.ts` 重新导出每个内部 request type；请使用上方列出的 root API types 作为公共表面。
- 调用 mutating routes 时，始终传入 local server 返回的 bridge token。

## 相关包

- `@guga-agent/host-local-server` 由 `createLocalGugaHost()` 启动。
- `@guga-agent/host-protocol` 定义 client resource 和 event types。
