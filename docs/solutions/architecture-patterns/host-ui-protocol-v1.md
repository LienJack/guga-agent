# Host UI Protocol v1

Guga's CLI workbench may use OpenTUI, and the future desktop GUI may use a native/web renderer, but both clients must consume the same host protocol. The renderer is replaceable; session/run/control facts are not.

## 一句话结论

Adopt a renderer-agnostic Host UI Protocol v1: REST resources and controls are the command surface, SSE `HostEvent` streams are the observation surface, and both CLI/OpenTUI and desktop GUI reduce the same events into their own view models. OpenTUI is an implementation detail of the terminal client, not a protocol layer.

## Runtime Renderer Decision

Decision: use the minimal fallback renderer for the current Node/pnpm CLI workbench path.

Evidence captured on 2026-05-28:

- The workspace package manager is `pnpm@10.33.2` and the CLI runs as a Node ESM package.
- Local `package.json` / `pnpm-lock.yaml` do not already contain an OpenTUI dependency.
- `@opentui/core@0.2.16` depends on `bun-ffi-structs` and optional native `@opentui/core-*` packages.
- A standard Node 22 import smoke for `@opentui/core@0.2.16` fails because it requires Bun or Node FFI flags.

Implication: do not add `@opentui/*` to `@guga-agent/cli` until OpenTUI can load under the normal Node CLI distribution path, or until the project deliberately changes the CLI runtime contract. The fallback renderer keeps terminal frame, key, editor, overlay, and theme behavior deterministic while preserving an adapter seam for a future OpenTUI implementation.

## Project Comparison

| Project | Pattern | Guga decision |
| --- | --- | --- |
| Pi | Native terminal workbench with explicit queue controls (`steer`, `followUp`, `abort`) | Adopt the queue/control vocabulary, but expose it through Host protocol instead of terminal-only state |
| Claude Code | Terminal platform organized around transcript + prompt input + permission panels | Adopt the workbench shape, but avoid copying the full TUI control surface |
| OpenCode | Local server + SDK + SSE so CLI/Desktop/IDE share one backend | Adopt REST + SSE + SDK as the canonical local protocol |
| ACP | JSON-RPC agent/editor protocol with permission/progress concepts | Treat as a future adapter that maps to/from Host UI Protocol v1 |

## Protocol Principles

1. **Host is the source of truth.** Core executes runs; HostRuntime projects core facts into public resources/events. Clients do not infer tool, permission, or run status from assistant text.
2. **Renderers are clients.** OpenTUI, desktop GUI, browser, stdio, and future ACP are adapters over Host UI Protocol v1.
3. **Resources are queryable; streams are observable.** SSE can disconnect. Clients must be able to re-fetch resources and replay events after `lastSeq`.
4. **Permission is first-class.** Permission requests are not ordinary UI interactions because they carry security/audit semantics and must fail closed.
5. **Interactions are generic UI requests.** Select/input/editor/notify/status/widget requests are generic host-to-client UI requests.
6. **Queue is visible.** Running input must become a queued resource and emit `queue.updated`; it cannot live only in a local editor buffer.
7. **External protocols are adapters.** AG-UI, ACP, stdio JSONL, and desktop-specific IPC map to Host UI Protocol v1 rather than replacing it.

## Canonical Transport

### Local REST + SSE

The primary protocol for CLI and desktop is local HTTP:

- REST for snapshots, resource queries, and control commands.
- SSE for ordered run events.
- SDK wraps both surfaces and is the preferred client API.

### In-Process Shortcut

The CLI may construct `HostRuntime` in-process for startup speed, but workbench code must still talk through a HostClient-shaped abstraction. In-process mode is an optimization, not a separate protocol.

Two transports should share the same client contract:

- HTTP transport: `HostClient` over local REST + SSE.
- In-memory transport: `HostClient` facade over `HostRuntime`, preserving the same request/response DTOs, event ordering, error codes, and reconnect semantics where applicable.

