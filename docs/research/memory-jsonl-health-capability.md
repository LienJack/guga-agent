# Memory JSONL Health Capability

Date: 2026-05-28

## 一句话结论

M31 should expose `memory.jsonl.health` as a read-only operation descriptor so hosts can discover durable JSONL health projection support without knowing store internals.

## Evidence

- `Fact`: M28 registers read-only JSONL projection descriptors for review, retrieval, and curated Markdown.
- `Fact`: M30 adds `readReviewHealthMarkdown()`, which turns durable JSONL review health into a compact Markdown block while preserving diagnostics.
- `Fact`: Capability descriptor guidelines require plugin-owned descriptors to keep serializable source and trust metadata.
- `Inference`: Health belongs beside the other JSONL read projections because it is a host-facing audit/status view, not a write authority.

## Guga Landing

Add `memory.jsonl.health` to `createMemoryJsonlPlugin()` as a read-only first-party operation descriptor owned by the memory JSONL plugin.

## Guardrails

- Keep `memory.jsonl` read/write and backward-compatible.
- Do not add an execution path; discovery is enough for this module.
- Keep descriptor trust metadata read-only so host UI cannot confuse health rendering with memory mutation authority.
