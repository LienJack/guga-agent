# Memory Governance Store

Date: 2026-05-28

## 一句话结论

M16 should turn memory candidates into governed, reviewable active memory items. It should not add retrieval or automatic writes yet. The main architectural value is a small decision ledger: every accepted, rejected, or superseded memory item can explain the candidate, reviewer, reason, timestamp, and source events behind it.

## Evidence

- `Fact`: `docs/research/memory-candidate-ledger.md` intentionally stopped at candidate validation, safety scanning, deterministic ordering, and safe bounded rendering.
- `Fact`: `docs/research/agent-memo.md` recommends splitting memory into `ingest -> extract -> decide -> persist -> retrieve -> render`, and says long-term writes need policy gates.
- `Fact`: `docs/research/context-packs/memory-systems.md` separates explicit curated memory from retrieval/injection, and warns against hiding policy inside a single memory facade.
- `Inference`: The next useful slice is `decide + store projection`: a pure governance ledger that can be persisted later without changing the decision semantics.

## Guga Landing

Extend `@guga-agent/plugin-memory-candidates` rather than creating a second package. The package already owns candidate validation and safety scanning; governance should reuse those gates so accepted memory cannot be created from an unsafe or malformed candidate.

The module should expose:

- `MemoryDecision` records for `accept`, `reject`, and `supersede`.
- `MemoryItem` records derived from accepted safe candidates.
- `createMemoryGovernanceLedger(candidates, decisions)` for deterministic projection.
- `listMemoryItemsByScope(ledger, filter)` for scope-bounded host listing.
- `renderGovernedMemoryBlock(items, options)` for bounded context/debug display.
- `createMemoryGovernancePlugin()` registering `memory.governance`.

## Adopt

- Provenance-first decision records.
- Explicit active/rejected/superseded state.
- Defense-in-depth safety validation during projection and rendering.
- Scope-bounded listing as the default access pattern.

## Adapt

- Hermes-style curated memory becomes a pure in-memory item projection for now.
- mem0-style scope filters become deterministic TypeScript filters, not vector queries.
- Graphiti-style source separation remains candidate/source refs rather than graph nodes.

## Skip

- Persistent `MEMORY.md` / `USER.md` files.
- External memory providers.
- Embedding search and graph projection.
- Automatic lifecycle injection into model requests.