Workbench modules must not call `HostRuntime` private methods directly. This keeps CLI behavior aligned with the future desktop GUI and prevents terminal-only protocol drift.

### Stdio JSONL

Stdio JSONL remains an adapter for external embedding and smoke tests. It should map to the same resource/event/control vocabulary.

## Protocol Info

Add a protocol discovery resource so desktop and CLI can verify compatibility:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/protocol` | Return protocol version and feature flags |

`ProtocolInfoResource` should include:

- `version`: `"1"`
- `features`: string list from a centralized protocol feature set, for example `sessions`, `runs`, `events`, `queue`, `permissions`, `interactions`, `operations`
- `server`: optional package/runtime metadata

SDK clients must fetch `/protocol` during connection setup and fail fast when `version` is unsupported. Feature checks should use exported constants from `@guga-agent/host-protocol`, not magic strings in CLI or desktop code.

## Core Resources

### Session

`SessionResource` represents a conversation/workbench workspace:

- `id`
- `title`
- `profileId`
- `modelId`
- `createdAt`
- `updatedAt`
- `activeBranchId`
- `branches`

`profileId` and `modelId` are optional summary fields for workbench navigation and desktop sidebars. A profile switch creates a new session by default so transcripts from different agent profiles do not share ambiguous session metadata.

`POST /sessions/:sessionId/fork` creates a new branch under the same `sessionId`; it does not create a child session. The response keeps the same session id and updates `activeBranchId`.

Session controls:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/sessions` | Create session |
| `GET` | `/sessions` | List sessions |
| `GET` | `/sessions/:sessionId` | Get session |
| `POST` | `/sessions/:sessionId/resume` | Resume branch |
| `POST` | `/sessions/:sessionId/fork` | Fork branch |
| `GET` | `/sessions/:sessionId/tree` | Query branch tree |

### Run

`RunResource` represents one user turn/run:

- `id`
- `sessionId`
- `status`
- `input`
- `createdAt`
- `updatedAt`
- `lastSeq`
- `finalAnswer`
- `error`
- `queuedInputs`
- optional embedded `events` for local snapshots

Run status v1:

- `queued`
- `running`
- `waiting-for-permission`
- `waiting-for-interaction`
- `completed`
- `failed`
- `cancelled`

Run controls:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/sessions/:sessionId/runs` | Start a run |
| `GET` | `/runs/:runId` | Get run snapshot |
| `GET` | `/runs/:runId/events` | List or stream run events |
| `POST` | `/runs/:runId/input` | Queue steering/follow-up input |
| `POST` | `/runs/:runId/cancel` | Cancel active run |
| `POST` | `/runs/:runId/abort` | Alias for cancel in v1; may specialize later |

### Queue

`QueuedRunInputResource` represents user text submitted while a run is active:

- `id`
- `mode`: `steer` or `follow_up`
- `status`: `pending`, `consumed`, `deferred`, or `cancelled`
- `text`
- `textPreview`
- `createdAt`
- `resolvedAt`
- `consumedByRunId`

Queue semantics:

- `follow_up` must be consumed after the current terminal run and start the next run in the same session.
- `steer` may be injected at a runtime safe point. If the core cannot inject mid-run yet, the item remains `deferred`; it must not be automatically converted to `follow_up`.
- Clients may offer an explicit requeue/promote UX later, but v1 does not silently promote `steer` into `follow_up`.
- Every queue mutation emits `queue.updated` with summaries for pending/deferred items.
- A terminal event is final for a run. Any queue status changes caused by that run must be emitted before `run.completed`, `run.failed`, or `run.cancelled`.

### Permission

`PermissionRequestResource` is a first-class security/audit resource:

- `id`
- `runId`
- `sessionId`
- `callId`
- `toolName`
- `status`: `pending`, `allowed`, `denied`, `cancelled`, `expired`
- `input`
- `reason`
- `createdAt`
- `resolvedAt`

Permission controls:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/permissions/:permissionId` | Get permission request |
| `POST` | `/permissions/:permissionId/respond` | Resolve with allow/deny |

