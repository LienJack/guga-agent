# Memory JSONL Review Report

Date: 2026-05-28

## 一句话结论

M22 should add a read-only convenience path from durable memory JSONL records to the M20 review report.

## Evidence

- `Fact`: M17 `JsonlMemoryStore` already reads candidates and decisions, then projects them through `createMemoryGovernanceLedger()`.
- `Fact`: M20 `createMemoryReviewReport()` already turns a governance ledger into typed audit state.
- `Inference`: Durable memory review should be a store read helper, not a new source of governance semantics.

## Guga Landing

Add `JsonlMemoryStore.readReviewReport()`.

The method should:

- call `readGovernanceLedger()`,
- fail closed on corrupt JSONL,
- create the M20 review report from the governed ledger,
- return JSONL diagnostics alongside the report.

## Guardrails

- Keep storage concerns in `@guga-agent/plugin-memory-jsonl`.
- Keep report semantics in `@guga-agent/plugin-memory-candidates`.
- Do not add mutation or repair behavior.
