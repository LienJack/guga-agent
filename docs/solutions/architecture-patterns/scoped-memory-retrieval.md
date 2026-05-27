# Scoped Memory Retrieval

M18 adds deterministic retrieval over governed memory without adding embeddings or automatic prompt injection.

## Problem

After M17, Guga can persist governed memory records, but hosts still need to ask for relevant active memories. Doing that with a global unscoped search would risk cross-user or cross-project leakage.

## Decision

Add retrieval helpers to `@guga-agent/plugin-memory-candidates`:

- `searchGovernedMemoryItems()`
- `renderMemoryRetrievalBlock()`

Every retrieval call requires an explicit `scope`. Results are active and safe by default.

## Why This Shape

- **Scope is mandatory.** Retrieval cannot accidentally search every memory item.
- **Safety remains upstream.** Results must be active safe governed memory items.
- **Lexical first.** Deterministic token overlap validates API shape before embeddings.
- **Reasons are returned.** Each result explains matched terms, kind matches, tag matches, and filters.
- **Rendering is separate.** Search returns structured results; hosts decide whether to render or inject.

## Current Limits

- No embeddings.
- No graph traversal.
- No automatic model-request injection.
- No persistence changes.

## Verification

Focused tests cover scope-required diagnostics, empty query diagnostics, scope isolation, active-safe filtering, kind/tag filters, superseded opt-in, deterministic scoring, and bounded rendering.
