# M18 Scoped Memory Retrieval

## Goal

Add deterministic lexical retrieval over active governed memory items with explicit scope filters.

## Requirements

- Require a scope for every retrieval call.
- Search active safe items only.
- Support optional kind and tag filters.
- Score by query token overlap, kind/tag matches, importance, and confidence.
- Return match reasons for audit/debug.
- Render a bounded retrieval result block.

## Out of Scope

- No embeddings, vector DB, graph search, provider calls, automatic writes, or prompt injection.
