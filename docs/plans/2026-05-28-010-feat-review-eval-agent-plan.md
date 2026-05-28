---
title: feat: Add review eval agent profile
type: feat
status: planned
date: 2026-05-28
origin: docs/brainstorms/2026-05-28-m13-review-eval-agent-requirements.md
---

# feat: Add review eval agent profile

## Summary

Ship a review/eval profile package with finding ledger helpers, report writer, focused tests, CLI profile selection, docs, solution note, blog, and Trellis archive.

## Units

### U1 Profile Package

- Add `@guga-agent/profile-review-agent`.
- Export profile metadata and system prompt.

### U2 Findings Ledger

- Add finding severity, confidence, category, and evidence types.
- Add ledger creation, grouping, and validation helpers.

### U3 Report Writer

- Render findings first.
- Include open questions and summary after findings.
- Add diagnostics for empty or weak reports.

### U4 CLI Profile

- Add CLI dependency.
- Accept `--profile review`.
- Add mock CLI test.

### U5 Docs / Blog / Finish

- Add solution note and module article.
- Run focused and full gates.
- Archive task.

## Verification

- `pnpm --filter @guga-agent/profile-review-agent test`
- `pnpm --filter @guga-agent/profile-review-agent typecheck`
- `pnpm --filter @guga-agent/profile-review-agent build`
- `pnpm --filter @guga-agent/cli test`
- `pnpm -r --workspace-concurrency=1 test`
- `pnpm -r typecheck`
- `pnpm -r build`
