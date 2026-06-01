# Ink TUI workbench input

Implement the plan in `docs/plans/2026-05-28-042-feat-ink-tui-workbench-plan.md`.

The durable requirements, scope boundaries, implementation units, test scenarios, and verification criteria live in that plan. Treat it as the execution authority for this Trellis task.

Key boundaries:

- Bare interactive `guga`, `guga --mock`, `guga chat`, and `guga interactive` should enter an Ink/React workbench only in TTY contexts.
- Headless/scriptable paths such as `guga run`, `guga -p`, `--list-models`, `init`, and `login` must not import Ink/React early.
- Renderer code must stay under `packages/cli/src/ink-workbench/` and consume typed HostClient resources/events and workbench projections.
- Prompt editing, focus ownership, slash commands, selectors, permission prompts, interaction prompts, queue state, disconnected state, and active-run routing must be explicit state, not inferred from assistant text.
- Keep runtime facts owned by HostClient/host protocol; Ink components dispatch typed controller actions only.
