---
title: feat: Add learning writing eval flywheel
type: feat
status: planned
date: 2026-05-28
origin: docs/brainstorms/2026-05-28-m12-learning-eval-flywheel-requirements.md
---

# feat: Add learning writing eval flywheel

## Summary

Ship M12 as a learning infrastructure slice: a module artifact index, a hermetic eval fixture registry, missing module writing, and a solution note that defines the completion contract.

## Units

### U1 Trellis / Research / Plan

- Create M12 task and PRD.
- Add requirements, research, and plan docs.
- Register context files in Trellis.

### U2 Eval Fixture Registry

- Add `packages/eval-fixtures`.
- Export module fixture metadata, manifest helpers, and category filters.
- Reuse `@guga-agent/plugin-eval-runner` fixture shape.
- Test category coverage, uniqueness, metadata diagnostics, and suite execution.

### U3 Research Index / Learning Contract

- Update `docs/research/index.md` with M9, M10, and M12 rows.
- Add solution note for module completion and eval fixture ownership.
- Add eval fixture docs.

### U4 Blog Backlog

- Write `blog/build-agent-from-zero-m5-session-store-replay.md`.
- Write `blog/build-agent-from-zero-m12-learning-eval-flywheel.md`.

### U5 Verification / Finish

- Run package tests and full repo gates.
- Validate Trellis context.
- Archive task and commit.

## Risks

- M12 can sprawl into a documentation rewrite. Keep edits scoped to index, fixture registry, M5 article, M12 article, and checklist.
- Eval fixtures can become fake confidence. Keep them hermetic smoke/regression fixtures and label them as seeds, not benchmarks.
- Blog writing can drift into changelog. Keep the module story: problem, boundary, minimal design, next pressure.

## Verification

- `pnpm --filter @guga-agent/eval-fixtures test`
- `pnpm --filter @guga-agent/eval-fixtures typecheck`
- `pnpm --filter @guga-agent/eval-fixtures build`
- `pnpm -r --workspace-concurrency=1 test`
- `pnpm -r typecheck`
- `pnpm -r build`
