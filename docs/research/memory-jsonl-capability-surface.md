# Memory JSONL Capability Surface

Date: 2026-05-28

## 一句话结论

M28 should make durable JSONL memory projections discoverable as separate read-only operation descriptors while preserving the broad `memory.jsonl` descriptor for compatibility.

## Evidence

- `Fact`: M21 exposes `memory.review` as a read-only first-party capability descriptor.
- `Fact`: M22-M27 added durable JSONL read projections for review report, review Markdown, health, retrieval, and curated Markdown.
- `Fact`: `createMemoryJsonlPlugin()` currently registers only the broad `memory.jsonl` operation with read/write memory trust.
- `Inference`: Hosts and workbenches need descriptor-level names to distinguish durable storage authority from read-only projection surfaces.

## Guga Landing

Add operation descriptors in `createMemoryJsonlPlugin()`:

- `memory.jsonl` as the existing broad read/write storage capability;
- `memory.jsonl.review` as a durable review projection;
- `memory.jsonl.retrieval` as durable scope-required retrieval;
- `memory.jsonl.curated_markdown` as durable active-safe Markdown export.

## Guardrails

- Keep descriptors serializable and plugin-owned.
- Projection descriptors should have memory read-only trust.
- Do not add execution handlers in this module.
- Do not remove or rename `memory.jsonl`.
