# M7/M11 CLI Host Protocol Workbench Plan

## Goal

Implement the first CLI-first host protocol slice for Guga: a typed host event/resource contract, local server/SSE adapter, typed SDK/client, and CLI entry that can run an agent workflow without duplicating `packages/core` runtime logic.

## Scope

This plan covers the first M7/M11 slice:

- Define canonical host/UI protocol types.
- Wrap `AgentRuntime` in a host service that manages sessions/runs/events.
- Expose a minimal local HTTP + SSE server.
- Provide a typed client usable by CLI and future Web/desktop.
- Provide a CLI package with headless/debug basics and an interactive permission path where feasible.
- Keep desktop/Web as future consumers of the same protocol; do not build a full UI yet.

## Non-Goals

- No full desktop app.
- No IM gateway.
- No WebSocket PTY.
- No ACP/LSP implementation.
- No replacement agent loop.
- No provider credential UX beyond a minimal config/env path.

## Architecture Decision

Because `pnpm-workspace.yaml` currently includes only `packages/*`, the first implementation should use packages rather than introduce `apps/*` immediately:

- `packages/host-protocol`: shared DTOs, `HostEvent`, SSE envelope, resource types.
- `packages/host-runtime`: in-process host service that wraps `AgentRuntime`.
- `packages/host-local-server`: Node HTTP server + SSE endpoint over `host-runtime`.
- `packages/host-sdk`: typed client and optional local server launcher.
- `packages/cli`: CLI product surface using the SDK or in-process host runtime.

If later we introduce `apps/cli`, `apps/server`, or `apps/web`, they should depend on these packages rather than owning protocol logic.

## Implementation Units

### U1 — Protocol Contracts

Files:

- `packages/host-protocol/package.json`
- `packages/host-protocol/src/index.ts`
- `packages/host-protocol/src/events.ts`
- `packages/host-protocol/src/resources.ts`
- `packages/host-protocol/src/sse.ts`
- `packages/host-protocol/src/events.test.ts`

Work:

- Define `HostEvent` for run/message/tool/permission/artifact/context/usage/error.
- Define session/run/artifact/capability DTOs.
- Define SSE envelope with `id`, `event`, `data`, `seq`.
- Provide validators/normalizers only if needed; prefer small typed constructors first.

Acceptance:

- Events are JSON-serializable.
- Every event carries `runId` where applicable and monotonic `seq`.
- Unit tests cover event sequencing and serialization.

### U2 — Host Runtime Service

Files:

- `packages/host-runtime/package.json`
- `packages/host-runtime/src/index.ts`
- `packages/host-runtime/src/host-runtime.ts`
- `packages/host-runtime/src/event-projector.ts`
- `packages/host-runtime/src/in-memory-run-store.ts`
- `packages/host-runtime/src/host-runtime.test.ts`
- `packages/host-runtime/src/dependency-boundary.test.ts`

Work:

- Wrap `AgentRuntime` without changing the agent loop.
- Create sessions/runs and map core `AgentEvent` into `HostEvent`.
- Maintain in-memory run snapshots and per-run event buffers for first slice.
- Surface `listCapabilityDescriptors()` through host resource.
- Wire cancel via `AbortController`.
- Model permission pending requests at the host layer if existing permission resolver can be bridged without core churn; otherwise document a minimal core contract needed before coding permission UI.

Acceptance:

- A mock provider run emits run/message/tool/run terminal events.
- Failure emits typed `run.failed`.
- Capability listing returns M6 descriptors.
- Cancel path has a test even if provider/tool abort granularity is limited.

### U3 — Local HTTP + SSE Server

Files:

- `packages/host-local-server/package.json`
- `packages/host-local-server/src/index.ts`
- `packages/host-local-server/src/server.ts`
- `packages/host-local-server/src/routes.ts`
- `packages/host-local-server/src/sse.ts`
- `packages/host-local-server/src/server.test.ts`

Work:

