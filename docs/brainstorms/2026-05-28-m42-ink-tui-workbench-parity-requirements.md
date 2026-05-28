# M42 Ink TUI Workbench Parity Requirements

## Goal

Build a real interactive terminal workbench for Guga with Ink: a persistent bottom prompt editor, slash palette, selectors, focus stack, transcript/status display, and explicit active-run input routing. The interaction model is informed by Claude Code, Pi, and Blade Code while staying compatible with Guga's Node/pnpm CLI runtime.

## Known Facts

- Bare `guga` currently behaves like a line REPL, waiting at `>` for a full input line.
- The desired experience is an agent console, not a documentation-only change.
- The target renderer is Ink/React in the Claude Code style.
- OpenTUI was explored earlier, but the current `@opentui/core` import path is not suitable for this Node CLI MVP because it expects Bun/FFI support.
- Ink is a better MVP fit because Ink 7 supports the current Node 22 runtime.
- Blade Code is a useful engineering reference because its default interactive command launches an Ink TUI through a dynamic React/Ink import.

## Reference Comparison

| Reference | Useful pattern | Do not copy |
| --- | --- | --- |
| Claude Code | Treat `PromptInput` as an input orchestrator: editing, history, slash/typeahead, paste hooks, mode controls, overlays, queued commands, and target routing. | The MVP does not need the full teams/tasks/background-agent control surface. |
| Pi | Treat the input area as editor plus queue/control surface, with slash commands, autocomplete, selectors, and active-run steer/follow-up semantics. | Do not copy Pi's full renderer/component stack or implement selectors for host features Guga does not expose yet. |
| Blade Code | Use Ink for the default interactive TUI and dynamically import React/Ink only on interactive paths. | Do not adopt Blade's Bun-oriented build assumptions. |

## Requirements

- Bare interactive `guga` launches an Ink workbench instead of the old line prompt.
- Scriptable commands remain headless and avoid early Ink/React imports.
- The workbench shows startup metadata, transcript, active status, queue/usage hints, and a persistent prompt editor.
- Typing `/` opens a slash palette before Enter submits anything.
- Slash commands support filtering, keyboard navigation, metadata/help, Escape close, selectors, and unknown command protection.
- `/model`, `/profile`, and `/resume` open selector flows.
- The prompt editor supports multiline input, paste, history navigation, cursor movement, Unicode smoke coverage, and explicit submit/newline behavior.
- Escape first targets the topmost overlay or pending prompt target, and only aborts an active run when no higher-priority UI target owns focus.
- Active-run input routes explicitly to steer, follow-up, permission response, interaction response, slash command, or abort.
- The renderer is a HostClient consumer and must not call HostRuntime private APIs or derive state from assistant text.

## Acceptance Criteria

- `guga --mock` opens the Ink workbench in a TTY smoke test and exits cleanly.
- Typing `/` opens an interactive slash palette.
- `/model`, `/profile`, and `/resume` can be completed through keyboard selectors.
- Streaming/tool execution keeps the input visible and routes input correctly.
- Permission and interaction prompts use the same focus stack and do not conflict with normal prompt submission.
- Non-TTY interactive mode still returns friendly guidance.
- Headless commands do not statically import the Ink workbench module.
- Tests cover prompt editor state, key mapping, slash filtering/navigation, focus stack, selectors, event/view projection, controller action routing, import boundary, and mock interactive smoke paths.

## Decision

The MVP uses an Ink-first Node TUI. This preserves Guga's current runtime, protects headless startup through dynamic imports, and keeps renderer-specific code in the Ink adapter/component layer while prompt orchestration and HostClient state remain renderer-neutral and testable.

## Out Of Scope

- Full Claude Code teams/tasks/background-agent UI.
- Web/Desktop workbench implementations.
- OpenTUI/Bun runtime migration.
- Full provider OAuth. The command/selector surface should remain ready for future login work.

## Research Notes

- Claude Code research describes `PromptInput` as an orchestrator rather than a simple text box.
- Pi research shows independent editor, autocomplete, slash command, model/session/tree selector, and queue-control tests.
- Pi focused context documents steer/follow-up/next-turn queue semantics and abort behavior.
- Blade Code packed context shows the default interactive route launching Ink and dynamically importing React/Ink.
- `docs/research/context-packs/ui-protocol.md` frames Claude Code's Ink surface as an in-process platform console that should be built incrementally.
