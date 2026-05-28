# Memory JSONL Review Health

M25 connects durable JSONL memory records to the memory review health signal.

## Problem

M24 added `createMemoryReviewHealth()`, but JSONL store callers still had to read a review report and compute health manually.

## Decision

Add `JsonlMemoryStore.readReviewHealth()`.

The method:

- calls `readReviewReport()`;
- computes health with `createMemoryReviewHealth()`;
- returns the typed report, health summary, and JSONL diagnostics;
- fails closed on corrupt JSONL.

## Why This Shape

- **One durable read path.** Hosts can ask local memory for status without reassembling the report pipeline.
- **Shared semantics.** Health rules stay in `@guga-agent/plugin-memory-candidates`.
- **Storage diagnostics stay visible.** Partial-tail and corrupt-record behavior remain JSONL-owned.
- **No mutation.** Health is an audit signal, not a repair or governance operation.

## Verification

Focused tests cover healthy durable memory, partial-tail needs-review health, and corrupt JSONL failure.
