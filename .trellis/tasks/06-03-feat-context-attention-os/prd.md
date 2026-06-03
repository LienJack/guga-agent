# feat: Upgrade context to Attention OS

## Source Plan

- `docs/plans/2026-06-03-001-feat-context-attention-os-plan.md`

## Execution Summary

Implement the active plan that upgrades Guga's M4 context projection layer into an Attention OS surface. The work should preserve existing provider input boundaries while adding typed context ontology contracts, conservative derived state and trace sources, compaction continuity, replay/audit visibility, and default policy/documentation updates.

## Scope

- Core context contracts and projection helpers.
- Agent-loop projection integration, projection hashes, and context decision ledger metadata.
- Compaction, reinjection, replay/audit, JSONL replay, and resume report visibility.
- Default context policy metadata and architecture/research documentation.

## Non-Goals

- Long-term memory retrieval or automatic user preference extraction.
- A monolithic `ContextManager` rewrite.
- Provider-backed LLM summarization.
- Generated `packages/*/dist/` output.
