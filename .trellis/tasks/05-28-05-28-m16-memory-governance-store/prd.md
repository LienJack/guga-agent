# M16 Memory Governance Store

## Goal

Extend the memory candidate slice with explicit governance decisions and active memory item projection, without adding automatic memory writes, retrieval, persistence, or core runtime changes.

## Background

M15 created `@guga-agent/plugin-memory-candidates`, which validates candidate memories, scans prompt-safety risks, builds deterministic ledgers, and renders only accepted safe candidates. The next missing boundary is governance: hosts need to record why a candidate was accepted, rejected, or superseded, and then list active memory items by scope without trusting ad hoc status fields alone.

## Requirements

- Add serializable decision records for accept, reject, and supersede.
- Derive active memory items only from candidates that are valid, accepted by decision, and safe after fresh content scanning.
- Preserve both candidate source references and decision provenance.
- Support deterministic ordering and scope-bounded listing.
- Register a plugin operation descriptor named `memory.governance`.
- Keep the implementation inside the existing memory candidates plugin package.

## Acceptance Criteria

- Focused package tests cover decision projection and safety gates.
- Full repo test/typecheck/build pass.
- Research, plan, solution, and blog artifacts are written.
- Trellis task validates and archives cleanly.

## Out of Scope

- No automatic extraction or writes from agent turns.
- No file/SQLite/remote persistence backend.
- No vector/graph retrieval.
- No model-request context injection.
- No changes to `packages/core`.
