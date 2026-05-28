# M18 Scoped Memory Retrieval Requirements

Date: 2026-05-28

## Problem

Guga can now persist governed memory, but hosts still need a safe way to ask "which active memories are relevant to this query?" without introducing embeddings or automatic prompt injection.

## MVP

- Add lexical retrieval over `GovernedMemoryItem[]`.
- Require an explicit scope filter for every search.
- Search active, safe items only by default.
- Score matches deterministically using token overlap, kind/tag boosts, and importance/confidence.
- Return bounded result objects with reasons.
- Render retrieval results into a bounded block for host/debug use.

## Non-Goals

- No vector embeddings.
- No graph traversal.
- No automatic model-request injection.
- No provider calls.
- No persistence changes.

## Acceptance Criteria

- Tests cover required scope, lexical ranking, kind/tag filters, safe-active-only behavior, empty query diagnostics, and bounded rendering.
- Focused package and full repo gates pass.
- Solution note and article are written.
