# CLI Ctrl+C exits terminal mode

## Goal

Make the Ink CLI workbench match Pi and Claude Code terminal behavior: pressing `Ctrl+C` exits the terminal workbench immediately instead of being treated as an in-app abort/editing intent.

## What I already know

- User explicitly requested Pi / Claude Code parity for `Ctrl+C`.
- Current shared key mapper converts `Ctrl+C` into an `abort` intent.
- Ink workbench currently routes every input through `inkInputToKeyIntent`, so `Ctrl+C` can be captured by prompt, permission, interaction, slash, or selector state instead of exiting.
- Escape should remain the in-app abort/dismiss key.

## Requirements

- `Ctrl+C` exits the Ink terminal workbench from the top-level input handler.
- `Ctrl+C` should not call host `abortRun` and should not be blocked by permission or interaction focus.
- Existing Escape behavior remains unchanged.
- Shared key mapping remains stable unless the Ink app needs a new distinct intent.

## Acceptance Criteria

- [ ] A test proves `Ctrl+C` exits the mock workbench CLI route cleanly.
- [ ] A test proves `Ctrl+C` exits without aborting an active host run.
- [ ] Existing Ink workbench tests still pass.
- [ ] Typecheck passes for the CLI package.

## Out of Scope

- Changing slash command semantics.
- Changing Escape behavior.
- Reworking the legacy/OpenTUI key mapper.

## Technical Notes

- Main implementation file: `packages/cli/src/ink-workbench/app.tsx`.
- Relevant tests: `packages/cli/src/ink-workbench/app.test.tsx`, `packages/cli/src/ink-workbench/workbench-smoke.test.tsx`.
