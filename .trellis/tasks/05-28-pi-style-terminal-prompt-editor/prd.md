# brainstorm: Pi-style terminal prompt editor

## Goal

Implement a real Pi-style terminal workbench input experience for `guga`: a persistent bottom prompt editor, slash command popover, selector/overlay/focus stack, and running-state input controls, replacing the current line-oriented `>` prompt as the interactive product path.

## What I already know

* The user explicitly wants a Pi-like input box and interactions, not documentation-only changes.
* The current CLI still shows `home: ... project: ...` followed by a bare `>` prompt; that is not acceptable as the final interactive UX.
* The feature should reference Pi primarily, with Claude Code and OpenCode as additional interaction references.
* Existing docs already say `packages/cli/src/commands/run.ts` line REPL is temporary and should not be treated as productized workbench completion.

## Assumptions (temporary)

* The MVP should make bare `guga` enter the real workbench, while `guga run` and `guga -p` remain headless/scriptable.
* The implementation should stay inside `packages/cli` first, preserving renderer-agnostic `packages/cli/src/workbench/*` state/view modules.
* The first implementation can use a minimal native terminal renderer if OpenTUI is not Node/pnpm-ready, but it must still provide real keypress-level interaction rather than line input.

## Open Questions

* Resolved 2026-05-28: MVP implementation path is OpenTUI-first.

## Requirements (evolving)

* Bare `guga` must launch a real interactive workbench input surface, not the current line REPL.
* The prompt editor must be persistent at the bottom of the terminal and visible during idle, streaming, tool-running, permission-pending, and interaction-pending states.
* Typing `/` in the editor must open a command popover before submit.
* The command popover must support filtering, keyboard navigation, command metadata, argument/selector handoff, and Escape close.
* Running-state input must distinguish steer, follow-up, abort, permission response, and generic interaction response.
* The workbench must remain a HostClient consumer; it must not call HostRuntime private APIs or parse assistant text for state.

## Acceptance Criteria (evolving)

* [ ] `guga --mock` opens a workbench with startup/status area, transcript area, and persistent bottom prompt editor.
* [ ] Typing `/` opens a slash command popover without requiring Enter.
* [ ] `/model`, `/profile`, and `/resume` can open selector/overlay flows instead of requiring fully typed arguments.
* [ ] Editor supports multiline input, history navigation, paste handling, basic cursor movement, and non-ASCII input smoke.
* [ ] While a run streams, the editor remains visible and user input can be routed as steer or explicit follow-up.
* [ ] Escape closes the topmost overlay first, then cancels current interaction, then aborts active run.
* [ ] Tests cover editor state, key mapping, slash popover, focus stack, reducer/view projection, and a mock interactive smoke.

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Out of Scope (explicit)

* Desktop/Web UI implementation.
* Full Claude Code-scale teams/tasks/agents/settings UI.
* Provider OAuth/login implementation, except ensuring the editor/selector surface can host those flows later.
* Replacing Host protocol or creating a second UI protocol.

## Technical Notes

* Task created from user request on 2026-05-28.
* Relevant current files likely include `packages/cli/src/commands/run.ts`, `packages/cli/src/tui/*`, `packages/cli/src/workbench/*`, `packages/cli/src/run.test.ts`, and workbench tests.
* Reference docs to inspect: M37 productized CLI workbench plan, M36 CLI Claude/Pi alignment plan, UI protocol context pack, and Pi/OpenCode/Claude Code research materials.

## Research Notes

### What similar tools do

* Pi: Treats terminal input as a real editor and queue/control surface, not line-based stdin. Its reference materials show dedicated editor, input, autocomplete, modal/editor variants, status-border editor, and selector modules. Its agent harness distinguishes `steer`, `followUp`, and `nextTurn`; emits queue updates; and handles abort/queue draining at safe points.
* Claude Code: Treats `PromptInput` as an orchestration component. It coordinates text editing, history/search, slash/typeahead, paste/media, model and permission modes, overlays, queued commands, and routes the same visible input surface to different runtime targets.
* OpenCode: Exposes a broad keymap for prompt editing and autocomplete: submit, newline variants, cursor movement, history navigation, word movement/deletion, delete line/to start/to end, undo/redo, autocomplete hide/select/complete, and selectors for model/session/theme-like flows. Slash commands are first-class interactive actions, not just post-submit command strings.

