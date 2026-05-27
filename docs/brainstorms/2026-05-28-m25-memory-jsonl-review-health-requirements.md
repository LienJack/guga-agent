# M25 Memory JSONL Review Health Requirements

Date: 2026-05-28

## Problem

M24 computes health from a memory review report, but durable JSONL users still have to read the report and compute health manually.

## Requirements

- Add one read-only convenience method on `JsonlMemoryStore`.
- Return report, health, and JSONL diagnostics together.
- Preserve partial-tail and corrupt-record semantics.
- Do not add a CLI, UI, repair, or write path.

## Non-Goals

- No automatic candidate decisions.
- No JSONL mutation.
- No Markdown file writes.
