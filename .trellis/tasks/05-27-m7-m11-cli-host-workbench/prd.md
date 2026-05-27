# brainstorm: M7 M11 CLI host workbench

## Goal

Turn the next roadmap module into an executable track: define and implement a CLI-first host protocol so Guga can be used from CLI first, then projected into server/Web/desktop without duplicating the agent loop. This task starts with requirements, research, and plan gates before code changes.

## What I already know

- `任务.md` marks M7/M11 as the next major module after M6 capability discovery.
- `docs/roadmap.md` says M7/M11 must define Guga Host Protocol: session CRUD, prompt/run, event stream, permission request/response, tool progress, artifact read, resume/fork/cancel.
- `docs/research/context-packs/ui-protocol.md` recommends OpenCode-style local HTTP server + SSE + typed SDK as the Phase 1 host strategy.
- `docs/research/agent-agui.md` recommends canonical `AgentUIEvent` plus adapters, rather than making AG-UI/ACP/LangGraph the core schema.
- M5/M6 are now available as substrate: session/replay/artifact contracts and capability discovery exist.
- The repository currently has packages but no `apps/cli`, `apps/server`, or `apps/web` directory.

## Assumptions

- M7 and M11 should be planned together, but implemented in a narrow first slice: host protocol + CLI + minimal viewer contract.
- The first transport should be local HTTP + SSE; WebSocket is only needed later for PTY or bidirectional terminal streams.
- CLI is the primary product surface for this task; desktop/Web should initially consume the same event stream as a viewer/control surface.
- OpenClaw desktop research is required before substantial desktop UX implementation, but not before defining the protocol substrate.

## Resolved Questions

- M6 capability discovery is complete enough to feed host protocol capability surfaces.
- Full marketplace, IM gateway, ACP/LSP depth, and full desktop workbench are out of this first M7/M11 task.
- The first implementation should stay inside the current `packages/*` workspace layout, with future `apps/*` shells depending on protocol/server/SDK packages.
- The first typed SDK should be handwritten over shared types, with OpenAPI generation deferred until the route surface grows.

## Open Questions

- Should the first CLI run in-process for zero server boot latency, or always auto-start a local server to dogfood the protocol?

## Requirements

- R1. Produce `docs/research/cli-desktop-web-host-architecture.md` before implementation.
- R2. Produce a host protocol implementation plan under `docs/plans/` before code changes.
- R3. Define canonical host/UI events for run, message, tool, permission, artifact, context, usage, and error states.
- R4. Define session/run resources and lifecycle, including resume/fork/cancel.
- R5. Define local HTTP + SSE transport and recovery behavior.
- R6. Define permission control endpoints and pending request semantics.
- R7. Define typed SDK ownership and generation/handwritten strategy.
- R8. Implement CLI as the first complete product surface.
- R9. Keep server/Web/desktop as adapters over runtime protocol; do not duplicate agent loop.
- R10. Keep AG-UI/ACP/LangGraph compatibility as adapter research, not canonical schema.

## Acceptance Criteria

- [x] Requirements doc exists at `docs/brainstorms/2026-05-27-m7-m11-cli-host-workbench-requirements.md`.
- [x] Research report exists at `docs/research/cli-desktop-web-host-architecture.md`.
- [x] Plan exists under `docs/plans/`.
- [ ] Implementation includes tests for server run/session APIs and SSE event stream.
- [ ] Implementation includes tests for CLI headless and interactive permission flow.
- [ ] Implementation includes tests for resume/fork/cancel protocol behavior.
- [ ] `pnpm -r test`, `pnpm -r typecheck`, and `pnpm -r build` pass or exact blockers are documented.
- [ ] `ce-code-review`, `ce-compound`, host protocol blog, and Trellis finish-work are run before closing.

## Definition of Done

- CLI can independently run a useful Guga agent workflow.
- Server and CLI use the same runtime and typed host protocol.
- Web/desktop can later consume typed events without parsing assistant text.
- The task leaves clear follow-on boundaries for desktop workbench, ACP/LSP adapters, and code-agent pressure tests.

## Out of Scope

- Full desktop workbench implementation.
- Multi-platform IM gateway.
- WebSocket PTY.
- IDE deep integration.
- Full AG-UI/ACP compatibility.

## Technical Notes

- Follow `AGENTS.md` 7-layer research funnel.
- Start from `docs/research/context-packs/ui-protocol.md` and `docs/research/agent-agui.md`.
- Use `docs/research/source-analysis/design-ideas-index.md` Gateway/UI/Channels section for deeper routing.
- Keep documents using repo-relative paths.
- Do not read raw reference source unless context packs, source-analysis, Graphify, and repomix materials are insufficient.
