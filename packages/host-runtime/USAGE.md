# @guga-agent/host-runtime Usage

## Purpose

`@guga-agent/host-runtime` wraps `@guga-agent/core` in an in-process host service. It owns session and run state projection, canonical host events, queued run input, permissions, interactions, task projection, and operational views.

Use it when a host wants runtime behavior without choosing a transport.

## Import

```ts
import { HostRuntime, createHostRuntime, projectAgentEvent } from "@guga-agent/host-runtime";
```

## Main APIs

- `HostRuntime`: in-process service for sessions, runs, event streams, permissions, interactions, capabilities, operational status, and task resources.
- `createHostRuntime(options)`: factory wrapper for `HostRuntime`.
- `projectAgentEvent(event, context)`: maps core `AgentEvent` facts into host protocol events.
- Types: `HostRuntimeOptions`, `StartRunOptions`, `EnqueueRunInputOptions`, `PermissionResponseResult`, and `RequestInteractionOptions`.

## Common Usage

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

## Parameters

- `createHostRuntime(options)` / `new HostRuntime(options)`: `options` is optional. Pass `runtime` to use an existing core runtime, or `runtimeOptions` to have the host create one. `now` and `idFactory` are optional test hooks. `profileId` and `cwd` annotate hosted runs. `codeTasks` is optional code-task integration.
- `hostRuntime.createSession(request)`: `request` is optional. `title` is optional and labels the session.
- `hostRuntime.startRun(options)`: `sessionId` and `input` are required. `providerId`, `modelId`, and `maxTurns` are optional and are forwarded to core run routing and loop control.
- `hostRuntime.enqueueRunInput(runId, options)`: `runId` is required. `options.mode` is required and must be a run input mode; `options.text` is required queued input text.
- `hostRuntime.requestInteraction(options)`: `sessionId` and `request` are required. `runId` is optional when the interaction is not tied to a specific run.
- `projectAgentEvent(event, context)`: `event` is the core `AgentEvent` to project. `context.sessionId`, `context.runId`, and `context.sequencer` are required; `sourceRunId` is optional when the source core run id differs from the host run id.

## Notes

- This package does not implement HTTP, CLI, Web UI, or desktop UI.
- `HostRuntimeOptions` includes code-task integration points, but several related internal helper types are not re-exported from the package root.
- When durable stores are configured, host-sourced task and verification facts can be flushed as durable event envelopes.

## Related Packages

- `@guga-agent/core` runs model/tool turns.
- `@guga-agent/host-protocol` defines the emitted DTOs.
- `@guga-agent/host-local-server` provides the HTTP/SSE transport.
