# M15 Memory Candidate Ledger Requirements

Date: 2026-05-28

## Goal

Ship a safe first memory slice for Guga: represent proposed long-term memories as governed candidates with provenance, risk diagnostics, and deterministic rendering. Do not automatically write curated memory or inject retrieval into prompts.

## Requirements

- Create a first-party package for memory candidate ledger helpers.
- Represent memory candidates with scope, kind, content, confidence, source references, status, and safety verdict.
- Validate candidates without trusting LLM-generated fields.
- Detect prompt-injection-like content and invisible control characters before memory can be rendered.
- Render only accepted safe candidates into a bounded context block.
- Keep original session events as the source of truth; candidate memory is a projection, not history.
- Register a plugin operation descriptor so host surfaces can discover the capability.
- Add hermetic tests and documentation.

## Non-Goals

- No automatic memory extraction.
- No `MEMORY.md` / `USER.md` writes.
- No vector store, graph store, embeddings, reranking, or search.
- No turn-time memory injection into the runtime.
- No external memory providers.
- No self-improvement loop.

## Acceptance

- Focused package test/typecheck/build pass.
- Full monorepo gates pass.
- M15 has research, plan, solution, and article.
