# M20 Memory Review Report

## Goal

Add a deterministic memory review report that summarizes governed memory state for human audit before import, export, or prompt injection.

## Requirements

- Accept an existing `MemoryGovernanceLedger` and produce a typed report object.
- Summarize counts for candidates, decisions, active items, superseded items, rejected candidates, undecided candidates, unsafe candidates, and diagnostics.
- Surface review queues for undecided candidates, unsafe candidates, active items, superseded items, and rejected candidate ids.
- Render the report as bounded Markdown for humans.
- Keep the implementation pure and deterministic: no filesystem writes, no JSONL mutation, no provider/tool/runtime dependency.

## Out of Scope

- No automatic accept/reject decisions.
- No editing `MEMORY.md`.
- No retrieval-ranking changes.
- No prompt-context injection.

## Acceptance

- Behavior tests cover count summaries, deterministic ordering, unsafe/undecided queues, and Markdown bounds.
- Focused package test, typecheck, and build pass.
- Full workspace test, typecheck, and build pass.
- Research, plan, solution note, blog article, and Trellis archive exist.
