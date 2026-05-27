# Memory Markdown Export

Date: 2026-05-28

## 一句话结论

M19 should add a human-readable Markdown projection for active governed memory items, but it should not mutate `MEMORY.md` or import edited Markdown yet.

## Evidence

- `Fact`: `docs/research/agent-memo.md` says curated memory files are useful, but writes should be governed and auditable.
- `Fact`: M16/M17/M18 have candidate, decision, durable store, and scoped retrieval layers.
- `Inference`: A pure Markdown exporter gives humans a review surface before Guga adds file mutation or prompt injection.

## Guga Landing

Add `renderCuratedMemoryMarkdown(items, options)` to `@guga-agent/plugin-memory-candidates`.

The renderer should group active safe items by scope/kind, include source event IDs, and keep output bounded.
