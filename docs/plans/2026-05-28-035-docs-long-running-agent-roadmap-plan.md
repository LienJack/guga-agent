# Long Running Agent Roadmap Plan

Date: 2026-05-28

## Scope

Close the roadmap design task that turns Guga Agent's long-running build into an executable checklist.

## Units

- U1: Validate the existing Trellis PRD and curated task context.
- U2: Confirm `任务.md` contains the reviewable module checklist.
- U3: Confirm `docs/roadmap.md` captures the long-term runtime, agent, host, and learning phases.
- U4: Add solution and article artifacts so the roadmap work compounds like other modules.
- U5: Run documentation-oriented validation, preserve unrelated dirty work, archive the task, and commit only owned files.

## Verification

- `python3 ./.trellis/scripts/task.py validate 05-27-long-running-agent-roadmap`
- `git diff --check -- 任务.md docs/roadmap.md docs/plans/2026-05-28-035-docs-long-running-agent-roadmap-plan.md docs/solutions/architecture-patterns/long-running-agent-roadmap.md blog/build-agent-from-zero-long-running-roadmap.md`
- `pnpm -r --workspace-concurrency=1 test`
- `pnpm -r typecheck`
- `pnpm -r build`
