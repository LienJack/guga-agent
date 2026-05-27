# M28 Memory JSONL Capability Surface

## Goal

Expose JSONL memory store read projections as discoverable first-party operation capabilities.

## Requirements

- Keep the existing `memory.jsonl` operation descriptor for compatibility.
- Add read-only operation descriptors for durable review, retrieval, and curated Markdown projections.
- Use the existing plugin-owned capability registration pattern.
- Mark projection descriptors as first-party memory read-only.
- Add behavior tests proving descriptor names, source, owner, and trust scopes.

## Out of Scope

- No new store methods.
- No execution handlers or CLI commands.
- No permission policy changes.
- No file writes or prompt injection.

## Acceptance

- `createMemoryJsonlPlugin()` registers the broad JSONL operation plus read-only projection descriptors.
- Focused package test, typecheck, and build pass.
- Full workspace test, typecheck, and build pass.
- Research, plan, solution note, blog article, and Trellis archive exist.
