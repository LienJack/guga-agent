# M9 Code Agent PRD

## Summary

Build the first Guga code-agent profile as a first-party package that composes existing runtime, tools, permissions, context, host, and operations capabilities.

## Goals

- Ship a reusable code-agent profile package.
- Add default permission policy for coding work.
- Add repo context and test discovery helpers.
- Expose the profile through CLI with `--profile code`.
- Keep core unchanged unless a missing stable contract is proven necessary.

## Non-Goals

- No IDE/LSP integration in this slice.
- No autonomous multi-agent swarm.
- No new browser tooling.
- No direct file mutation outside existing tool runtime.
- No real provider or network dependency in tests.

## Requirements

1. `@guga-agent/profile-code-agent` exports:
   - profile metadata;
   - default permission policy;
   - plugin bundle factory;
   - repo context helpers;
   - test discovery helpers.
2. CLI accepts `--profile code` and starts a runtime with the code-agent bundle.
3. Code profile works with `--mock`.
4. Test discovery returns deterministic command candidates for package/workspace scripts.
5. Permission defaults are tested:
   - read effects allow;
   - write/shell execute ask;
   - destructive shell command deny.
6. The package does not import host/CLI packages; host/CLI may import the profile.

## Acceptance

- Focused tests for profile permissions, context helpers, test discovery, and CLI profile selection.
- `pnpm --filter @guga-agent/profile-code-agent test`
- `pnpm --filter @guga-agent/profile-code-agent typecheck`
- `pnpm --filter @guga-agent/profile-code-agent build`
- M9 final gates: `pnpm -r --workspace-concurrency=1 test`, `pnpm -r typecheck`, `pnpm -r build`

## Risks

- Profile can accidentally become a second runtime if it owns execution flow.
- Permission defaults can be too permissive if shell patterns are vague.
- Test discovery can overfit Node workspaces; keep helpers explainable and extensible.

## Traceability

- Roadmap: M9 Code Agent.
- Research: `docs/research/code-agent-architecture.md`.
- Plan: `docs/plans/2026-05-28-006-feat-code-agent-plan.md`.
