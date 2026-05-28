# Build Agent From Zero: M29 Memory JSONL Audit Snapshot

M29 makes durable memory easier to inspect in one breath.

## The Problem With Many Small Reads

By this point, JSONL memory had several useful audit helpers:

- read the governed ledger;
- read the review report;
- read review health;
- render review Markdown.

Those helpers are good individually. But a host workbench often wants all of them at once.

If the host calls each helper separately, it may reopen and parse the same JSONL file several times just to paint one audit panel.

## The Snapshot

M29 adds:

`JsonlMemoryStore.readAuditSnapshot()`

It reads the governed ledger once, then derives the audit bundle:

- ledger;
- report;
- health;
- Markdown;
- JSONL diagnostics.

That makes the common host path simple without moving semantics into the storage package.

## Semantics Stay Shared

The snapshot does not invent new health rules.

It still uses:

- `createMemoryReviewReport()`;
- `createMemoryReviewHealth()`;
- `renderMemoryReviewReport()`.

The JSONL store owns durable read behavior and diagnostics. The memory candidates package owns memory audit semantics.

That split keeps the stack boring in the best way.

## Partial Logs Are Still Honest

If the JSONL file has a partial final line, the snapshot is built from complete records and carries the partial-tail diagnostic.

If the middle of the file is corrupt, the snapshot fails closed.

An audit view should never hide the condition of the log it is auditing.

## Still Read-Only

The snapshot does not retrieve memory into the prompt.

It does not write Markdown files.

It does not accept or reject candidates.

It only packages the state of durable memory so a host can display it clearly. That is the right kind of convenience: less duplicate plumbing, same explicit authority boundaries.
