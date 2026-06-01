# @guga-agent/host-sdk Usage

## Purpose

`@guga-agent/host-sdk` is the typed client for the local Guga host protocol. It also provides a helper for launching an in-process local host server for tests, local apps, or CLI-style integrations.

## Import

```ts
import { connectHost, createLocalGugaHost, HostClientError } from "@guga-agent/host-sdk";
```

## Main APIs

- `connectHost({ baseUrl, bridgeToken, fetch })`: creates a typed `HostClient`.
- `HostClient`: protocol, session, run, event stream, queued input, permission, interaction, task, capability, provider health, audit, metrics, and operational status methods.
- `createLocalGugaHost(options)`: starts a local host server and returns a client plus close handle.
- `streamHostEvents()` and `parseSsePayload()`: low-level SSE helpers.
- `HostClientError`: structured HTTP/protocol error.
- Types: `ConnectHostOptions`, `CreateSessionRequest`, `StartRunRequest`, `SendRunInputRequest`, `RequestInteractionRequest`, `LocalGugaHostOptions`, and `StreamHostEventsOptions`.

## Common Usage

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

## Parameters

- `connectHost({ baseUrl, bridgeToken, fetch })`: `baseUrl` is required and should point at a local host server. `bridgeToken` is optional for read-only routes but required for mutating routes on protected servers. `fetch` is optional and defaults to global `fetch`.
- `createLocalGugaHost(options)`: `options` is optional and accepts `HostLocalServerOptions` plus optional `listen` options. Use `runtimeOptions` or `hostRuntime` to configure the server, and `listen.host` / `listen.port` to choose the bind address.
- `host.client.createSession(request)`: `request` is optional; `title` is optional.
- `host.client.startRun(sessionId, request)`: `sessionId` and `request.input` are required. `request.providerId`, `request.modelId`, and `request.maxTurns` are optional.
- `host.client.sendRunInput(runId, request)`: `runId`, `request.mode`, and `request.text` are required.
- `host.client.streamRunEvents(runId, options)`: `runId` is required. `options.afterSeq` resumes after a sequence number, and `options.signal` cancels the stream.
- `streamHostEvents(options)`: `url` is required. `fetch`, `signal`, and `bridgeToken` are optional.

## Notes

- The package root does not re-export every internal request type from `client.ts`; use the root API types listed above as the public surface.
- Always pass the bridge token returned by a local server when calling mutating routes.

## Related Packages

- `@guga-agent/host-local-server` is launched by `createLocalGugaHost()`.
- `@guga-agent/host-protocol` defines client resource and event types.
