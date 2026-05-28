---
title: "feat: build Ink TUI workbench input"
type: feat
status: completed
date: 2026-05-28
origin: docs/brainstorms/2026-05-28-m42-ink-tui-workbench-parity-requirements.md
---

# feat: build Ink TUI workbench input

## Summary

Replace the line-oriented interactive CLI with an Ink/React workbench. The interactive surface should keep a bottom prompt editor visible while rendering transcript, run status, queue state, permissions, interactions, and tool progress above it. The implementation reuses the existing HostClient, workbench event reducer, slash command router, and renderer-neutral terminal editor primitives while preserving fast headless commands.

## Problem

Bare `guga` previously behaved like a readline REPL: it printed startup metadata, showed `>`, and waited for a full line. The target experience is a Claude Code / Pi style agent console where input routing is explicit: prompt text, slash commands, selectors, permission responses, interaction responses, active-run steer/follow-up input, and abort handling are separate states with a clear focus model.

## Requirements

- Bare interactive `guga`, `guga --mock`, `guga chat`, and `guga interactive` enter the Ink workbench in TTY contexts.
- Headless paths such as `guga run`, `guga -p`, `--list-models`, `init`, and `login` do not statically import Ink or React.
- Non-TTY interactive mode returns friendly guidance instead of trying to render Ink.
- The prompt editor supports multi-line editing, cursor movement, history draft restore, bracketed paste, submit/newline distinction, and Unicode smoke coverage.
- Typing `/` opens a slash palette before submission; the palette supports filtering, keyboard navigation, help text, Escape close, and unknown command protection.
- `/model`, `/profile`, and `/resume` expose keyboard selector flows while preserving direct slash command entry for power users and tests.
- Active-run input routes explicitly to permission response, interaction response, steer, follow-up, slash command, or abort.
- Permission and interaction prompts participate in the same focus stack, so Enter and Escape target the topmost control.
- Workbench UI consumes HostClient resources, HostEvent projections, and typed controller actions only; it does not call HostRuntime private APIs or infer runtime state from assistant text.
- Queue state, usage, run status, tool progress/error, permission state, interaction state, disconnected state, compaction, and artifacts remain first-class transcript/status facts.
- Stream disconnects and sequence discontinuities are surfaced as disconnected state; the MVP does not continue sending input to an uncertain run.

## Scope

- In scope: an Ink/React Node TUI under `packages/cli/src/ink-workbench/`, renderer-neutral prompt/focus/slash/selector state machines, HostClient controller routing, event/view projection updates, import-boundary tests, and mock interactive smoke coverage.
- Out of scope: OpenTUI/Bun migration, full Claude Code teams/tasks/background-agent panels, Web/Desktop UI, rich media paste, and full provider OAuth.

## Reference Context

- `packages/cli/src/commands/run.ts` owns command routing and is the right place for the dynamic interactive import.
- `packages/cli/src/tui/editor.ts` and `packages/cli/src/tui/keys.ts` provide renderer-neutral input primitives.
- `packages/cli/src/workbench/event-reducer.ts`, `state.ts`, and `views.ts` already project HostEvents into transcript/status models.
- `packages/cli/src/workbench/commands.ts` centralizes slash command parsing and execution.
- `packages/host-sdk/src/client.ts` exposes the required session, run, streaming, queue input, abort, interaction, permission, capability, and operation APIs.
- `docs/solutions/architecture-patterns/host-ui-protocol-v1.md` defines the renderer as a HostClient consumer and treats permissions, queue state, and runtime facts as protocol-owned state.
- Ink 7 targets Node 22+ and React 19, supports explicit stdin/stdout/stderr in `render()`, and provides raw keyboard input through `useInput`.

## Design Decisions

- Use Ink/React for the MVP renderer to match the requested Claude Code style interaction model without changing Guga from Node/pnpm to Bun.
- Load Ink only through a dynamic import from the TTY interactive path.
- Keep renderer-specific React code under `packages/cli/src/ink-workbench/`.
- Keep host projection, slash command routing, prompt editing, focus priority, and selector state testable without a terminal renderer.
- Treat the prompt as an input orchestrator, not a text box: editor text, slash palette, selectors, active-run targets, and focus ownership are independent state machines.
- Move selector option construction and command side effects into the controller so React components do not reach into HostClient/config internals.
- Remove the partial static fallback path; raw-mode unavailable now returns a friendly unsupported-TTY error.

## Implementation Units

- U1. Add the Ink lazy launcher, dependency boundary, TTY route tests, and `.tsx` build support.
- U2. Extend renderer-neutral editor/key primitives for multiline input, Unicode-aware cursor movement, history draft restore, and bracketed paste.
- U3. Add pure prompt, focus, slash palette, and selector state machines.
- U4. Add the Ink workbench app and components for status, transcript, prompt editor, slash palette, and selector overlay.
- U5. Add a HostClient-backed controller for start run, queued input, permission response, interaction response, slash commands, abort, reload, and selector construction.
- U6. Extend event/view projections for disconnected state, pending permissions/interactions, queue counts, active run display, and stream replay errors.
- U7. Add tests for reducers, controller routing, focus priority, selector behavior, import boundaries, and real Ink smoke paths.
- U8. Update architecture documentation and mark the Trellis task/plan complete after verification.

## Acceptance Criteria

- `guga --mock` opens the Ink workbench in a fake TTY smoke test and exits cleanly through `/exit`.
- Non-TTY `guga`, `guga chat`, and `guga interactive` return friendly guidance.
- Headless `guga run`, `guga -p`, `--list-models`, `init`, and `login` remain stable and do not statically import Ink/React.
- Typing `/` opens a slash palette; commands with arguments such as `/login openai` submit the complete prompt buffer.
- `/model` selection affects the next started run's model/provider.
- Pending permission/interaction input wins over open slash/selector overlays.
- Escape does not abort an active run while a pending permission/interaction target owns focus.
- Stream discontinuities lock host-writing input until reload.
- `pnpm --filter @guga-agent/cli exec vitest run`, `pnpm --filter @guga-agent/cli typecheck`, and `pnpm --filter @guga-agent/cli build` pass.

## Verification Notes

- The implementation should be reviewed for correctness, testing coverage, maintainability, project standards, and agent-native architecture boundaries.
- Any reviewer finding that changes user-facing behavior or project compliance should be fixed before marking the plan complete.
