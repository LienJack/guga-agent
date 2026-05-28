# Memory Review Health

M24 adds a small health signal on top of memory review reports.

## Problem

The review report exposes detailed counts and queues, but hosts still had to infer whether memory was healthy, pending human review, or blocked by unsafe/invalid state.

## Decision

Add:

- `createMemoryReviewHealth(report)`
- `renderMemoryReviewHealthBlock(health)`

The health status is:

- `blocked` when unsafe candidates or governance diagnostics exist;
- `needs_review` when undecided candidates exist without blocked conditions;
- `healthy` when neither condition exists.

## Why This Shape

- **Small vocabulary.** Hosts and CLI surfaces can gate display without inventing severity rules.
- **Reason codes.** Stable reasons explain why the status was chosen.
- **Audit only.** Health is a signal, not a decision engine.
- **No storage coupling.** JSONL and host code can consume the same summary without owning review semantics.

## Verification

Focused tests cover healthy, needs-review, blocked, reason ordering, counts, and compact Markdown rendering.
