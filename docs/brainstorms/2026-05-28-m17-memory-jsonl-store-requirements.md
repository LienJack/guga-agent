# M17 Memory JSONL Store Requirements

Date: 2026-05-28

## Problem

M15 and M16 define memory candidates and governance decisions as pure data, but hosts still need a local durable adapter that can persist those records without inventing a second memory model.

## MVP

- Create `@guga-agent/plugin-memory-jsonl`.
- Store memory candidates and decisions as append-only JSONL records.
- Reopen records and project them through `createMemoryGovernanceLedger()`.
- Validate candidates and decisions before append.
- Return diagnostics for corrupt or partial JSONL instead of silently ignoring it.
- Keep the store local-first and explicit; no automatic extraction, retrieval, or prompt injection.

## Non-Goals

- No `MEMORY.md` / `USER.md` projection.
- No SQLite, vector DB, graph DB, or remote backend.
- No auto-write hooks from agent turns.
- No changes to `packages/core`.

## Acceptance Criteria

- Tests cover append/reopen, invalid candidate/decision rejection, governance projection, partial-tail diagnostics, corrupt middle-line failure, and package dependency boundaries.
- Focused package test/typecheck/build pass.
- Full repo test/typecheck/build pass.
- Solution note and blog article are written.
