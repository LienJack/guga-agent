# M15 Memory Candidate Ledger PRD

## Goal

Implement a governed memory-candidate layer that can represent, validate, sort, and safely render proposed long-term memories without writing curated memory automatically.

## Context

- Memory research says Guga should keep durable events as source of truth and make memory a governed projection.
- M5 explicitly deferred `MEMORY.md`, retrieval, vector/graph memory, and automatic writes.
- M15 is the smallest useful next slice: candidates and safety, not storage/retrieval.

## Requirements

1. Create `@guga-agent/plugin-memory-candidates`.
2. Define candidate/source/safety/ledger contracts.
3. Validate candidates defensively.
4. Scan content for prompt-injection-like phrases and invisible control characters.
5. Render only accepted safe candidates into a bounded context block.
6. Register a first-party operation descriptor.
7. Add solution docs and M15 article.

## Non-Goals

- No automatic extraction or writing.
- No memory files.
- No vector/graph store.
- No retrieval or prompt injection.
- No provider calls.

## Acceptance Criteria

- Focused package tests, typecheck, and build pass.
- Full monorepo gates pass.
- Research, solution, article, and Trellis archive exist.
