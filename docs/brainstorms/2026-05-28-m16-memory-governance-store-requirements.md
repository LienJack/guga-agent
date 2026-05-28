# M16 Memory Governance Store Requirements

Date: 2026-05-28

## Problem

M15 gave Guga a safe memory candidate ledger, but accepted/rejected decisions still have no first-class model. A host can render accepted safe candidates, yet there is no governed transition from "candidate" to "active memory item", no immutable decision trail, and no scope-bounded listing surface.

## MVP

- Add a memory governance layer on top of `@guga-agent/plugin-memory-candidates`.
- Represent review decisions as explicit records: accept, reject, or supersede.
- Produce active memory items only from accepted safe candidates.
- Preserve candidate provenance and decision provenance.
- Keep all helpers deterministic and in-memory for the first slice.
- Register a discoverable operation descriptor for host/runtime capability discovery.

## Non-Goals

- No automatic memory writes.
- No vector search, graph projection, embeddings, or reranking.
- No prompt injection policy beyond reusing and hardening M15 safety gates.
- No filesystem, SQLite, or remote storage backend.
- No core runtime changes.

## Acceptance Criteria

- Tests cover accept, reject, supersede, malformed decisions, scope filtering, and unsafe/mislabelled candidate denial.
- Rendering/listing only exposes active memories derived from valid accepted safe candidates.
- Public exports are serializable TypeScript data contracts and pure helpers.
- The plugin registers `memory.governance` with a first-party memory trust scope.
- Focused package test/typecheck/build and full repo gates pass.
