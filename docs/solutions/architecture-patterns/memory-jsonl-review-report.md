# Memory JSONL Review Report

M22 connects durable memory JSONL records to the memory review report.

## Problem

M20 could produce a review report from a governed ledger, but callers using the JSONL store still had to manually reopen records, project governance, and build the report.

## Decision

Add `JsonlMemoryStore.readReviewReport()`.

The method:

- reads JSONL records through the existing `readRecords()` path;
- projects candidates and decisions through `createMemoryGovernanceLedger()`;
- builds a report with `createMemoryReviewReport()`;
- returns JSONL diagnostics beside the report;
- fails closed when JSONL is corrupt.

## Why This Shape

- **Storage stays storage.** JSONL owns durable read diagnostics, not review semantics.
- **Report semantics stay shared.** The review report still comes from `@guga-agent/plugin-memory-candidates`.
- **Partial tails remain recoverable.** Read-only review can still inspect complete lines and surface the partial-tail warning.
- **Corruption still fails closed.** Invalid middle records do not produce a partial audit report.

## Verification

Focused tests cover successful durable report reads, partial-tail diagnostics with undecided queues, corrupt JSONL failure, and unchanged append refusal on partial tails.
