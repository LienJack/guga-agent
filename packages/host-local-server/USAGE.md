# @guga-agent/host-local-server Usage

## Purpose

`@guga-agent/host-local-server` is a Node HTTP and SSE adapter over `@guga-agent/host-runtime`. It owns transport concerns and exposes the local host protocol to clients.

## Import

```ts
import { HostLocalServer, createHostLocalServer } from "@guga-agent/host-local-server";
```

## Main APIs

- `HostLocalServer`: HTTP server wrapper with `listen()`, `url`, `hostRuntime`, `bridgeToken`, and `close()`.
- `createHostLocalServer(options)`: factory for `HostLocalServer`.
- `createHostRequestHandler(hostRuntime, options)`: lower-level request handler for custom Node servers.
- `streamRunEvents(options)`: SSE streaming helper for run events.
- Types: `HostLocalServerOptions`, `HostLocalServerListenOptions`, `HostRequestHandlerOptions`, and `StreamRunEventsOptions`.

## Common Usage

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

## Parameters

- `createHostLocalServer(options)` / `new HostLocalServer(options)`: `options` is optional. Pass `hostRuntime` to serve an existing runtime, or `runtimeOptions` to create one. `pollIntervalMs` controls SSE polling. `disposeRuntimeOnClose` defaults to disposing the runtime on close. `bridgeToken` overrides the generated bearer token.
- `server.listen(options)`: `options` is optional. `host` defaults to `127.0.0.1`; `port` defaults to `0`, letting the OS choose an available port.
- `createHostRequestHandler(hostRuntime, options)`: `hostRuntime` is required. `options.pollIntervalMs` controls event stream polling, and `options.bridgeToken` is required for mutating requests.
- `streamRunEvents(options)`: `hostRuntime`, `runId`, `request`, and `response` are required. `afterSeq` is optional and resumes after a known event sequence. `pollIntervalMs` is optional and defaults to a short polling interval.

## Notes

- Mutating requests require the bridge token created by the server unless a caller provides one explicitly.
- GET routes are origin-checked. Use the SDK for normal client access instead of hand-crafting requests.
- `/runs/:id/abort` currently delegates to the same runtime cancellation path as cancel.

## Related Packages

- `@guga-agent/host-runtime` supplies the in-process host service.
- `@guga-agent/host-protocol` supplies DTOs and SSE event names.
- `@guga-agent/host-sdk` launches and talks to this server.