SDK clients expose this as `respondPermission(permissionId, resolution)`.

`PermissionResolution`:

- `decision`: `allow` or `deny`
- `remember`: `once`, `session`, or `always`
- `reason`
- `updatedInput`

Rules:

- Headless/non-interactive clients must fail closed for ask-required permissions.
- Desktop/CLI render permission requests differently, but both submit the same `PermissionResolution`.
- Destructive commands may be denied before becoming a pending permission resource.
- Responding to a non-pending permission returns `409 PERMISSION_NOT_PENDING`.
- Missing permissions return `404 NOT_FOUND`.
- Invalid resolutions return `400 BAD_REQUEST`.
- Permission timeout or run abort resolves the resource to `expired` or `cancelled` without granting access.

### Interaction

`InteractionResource` represents generic UI requests that are not security permissions:

- `id`
- `sessionId`
- `runId`
- `status`: `pending`, `resolved`, `cancelled`
- `request`
- `response`
- `createdAt`
- `resolvedAt`

Interaction controls:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/sessions/:sessionId/interactions` | Create interaction request |
| `GET` | `/interactions/:interactionId` | Get interaction |
| `POST` | `/interactions/:interactionId/respond` | Resolve interaction |

Supported `InteractionRequest.kind` in v1:

- `select`
- `confirm`
- `input`
- `editor`
- `notify`
- `setStatus`
- `setWidget`
- `setTitle`
- `set_editor_text`

### Operations

Operations stay query-only in v1:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/capabilities` | List capability resources |
| `GET` | `/operations/health` | Provider/runtime health |
| `GET` | `/operations/audit` | Audit summaries |
| `GET` | `/operations/metrics` | Metrics snapshot |
| `GET` | `/operations/status` | Combined operational status |

## Host Events

`HostEvent` is the append-only UI observation vocabulary. Each event has:

- `type`
- `seq`
- `occurredAt`
- `sessionId`
- `runId`

`seq` is monotonically increasing per run. Clients should store `lastSeq` and reconnect with `afterSeq`.

### Event Types

Run lifecycle:

- `run.started`
- `run.completed`
- `run.failed`
- `run.cancelled`

Message stream:

- `message.delta`
- `message.completed`

Tool lifecycle:

- `tool.started`
- `tool.completed`
- `tool.failed`

Permission:

- `permission.requested`
- `permission.resolved`

Interaction:

- `interaction.requested`
- `interaction.resolved`
- `interaction.cancelled`

Queue:

- `queue.updated`

Other:

- `context.compacted`
- `artifact.created`
- `usage.recorded`

### Event Delivery Contract

1. Client starts with a resource snapshot, usually `RunResource`.
2. Client subscribes to `/runs/:runId/events?afterSeq=<lastSeq>` with `Accept: text/event-stream`.
3. Server replays buffered events with `seq > afterSeq`, then streams new events.
4. On disconnect, client fetches `RunResource`, compares `lastSeq`, then reconnects with the last observed seq.
5. SSE is observation-only; state-changing actions must use REST controls.
6. SSE event `id` is the string form of `HostEvent.seq`.
7. In v1, per-run events are retained for the lifetime of the host process or durable session store entry. If a future bounded buffer cannot replay `afterSeq`, the server must return a recoverable stale-cursor error and clients must refetch the run snapshot.
8. `RunResource.lastSeq` is the latest appended event seq. After a terminal run event, no further events may be appended to that run.

## State Machines

### Abort

Abort/cancel is a terminal transition for the active run:

- emits queue updates for queue items affected by the abort before the terminal event;
- marks pending permissions for the run as `cancelled` and emits `permission.resolved`;
- marks pending interactions for the run as `cancelled` and emits `interaction.cancelled`;
- emits `run.cancelled` as the terminal event;
- keeps the session usable for later runs.