### Constraints from Guga

* `packages/cli/src/commands/run.ts` currently uses `createLineQueue()` and whole-line parsing for interactive mode, so it cannot open a popover when `/` is typed before Enter.
* `packages/cli/src/tui/editor.ts`, `packages/cli/src/tui/keys.ts`, and `packages/cli/src/tui/overlay.ts` already provide deterministic primitives, but they are not wired into a raw terminal keypress lifecycle or a persistent redraw loop.
* `packages/cli/src/workbench/*` already has renderer-agnostic state/view/reducer surfaces. The new work should preserve that boundary so future Desktop/Web workbench surfaces can reuse the same concepts.
* The workbench must stay a HostClient consumer. UI state should come from host events and explicit controls, not from parsing assistant text or calling HostRuntime private APIs.

### Feasible approaches here

**Approach A: Native minimal terminal workbench first**

* How it works: Build a Node/pnpm-compatible raw-mode terminal loop in `packages/cli/src/tui/`, connect the existing editor/key/overlay primitives, add command metadata/popover/selectors, and replace `createLineQueue()` for the interactive product path.
* Pros: Fastest path to a real Pi-like input box; minimal dependency risk; deterministic tests can drive synthetic key events and rendered frames.
* Cons: Guga owns redraw, focus, terminal resize, and layout details until a richer renderer is introduced.

**Approach B: OpenTUI-first adapter (Selected)**

* How it works: Add an OpenTUI dependency and implement an OpenTUI renderer as the primary workbench surface.
* Pros: Potentially richer long-term terminal UI primitives and less hand-rolled drawing if the runtime fit is good.
* Cons: Dependency/runtime compatibility can delay the user-visible fix; still needs Guga-specific editor, command, selector, and HostClient routing semantics.

**Approach C: Hybrid renderer port + native fallback**

* How it works: Define a small renderer/input port, implement the native terminal fallback now, and leave a clean adapter slot for OpenTUI later.
* Pros: Delivers the Pi-like input box quickly while avoiding a dead-end renderer decision; keeps workbench logic testable and renderer-agnostic.
* Cons: Adds a thin abstraction upfront, and still requires native renderer implementation for the MVP.

## Proposed MVP Scope

* Replace bare `guga` interactive mode with a persistent workbench screen that has transcript/status content above and a bottom prompt editor below.
* Keep `guga run`, `guga -p`, and non-TTY usage headless/scriptable.
* Implement raw keypress input: visible cursor, multiline editing, paste handling, history, common cursor keys, Escape behavior, and terminal cleanup on exit/error.
* Implement a slash command popover triggered immediately by `/`, with filtering, keyboard navigation, metadata/help text, and dispatch into command handlers.
* Implement selector flows for `/model`, `/profile`, and `/resume` so the user can navigate choices instead of typing all arguments manually.
* Implement a focus stack so Escape closes popover/selector first, then cancels pending interaction, then aborts an active run.
* Route active-run input through explicit modes: steer current run, queue follow-up, answer interaction/permission prompts, or abort.
* Add tests for editor reducer behavior, key mapping, slash filtering/navigation, focus stack, rendered frame snapshots, and mock interactive flow.

## Decisions

* 2026-05-28: User selected Approach B, OpenTUI-first. The implementation should first verify OpenTUI package/runtime compatibility in this Node/pnpm repo, then build the primary interactive workbench on top of OpenTUI. If a compatibility blocker is discovered, document the blocker in this PRD before falling back.

## Risks / Edge Cases

* Terminal raw mode must always be restored on normal exit, error, Ctrl-C, and abort.
* Non-TTY environments must fall back to scriptable behavior with clear messaging.
* Wide characters, CJK text, combining characters, and paste bursts need at least smoke coverage; exact wcwidth perfection can be improved after the MVP.
* Streaming output must not overwrite the prompt editor or leave broken cursor state.
* Running-state input semantics must avoid accidentally sending a permission response as a normal user follow-up.
* Slash commands and selectors must remain data-driven enough for future provider login/OAuth flows to reuse the same surface.
