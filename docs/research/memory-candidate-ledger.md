# Memory Candidate Ledger

Date: 2026-05-28

## 一句话结论

M15 should not implement long-term memory storage. It should implement a governed candidate layer: structured proposed memories, provenance, safety verdicts, deterministic rendering, and capability discovery.

## Evidence

- `Fact`: `docs/research/context-packs/memory-systems.md` says Guga should split ingest, extract, store, search, rerank, and context-render instead of hiding them in one opaque memory class.
- `Fact`: M5 research in `.trellis/tasks/archive/2026-05/05-27-m5-session-store-replay-plugins/research/hermes-memory-learning-boundaries.md` recommends memory-ready substrate while deferring `MEMORY.md`, retrieval, vector/graph memory, and automatic writes.
- `Fact`: Hermes scans memory content for prompt-injection-like patterns and invisible Unicode before injecting memory into prompts.
- `Inference`: The first implementation should treat memory as a projection candidate over immutable events, not as an automatically mutated source of truth.

## Guga Landing

Create `@guga-agent/plugin-memory-candidates`.

The package owns:

- candidate and source reference types;
- candidate validation;
- safety scanning for injection phrases and invisible controls;
- ledger creation and deterministic ordering;
- rendering of accepted safe candidates into a bounded context block;
- a plugin operation descriptor for host discovery.

## Adopt

- Provenance-first memory candidates.
- Safety verdict before rendering.
- Context rendering as a separate function from extraction/storage.

## Adapt

- Graphiti episode/entity separation becomes source reference vs candidate content for now.
- Zep turn-time injection is deferred; M15 only provides a renderer that a future context policy can call.

## Skip

- External memory provider runtime.
- Automatic writes.
- Search and embeddings.
- User/profile file mutation.