- Use Node built-in `http` first; add a framework only if tests/ergonomics justify it.
- Implement:
  - `POST /sessions`
  - `GET /sessions/:sessionId`
  - `POST /sessions/:sessionId/runs`
  - `GET /runs/:runId`
  - `GET /runs/:runId/events`
  - `POST /runs/:runId/cancel`
  - `GET /capabilities`
- Emit SSE with ordered `HostEvent` envelopes.

Acceptance:

- Integration test can create a session, start a run, consume SSE, and read final run state.
- Disconnecting SSE does not lose run state.
- Server shutdown disposes runtime/plugin state.

### U4 — Typed SDK / Client

Files:

- `packages/host-sdk/package.json`
- `packages/host-sdk/src/index.ts`
- `packages/host-sdk/src/client.ts`
- `packages/host-sdk/src/server-launcher.ts`
- `packages/host-sdk/src/sse-client.ts`
- `packages/host-sdk/src/client.test.ts`

Work:

- Implement a small handwritten client for the first slice.
- Provide `connectHost({ baseUrl })`.
- Provide `createLocalGugaHost()` launcher if feasible.
- Provide fetch-based SSE client for Node and browser-compatible environments.
- Keep API shaped so it can be replaced by OpenAPI generation later.

Acceptance:

- Client tests cover session creation, run creation, event stream parsing, cancel, and capabilities.

### U5 — CLI Package

Files:

- `packages/cli/package.json`
- `packages/cli/src/index.ts`
- `packages/cli/src/commands/run.ts`
- `packages/cli/src/render/events.ts`
- `packages/cli/src/config.ts`
- `packages/cli/src/run.test.ts`

Work:

- Implement `guga run "<prompt>"`.
- Support `--headless`, `--debug-events`, `--provider`, `--model`, and `--mock` for tests/demo.
- Render tool progress from `HostEvent`, not assistant text.
- For first slice, permission prompt can be minimal and terminal-based; if host permission bridge needs core work, implement the protocol DTO and document the remaining core hook.

Acceptance:

- CLI test runs with mock provider and prints final answer.
- `--debug-events` prints structured event lines.
- Tool progress renderer is covered by unit tests.

### U6 — Docs, Review, And Gates

Files:

- `packages/host-protocol/README.md`
- `packages/host-runtime/README.md`
- `packages/host-local-server/README.md`
- `packages/host-sdk/README.md`
- `packages/cli/README.md`
- `docs/research/index.md`
- `docs/solutions/architecture-patterns/host-protocol-cli-workbench.md`
- `blog/build-agent-from-zero-cli-desktop-web-host.md`

Work:

- Update research index with M7/M11 report.
- Document host protocol boundaries and non-goals.
- Run `ce-code-review`.
- Run `ce-compound`.
- Write the host protocol blog.

Acceptance:

- `pnpm -r test`
- `pnpm -r typecheck`
- `pnpm -r build`
- Trellis task archived after commit.

## Test Strategy

- Unit tests for protocol serialization and event projection.
- Host runtime integration tests with mock provider/tool.
- HTTP server tests using real local port and fetch/SSE parser.
- SDK tests against local test server.
- CLI tests that spawn the CLI with `--mock` and assert output/events.
- Full workspace `pnpm -r test`, `pnpm -r typecheck`, `pnpm -r build`.

## Risks

- Permission bridging may require a new async resolver contract in `packages/core`; if so, keep it small and test it at runtime level.
- A handwritten SDK can drift from server routes; keep types shared from `host-protocol`, and consider OpenAPI generation when route count grows.
- Introducing CLI without real provider config can become demo-only; first implementation should support mock for tests and provider/model env config for real usage.
- SSE recovery needs event ids; first slice can replay buffered events per run, but durable resume should later bind to M5 event store.

## Sequencing

1. U1 protocol contracts.
2. U2 host runtime event projection.
3. U3 local HTTP/SSE server.
4. U4 typed SDK.
5. U5 CLI.
6. U6 docs/review/blog/finish.
