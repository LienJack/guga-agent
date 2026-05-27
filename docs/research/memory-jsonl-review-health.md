# Memory JSONL Review Health

Date: 2026-05-28

## 一句话结论

M25 should add a durable read path for memory health by composing `JsonlMemoryStore.readReviewReport()` with `createMemoryReviewHealth()`.

## Evidence

- `Fact`: M22 reads a typed review report from JSONL records.
- `Fact`: M24 computes health status and reason codes from a typed review report.
- `Inference`: Hosts should not duplicate the report-to-health composition for common local memory stores.

## Guga Landing

Add `JsonlMemoryStore.readReviewHealth()`.

The method should:

- call `readReviewReport()`,
- fail closed on corrupt JSONL,
- compute health using the canonical M24 rules,
- return `{ report, health, diagnostics }` for successful reads.

## Guardrails

- Do not mutate JSONL records.
- Keep health semantics in `@guga-agent/plugin-memory-candidates`.
- Keep durable diagnostics in `@guga-agent/plugin-memory-jsonl`.
