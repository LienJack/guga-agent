# Update agent architecture docs with Guga calibration

## Goal

Update the remaining agent architecture roadmap documents so they match the Guga-specific calibration style added to `docs/agent-react-pattern.md`.

## What I already know

- User asked to update six docs "like above".
- The previous update added a Guga-specific calibration section and a concrete P0/P1/P2 table without rewriting the whole document.
- Relevant evidence already exists in `docs/research/context-packs/` and `docs/research/source-analysis/`.

## Requirements

- Update only the requested six docs.
- Preserve the existing L0-L5 structure and source-backed style.
- Add Guga-specific prioritization and boundaries where missing.
- Keep the changes concise and document-level; no code behavior changes.

## Acceptance Criteria

- [ ] Each requested doc has a Guga-specific calibration or priority section.
- [ ] The updates align with the existing context packs and do not contradict the ReAct document.
- [ ] Markdown code fences remain balanced.
- [ ] `git diff --check` passes for the touched docs.

## Out of Scope

- Rebuilding repomix outputs or regenerating research packs.
- Editing unrelated research artifacts.
- Implementing runtime code.

## Technical Notes

- Requested docs: `agent-agui.md`, `agent-context-management.md`, `agent-llm-integration.md`, `agent-mcp-skills.md`, `agent-prompt-engineering.md`, `agent-tool-management.md`.
- Main research context: `agent-loop.md`, `tool-registry.md`, `context-compression.md`, `provider-abstraction.md`, `ui-protocol.md`, `multi-agent.md`.
