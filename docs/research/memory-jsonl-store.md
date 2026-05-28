# Memory JSONL Store

Date: 2026-05-28

## 一句话结论

M17 should add a local append-only JSONL adapter for memory candidates and governance decisions. The durable store should persist the same data contracts from M15/M16, not introduce a new memory abstraction.

## Evidence

- `Fact`: M5 proved JSONL is a good local substrate for durable session events and replay.
- `Fact`: `docs/research/agent-memo.md` recommends keeping original event/provenance records separate from curated memory projection.
- `Fact`: `docs/research/memory-governance-store.md` keeps governance as a pure projection so storage can be added later without changing semantics.
- `Inference`: The next safest step is a small append-only store that can reopen records and feed the same governance ledger.

## Guga Landing

Create `@guga-agent/plugin-memory-jsonl` with:

- `JsonlMemoryStore`
- `appendCandidate()`
- `appendDecision()`
- `readRecords()`
- `readGovernanceLedger()`
- JSONL diagnostics for partial tails and corrupt middle records.

## Skip

- Automatic writes from runtime hooks.
- Retrieval/search.
- Prompt injection.
- User-editable memory files.
