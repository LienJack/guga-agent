# M24 Memory Review Health

## Goal

Add a small, deterministic health summary over `MemoryReviewReport` so hosts can distinguish healthy memory, pending review, and blocked memory states.

## Requirements

- Add `createMemoryReviewHealth(report)` to `@guga-agent/plugin-memory-candidates`.
- Add `renderMemoryReviewHealthBlock(health)` for bounded Markdown display.
- Classify health as `healthy`, `needs_review`, or `blocked`.
- Treat unsafe candidates and governance diagnostics as blocked.
- Treat undecided candidates as needing review.
- Keep rejected and superseded items informational, not unhealthy.

## Out of Scope

- No automatic decisions.
- No mutation of candidates, decisions, JSONL, or Markdown files.
- No provider, tool, prompt, or host protocol changes.

## Acceptance

- Behavior tests cover healthy, needs-review, blocked, reason ordering, and Markdown rendering.
- Focused package test, typecheck, and build pass.
- Full workspace test, typecheck, and build pass.
- Research, plan, solution note, blog article, and Trellis archive exist.
