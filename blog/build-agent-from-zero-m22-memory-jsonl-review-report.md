# Build Agent From Zero: M22 Memory JSONL Review Report

M22 connects memory review to durable storage.

This is the point where the audit report stops being only an in-memory projection and becomes something a host can ask from the local memory log.

## The Manual Gap

Before M22, the pieces existed:

- JSONL could store candidates and decisions;
- governance could project active memory;
- review could summarize health and queues.

But a host had to wire those pieces together by hand.

That is small friction, but friction matters in architecture. If every host rebuilds the same path, each one gets to invent its own edge cases.

## The New Read Path

M22 adds `JsonlMemoryStore.readReviewReport()`.

It performs one read-only sequence:

1. read durable records;
2. build the governed ledger;
3. create the review report;
4. return JSONL diagnostics next to the report.

No writes.
No repair.
No decisions.
No Markdown file edits.

## Partial Tail vs Corruption

The JSONL store already treats a partial final line as recoverable.

M22 preserves that. A report can still be built from complete records, but the caller sees the partial-tail diagnostic and append remains unavailable until repair.

Corrupt middle records are different.

Those fail closed. A report over half-trusted memory is worse than no report.

## Why This Matters

Memory is becoming a stack:

- durable records;
- governed projection;
- review report;
- capability discovery;
- future host surfaces.

M22 keeps the stack composable. Each layer owns its part, and the store now gives hosts the most common audit read without smuggling in mutation.
