# @guga-agent/host-protocol Usage

## Purpose

`@guga-agent/host-protocol` defines the serializable host protocol shared by runtime, local server, SDK, CLI, and future UI clients. It contains DTOs and helpers only; it does not run agents, serve HTTP, or render UI.

## Import

```ts
import {
  HOST_PROTOCOL_VERSION,
  createHostEventSequencer,
  createSseEnvelope,
  type HostEvent,
  type RunResource
} from "@guga-agent/host-protocol";
```

## Main APIs

- Host events: `HostEvent`, `HostEventInput`, typed run, message, tool, permission, interaction, queue, task, verification, artifact, usage, and operational event shapes.
- Event helpers: `createHostEventSequencer()`, `hostEventSseName()`, `isTerminalHostEvent()`, and `HOST_EVENT_SSE_NAME`.
- Resource DTOs: sessions, branches, runs, queued input, interactions, permissions, capabilities, provider health, audit summaries, metrics, operations, tasks, verification attempts, artifacts, and usage.
- Protocol constants: `HOST_PROTOCOL_VERSION` and `HOST_PROTOCOL_FEATURES`.
- SSE helpers: `createSseEnvelope()` and `encodeSseEnvelope()`.

## Common Usage

```ts
const sequencer = createHostEventSequencer();
const event = sequencer({
  type: "run.started",
  sessionId: "session-1",
  runId: "run-1",
  input: "hello"
});

const frame = encodeSseEnvelope(createSseEnvelope(event));
```

## Parameters

- `createHostEventSequencer(options)`: `options` is optional. `startSeq` sets the sequence number before the first emitted event; `now` overrides timestamp creation and is mainly useful for tests.
- `sequencer.next(event)`: `event` must include the host event fields except `seq` and `occurredAt`. `occurredAt` is optional; when omitted, the sequencer fills it from `now()`.
- `createSseEnvelope(event)`: `event` is required and must already be a sequenced `HostEvent`. The helper derives the SSE `id` from `event.seq` and the SSE event name from the host event helper.
- `encodeSseEnvelope(envelope)`: `envelope.id`, `envelope.event`, and `envelope.data` are required and are encoded as one SSE frame.

## Notes

- Public consumers should import from the package root. Some internal event type aliases in `events.ts` are represented inside the `HostEvent` union but are not individually re-exported.
- Keep protocol objects JSON-serializable. Runtime objects, functions, AbortSignals, child processes, and raw provider clients do not belong in protocol resources.

## Related Packages

- `@guga-agent/host-runtime` emits these resources and events.
- `@guga-agent/host-local-server` exposes them over HTTP and SSE.
- `@guga-agent/host-sdk`, `@guga-agent/host-stdio`, and `@guga-agent/cli` consume them.
