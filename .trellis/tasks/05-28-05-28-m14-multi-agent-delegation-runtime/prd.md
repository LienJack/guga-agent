# M14 Multi Agent Delegation Runtime PRD

## Goal

Implement the first Guga multi-agent substrate as a single-layer `delegateTask` tool package that can run an isolated child task through an injected runner and return a compact, auditable result to the parent.

## Context

- `docs/research/current-multi-agent-collaboration-2026.md` recommends P1 `delegateTask` before handoff/team/workflow/A2A.
- `docs/research/context-packs/multi-agent.md` shows mature systems limit recursion and isolate child context.
- Guga now has stable tool, permission, session, replay, profile, and eval packages, so a first-party delegation helper can live outside core.

## Requirements

1. Create a first-party `@guga-agent/plugin-agent-delegation` package.
2. Export a `createDelegateTaskTool()` factory that returns a core `ToolDefinition`.
3. Use an injected child runner so tests do not need real providers or nested runtime bootstrapping.
4. Validate input shape and report deterministic diagnostics.
5. Enforce allowlist-only tool inheritance from a parent-visible catalog.
6. Block recursive delegation tools by default.
7. Carry parent/child correlation in result metadata.
8. Render a compact parent-facing output with status, summary, child ids, and event counts.
9. Add solution documentation and the M14 blog article.

## Non-Goals

- No handoff or active-agent switching.
- No team/swarm/mailbox runtime.
- No background child runs.
- No remote A2A adapter.
- No UI implementation.
- No core event-union expansion in this first slice.

## Acceptance Criteria

- Focused package tests, typecheck, and build pass.
- Full monorepo test/typecheck/build pass.
- M14 docs and article exist.
- Trellis task validates and archives.
