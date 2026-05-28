# Host Protocol And CLI Workbench

M7/M11 establishes Guga's first host-facing product surface without moving runtime behavior out of `packages/core`.

For the productized CLI workbench and future desktop GUI, the stabilized protocol target is documented in `docs/solutions/architecture-patterns/host-ui-protocol-v1.md`.

## Problem

CLI, local HTTP, Web, desktop, and future external protocol adapters all need the same facts:

- what session/run is active;
- which ordered events happened;
- which tools, permissions, context compactions, artifacts, and usage records belong to that run;
- how to query final state after a stream disconnects.

If each client reads core events directly or scrapes assistant text, product surfaces drift immediately. If the host server owns agent logic, core stops being the source of truth.

## Decision

Use a four-layer boundary:

1. `@guga-agent/core` remains the execution runtime.
2. `@guga-agent/host-protocol` defines public host DTOs: `HostEvent`, resources, and SSE envelopes.
3. `@guga-agent/host-runtime` wraps core, projects `AgentEvent` into ordered `HostEvent`, and stores in-memory session/run state for the first slice.
4. `@guga-agent/host-local-server`, `@guga-agent/host-sdk`, and `@guga-agent/cli` consume that host surface.

The first local transport is REST plus SSE:

- `POST /sessions`
- `GET /sessions/:sessionId`
- `POST /sessions/:sessionId/runs`
- `GET /runs/:runId`
- `GET /runs/:runId/events`
- `POST /runs/:runId/cancel`
- `GET /capabilities`

## Why This Shape

- **Run state survives stream clients.** SSE is an observation channel; `RunResource` and buffered `HostEvent` records are the queryable state.
- **CLI is a client, not a special runtime.** `guga run` uses the same SDK and event renderer that future workbench clients can use.
- **External protocols remain adapters.** AG-UI, ACP, and desktop-specific schemas can map from `HostEvent` instead of becoming core facts.
- **Capability discovery compounds M6.** `GET /capabilities` exposes M6 descriptors through the host surface.

## Current Limits

- Run execution is still synchronous at the HTTP request boundary; SSE replays buffered events for this first slice.
- Permission UI is represented in protocol/projection but not yet a complete pending approval API.
- Event storage is in-memory; durable replay should bind to M5 event/session stores later.
- CLI real-provider UX is intentionally minimal: provider/model are passed by flag or env, while `--mock` covers tests and demos.

## Verification

Focused gates added in this slice:

- Protocol sequencing and SSE serialization tests.
- Runtime projection, capability, failure, and cancel tests.
- Local server integration tests over a real port.
- SDK tests for JSON client, SSE parsing, launcher, cancel, capabilities, and typed errors.
- CLI tests for `guga run --mock`, `--debug-events`, and event rendering.
