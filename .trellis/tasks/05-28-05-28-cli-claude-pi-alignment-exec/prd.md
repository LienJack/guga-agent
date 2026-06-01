# Execute CLI Claude Pi Alignment Plan

## Goal

Validate and complete `docs/plans/2026-05-28-036-feat-cli-claude-pi-alignment-plan.md` in an isolated execution worktree.

## Scope

- P0 realtime detached runs, live SSE, and CLI streaming.
- P1 run input queue, abort, permission response, and interactive control behavior.
- P2 generic interaction request/response.
- P3 session resume/fork/tree resources.
- P4 stdio JSONL adapter compatibility.

## Verification

- Targeted package tests for host protocol, runtime, local server, SDK, CLI, and stdio adapter.
- Typecheck/build for packages touched by any fixes.
- Review implementation against plan acceptance criteria and avoid reimplementing already-shipped work.
