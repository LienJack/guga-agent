# @guga-agent/host-local-server 用法

## 用途

`@guga-agent/host-local-server` 是覆盖 `@guga-agent/host-runtime` 的 Node HTTP 和 SSE adapter。它负责 transport 相关事项，并向 clients 暴露本地 host protocol。

## 导入

```ts
import { HostLocalServer, createHostLocalServer } from "@guga-agent/host-local-server";
```

## 主要 API

- `HostLocalServer`：HTTP server wrapper，带有 `listen()`、`url`、`hostRuntime`、`bridgeToken` 和 `close()`。
- `createHostLocalServer(options)`：`HostLocalServer` 的 factory。
- `createHostRequestHandler(hostRuntime, options)`：用于自定义 Node servers 的更底层 request handler。
- `streamRunEvents(options)`：run events 的 SSE streaming helper。
- Types：`HostLocalServerOptions`、`HostLocalServerListenOptions`、`HostRequestHandlerOptions` 和 `StreamRunEventsOptions`。

## 常见用法

```ts
const server = createHostLocalServer({
  runtimeOptions: {
    plugins: [myPlugin]
  }
});

const baseUrl = await server.listen({ host: "127.0.0.1", port: 0 });

try {
  console.log(baseUrl, server.bridgeToken);
} finally {
  await server.close();
}
```

## 参数说明

- `createHostLocalServer(options?: HostLocalServerOptions)`：`hostRuntime` 可传入已有 `HostRuntime`；`runtimeOptions` 用于创建内部 `HostRuntime`；`pollIntervalMs` 控制 SSE 轮询间隔；`disposeRuntimeOnClose` 默认为 `true`，关闭 server 时释放 runtime；`bridgeToken` 可显式指定，否则自动生成。
- `server.listen(options?: HostLocalServerListenOptions)`：`host` 默认 `"127.0.0.1"`；`port` 默认 `0`，表示让系统分配可用端口。返回值是 base URL。
- `createHostRequestHandler(hostRuntime, options?: HostRequestHandlerOptions)`：`hostRuntime` 必填；`options.bridgeToken` 用于校验非 GET mutating requests；`options.pollIntervalMs` 传给 run event SSE streaming。
- `streamRunEvents(options: StreamRunEventsOptions)`：`hostRuntime`、`runId`、`request`、`response` 必填；`afterSeq` 可用于从指定事件序号之后恢复；`pollIntervalMs` 可覆盖默认轮询间隔。
- HTTP request bodies：创建 session 使用可选 `title`；启动 run 需要 `input`，可选 `providerId`、`modelId`、`maxTurns`；队列输入需要 `mode` 为 `"steer"` 或 `"follow_up"` 且 `text` 非空；权限响应需要 `decision` 为 `"allow"` 或 `"deny"`。

## 注意事项

- Mutating requests 需要 server 创建的 bridge token，除非调用方显式提供一个。
- GET routes 会进行 origin check。普通 client 访问应使用 SDK，而不是手写 requests。
- `/runs/:id/abort` 目前委托给与 cancel 相同的 runtime cancellation path。

## 相关包

- `@guga-agent/host-runtime` 提供进程内 host service。
- `@guga-agent/host-protocol` 提供 DTOs 和 SSE event names。
- `@guga-agent/host-sdk` 启动并连接此 server。
