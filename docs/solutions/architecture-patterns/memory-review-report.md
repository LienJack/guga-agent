# Memory Review Report

M20 adds a pure audit report over governed memory.

## Problem

The memory stack can now propose, govern, persist, retrieve, and export memory. Operators still need a compact health view before trusting future import, file-write, or prompt-injection workflows.

## Decision

Add `createMemoryReviewReport()` and `renderMemoryReviewReport()` to `@guga-agent/plugin-memory-candidates`.

The report:

- counts candidates, decisions, active items, superseded items, rejected candidates, undecided candidates, unsafe candidates, and diagnostics;
- lists active and superseded items deterministically;
- surfaces rejected candidate ids;
- surfaces undecided and unsafe candidate queues;
- renders bounded Markdown for human review.

## Why This Shape

- **Ledger-first.** The report reads the governed ledger, so it inherits the explicit decision model from M16.
- **Audit before action.** Review is separate from import/export mutation and separate from prompt context injection.
- **Unsafe stays visible.** Unsafe candidates are reported as audit records, not hidden or rendered as usable memory.
- **Machine and human surfaces.** The typed report can power tests or UI; Markdown gives immediate operator readability.

## Verification

Focused tests cover summary counts, queue ordering, superseded state, unsafe candidates, diagnostics, Markdown bounds, and empty states.
