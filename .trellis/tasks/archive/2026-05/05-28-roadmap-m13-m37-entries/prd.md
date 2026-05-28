# docs: add M13-M37 roadmap entries

## Goal

Expand `docs/roadmap.md` with explicit M13-M37 completed module entries instead of only mentioning those modules in one summary bullet.

## What I Already Know

- M13-M37 tasks are archived as completed.
- Existing research, solution, plan, and blog files exist for the modules.
- The change is documentation-only and should preserve the existing roadmap style.

## Requirements

- Add M13-M37 entries to `docs/roadmap.md`.
- Keep each entry concise: goal, delivered surface, and completion evidence.
- Do not change code or create new roadmap scope.
- Keep the existing M0-M12 sections intact.

## Acceptance Criteria

- [ ] Each module from M13 through M37 appears explicitly.
- [ ] Entries are marked completed.
- [ ] The roadmap remains readable and does not duplicate full plan documents.
- [ ] `git diff --check` passes.

## Out of Scope

- No implementation changes.
- No updates to individual plan frontmatter.
- No new research.
