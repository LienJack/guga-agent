# Build Agent From Zero: M25 Memory JSONL Review Health

M25 lets durable memory answer a simple question:

Is this memory healthy?

## From Report To Status

M24 introduced the health summary for review reports.

M25 wires that into the JSONL store.

That means a host can now ask the local durable memory file for:

- the typed review report;
- the health status;
- the JSONL diagnostics.

All in one read-only call.

## What The Store Does

`JsonlMemoryStore.readReviewHealth()` composes existing pieces:

1. read the review report from durable records;
2. compute health with the canonical health rules;
3. return `{ report, health, diagnostics }`.

If the JSONL file is corrupt, it fails closed.

If the file has a partial tail, it can still report over complete records and include the partial-tail diagnostic.

## Why This Matters

Host surfaces need cheap first-glance signals.

A full report is good for inspection. Markdown is good for display. Health is good for gating.

The important part is that the health signal is not a new decision system. It does not accept, reject, repair, or inject anything.

It only names the state of durable memory using shared rules.
