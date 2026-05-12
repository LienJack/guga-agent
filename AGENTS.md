<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->

## Research Reference Rule

During research, planning, roadmap, or architecture analysis, when the user says **"参考全项目"**, interpret it as **all reference projects under `/Users/lienli/Documents/GitHub/agent-ref`**.

This is a research-scope phrase, not a requirement to scan every reference repo during routine coding.

Before reading raw files in `agent-ref`, use this repo's prepared research materials first:

- `docs/research/intake/source-contract.md`
- `docs/research/repomix/`

Use `.trellis/spec/guides/agent-reference-projects-guide.md` for the detailed routing rules.
