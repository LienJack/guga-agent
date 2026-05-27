# Memory JSONL Retrieval

M26 connects durable JSONL memory records to scope-required memory retrieval.

## Problem

M18 added deterministic retrieval over governed memory items, but callers using the JSONL store still had to rebuild the ledger before searching.

## Decision

Add `JsonlMemoryStore.readRetrieval(query, options)`.

The method:

- calls `readGovernanceLedger()`;
- searches `ledger.items` with `searchGovernedMemoryItems()`;
- returns typed retrieval response plus JSONL diagnostics;
- fails closed on corrupt JSONL.

## Why This Shape

- **Retrieval semantics stay shared.** Scope checks, scoring, filters, and safety rules remain in `@guga-agent/plugin-memory-candidates`.
- **Durability stays visible.** Partial-tail diagnostics are preserved alongside retrieval results.
- **No prompt injection.** The store returns results; a later context policy must decide whether to inject them.
- **No mutation.** Retrieval does not repair JSONL or change memory governance state.

## Verification

Focused tests cover successful retrieval, scope filtering, query diagnostics, partial-tail reads, and corrupt JSONL failure.
