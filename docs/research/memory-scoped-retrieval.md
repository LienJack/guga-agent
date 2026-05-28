# Scoped Memory Retrieval

Date: 2026-05-28

## 一句话结论

M18 should add scope-required lexical retrieval over active governed memory items. This is the smallest retrieval layer that respects the memory safety work from M15-M17 without introducing embeddings, automatic injection, or cross-scope leakage.

## Evidence

- `Fact`: `docs/research/agent-memo.md` says any memory search must be scope-filtered and separated from context injection.
- `Fact`: M16 active memory items already include scope, kind, tags, confidence, importance, provenance, and safety status.
- `Fact`: M17 persists candidates and decisions, then reopens through the same governance ledger.
- `Inference`: A deterministic lexical retriever is enough to test API shape and scope safety before adding vector stores.

## Guga Landing

Add retrieval helpers to `@guga-agent/plugin-memory-candidates`:

- `searchGovernedMemoryItems(items, query, options)`
- `renderMemoryRetrievalBlock(results, options)`
- `MemoryRetrievalResult`

The function must require `scope`, ignore inactive/unsafe items by default, and return why each result matched.

## Skip

- Embeddings and reranking.
- Automatic prompt injection.
- Persistence changes.
