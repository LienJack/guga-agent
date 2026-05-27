# M17 Memory JSONL Store

## Goal

Persist memory candidates and governance decisions in an explicit append-only JSONL store, then reopen them into the existing governance ledger.

## Requirements

- Add `@guga-agent/plugin-memory-jsonl`.
- Validate records before append.
- Preserve append-only JSONL records with newline termination.
- Detect partial-tail and corrupt-middle JSONL.
- Reuse `createMemoryGovernanceLedger()` for active item projection.
- Register a discoverable `memory.jsonl` operation descriptor.

## Out of Scope

- No automatic memory writes.
- No retrieval, embeddings, graph projection, or context injection.
- No core runtime changes.
