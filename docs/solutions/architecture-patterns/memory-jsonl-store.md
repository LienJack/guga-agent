# Memory JSONL Store

M17 adds a local durable adapter for memory candidates and governance decisions.

## Problem

M15 and M16 kept memory pure: candidates, decisions, and active item projection were all serializable data. That made the model safe, but it still left hosts without a simple local persistence option.

## Decision

Create `@guga-agent/plugin-memory-jsonl`.

The package exports:

- `JsonlMemoryStore`
- `appendCandidate()`
- `appendDecision()`
- `readRecords()`
- `readGovernanceLedger()`
- `createMemoryJsonlPlugin()`

## Why This Shape

- **Storage preserves existing contracts.** JSONL records contain M15 candidates and M16 decisions directly.
- **Append-only by default.** The store writes newline-terminated records and never rewrites history.
- **Projection stays separate.** Reading a governed ledger still calls `createMemoryGovernanceLedger()`.
- **Corruption is explicit.** Partial tails are recoverable diagnostics; corrupt middle records fail closed.
- **Core stays untouched.** Filesystem persistence lives in a plugin package.

## Current Limits

- No automatic writes from agent turns.
- No retrieval or search.
- No prompt injection.
- No user-editable memory markdown files.
- No remote backend.

## Verification

Focused tests cover append/reopen, invalid append rejection, governance projection, partial-tail handling, corrupt middle records, invalid persisted records, plugin descriptor registration, and dependency boundaries.
