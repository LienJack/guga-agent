# Database Guidelines

> Database patterns and conventions for this project.

---

## Overview

Guga Agent currently has no SQL database, ORM, migration system, or schema-managed persistence layer. Durable runtime data is represented through TypeScript store contracts and first-party local plugins, such as JSONL session and memory stores. Do not introduce a database dependency from `packages/core`.

---

## Query Patterns

- Prefer explicit store interfaces over ad hoc persistence calls.
- Keep durable reads/writes behind plugin packages or host-provided stores.
- Return serializable records with stable ids and timestamps when data may be replayed, audited, or projected.
- Avoid global singleton stores; the host/runtime should inject store instances.

Examples:

- `packages/core/src/contracts/session-store.ts`: durable session-store contract boundary.
- `packages/plugin-session-jsonl/src/jsonl-session-store.ts`: append-only local session persistence.
- `packages/plugin-memory-jsonl/src/jsonl-memory-store.ts`: JSONL-backed memory projections and review helpers.

---

## Migrations

There are no database migrations today.

For local file-backed stores, evolve formats with explicit version fields or tolerant readers. Tests should cover reading older records before writing new format assumptions. Schema-breaking changes need a module plan and migration notes before implementation.

---

## Naming Conventions

- Store contract files use `*-store.ts`.
- File-backed plugin packages should name implementations by backend, e.g. `jsonl-session-store.ts` or `jsonl-memory-store.ts`.
- Persisted event or record names should match runtime contract vocabulary: `session`, `run`, `turn`, `message`, `tool`, `permission`, `artifact`, `memory`.
- Capability names should be stable dotted strings when exposed to hosts, e.g. `memory.jsonl.review_report`.

---

## Common Mistakes

- Do not put persistence-specific code in `packages/core` unless it is a neutral contract.
- Do not treat summaries as durable facts; replay/audit must come from event/store records.
- Do not write store data without enough source metadata to explain later projections.
- Do not assume local JSONL is the final production backend; keep host-facing contracts backend-neutral.
