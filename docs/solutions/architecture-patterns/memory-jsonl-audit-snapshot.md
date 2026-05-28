# Memory JSONL Audit Snapshot

M29 bundles durable memory audit projections behind one JSONL read.

## Problem

Hosts that need ledger, report, health, and audit Markdown had to call multiple JSONL store helpers, each of which could reopen and parse the same durable file.

## Decision

Add `JsonlMemoryStore.readAuditSnapshot(options)`.

The method:

- calls `readGovernanceLedger()` once;
- builds `createMemoryReviewReport()` from the ledger;
- computes `createMemoryReviewHealth()` from the report;
- renders `renderMemoryReviewReport()` from the report;
- returns ledger, report, health, Markdown, and JSONL diagnostics;
- fails closed on corrupt JSONL.

## Why This Shape

- **One source read.** Hosts can build audit views without coordinating several store calls.
- **Shared semantics.** Report, health, and Markdown rules stay in `@guga-agent/plugin-memory-candidates`.
- **Storage diagnostics stay visible.** Partial-tail diagnostics travel with the snapshot.
- **No mutation.** The snapshot is a read-only audit bundle, not a repair, retrieval, or injection mechanism.

## Verification

Focused tests cover healthy snapshots, empty snapshots, partial-tail needs-review snapshots, custom Markdown options, and corrupt JSONL failure.