Pending `follow_up` and `steer` items associated with the aborted run are cancelled in v1. A terminal client may restore text into its local editor buffer, but that restoration is client-local and not a protocol fact.

### Interaction Waiting

When a run-scoped interaction is pending, `RunResource.status` becomes `waiting-for-interaction`. Resolving or cancelling the interaction returns the run to `running` unless the run is already terminal.

## Client View Model Boundary

CLI/OpenTUI and desktop GUI should share the same host-facing reducer shape:

```text
Host resources + HostEvent stream
  -> workbench state reducer
  -> renderer-specific view model
  -> OpenTUI / desktop GUI renderer
```

Allowed client-local state:

- input buffer
- selection/focus
- scroll position
- local theme/layout
- transient hover/keyboard state

Not allowed as client-only state:

- run status
- tool status
- permission decision
- interaction status
- queue contents
- session branch state
- usage/audit facts

## Implementation Gaps Against Current Code

Current code already has:

- `@guga-agent/host-protocol` DTOs for sessions, runs, events, interactions, queue, operations.
- `@guga-agent/host-runtime` in-memory store and event projection.
- `@guga-agent/host-local-server` REST/SSE routes.
- `@guga-agent/host-sdk` typed client.

Required v1 completion work:

1. Add `/protocol` and `ProtocolInfoResource`.
2. Add `waiting-for-interaction` run status.
3. Add `run.cancelled` as a terminal event instead of representing cancellation only as `run.failed`.
4. Add `interaction.cancelled` event/resource transition.
5. Add first-class permission resources and `respondPermission` SDK/server/runtime flow.
6. Wire permission resolver bridge so code-agent write/execute asks become Host permission resources.
7. Define and implement queue consumption, especially `follow_up` after terminal run.
8. Ensure SSE `afterSeq` replay, event IDs, and client reconnect behavior are tested.
9. Keep OpenTUI imports out of host protocol/runtime/SDK packages.
10. Add cross-transport contract tests for HTTP and in-memory HostClient implementations.
11. Ensure fork semantics stay branch-within-session and expose optional `profileId` / `modelId` session metadata.

## Guga 落点

- CLI workbench can use OpenTUI freely behind `packages/cli/src/tui/*`.
- Desktop GUI should use the same Host SDK and reducer semantics, not a separate GUI-specific agent protocol.
- The protocol package remains serializable TypeScript DTOs only.
- Host runtime remains the bridge from core execution facts to UI facts.
- Any future ACP/AG-UI/stdin adapter should translate at the edge from Host UI Protocol v1.

## Evidence

- Fact: `docs/research/context-packs/ui-protocol.md` says OpenCode exposes capabilities through local HTTP + SSE and all clients communicate through that shared surface.
- Fact: `docs/research/context-packs/ui-protocol.md` recommends HTTP Server + SSE, Session REST API, SDK, and TUI/CLI control mode for Guga Phase 1.
- Fact: `docs/research/context-packs/tool-registry.md` identifies allow/ask/deny permissions as a cross-project consensus and fail-closed as the safe default.
- Fact: `docs/solutions/architecture-patterns/host-protocol-cli-workbench.md` already defines the four-layer boundary: core, host-protocol DTOs, host-runtime projection, local server/SDK/CLI clients.
- Fact: `packages/host-protocol/src/events.ts` already defines ordered Host events for run/message/tool/permission/interaction/queue/context/artifact/usage.
- Fact: `packages/host-protocol/src/resources.ts` already defines session, run, interaction, permission, queue, capability, audit, health, usage, and metrics resources.
- Fact: `packages/host-sdk/src/client.ts` already exposes session/run/event/queue/interaction/operations methods, but not permission response.
- Inference: Guga should stabilize Host UI Protocol v1 before binding the terminal UX to OpenTUI, so the desktop GUI can reuse the same session/run/event/control semantics.
