# docs: update roadmap completion status

## Goal

Update `docs/roadmap.md` so it reflects the current completed roadmap state instead of stale next-task language.

## What I Already Know

- Trellis archive shows all current tasks completed.
- Packages exist for M0-M12 roadmap work and later memory/capability follow-ups.
- Blog, research, and solution documents cover the roadmap modules.
- `pnpm -r typecheck`, `pnpm -r test`, and `pnpm build` passed before this documentation update.

## Requirements

- Add an explicit completion snapshot to `docs/roadmap.md`.
- Mark M0-M12 roadmap modules as completed in headings or nearby text.
- Replace stale "下一批工程任务" wording with an accurate completed-work summary.
- Mention M13-M37 follow-up modules as completed extensions without expanding the roadmap scope.

## Acceptance Criteria

- [ ] A reader can tell the roadmap is complete as of 2026-05-28.
- [ ] The stale M6/M7/M9/M10/M12 next-task list is no longer phrased as future work.
- [ ] Existing architectural rationale remains intact.
- [ ] Documentation-only change does not require code tests beyond a git diff/status check.

## Out of Scope

- No code changes.
- No new roadmap modules.
- No changes to plan frontmatter outside `docs/roadmap.md`.
