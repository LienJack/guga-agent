# M10 Deep Research Agent Plan

## Goal

Ship a first-party deep-research profile with source policy, evidence ledger, and report pipeline helpers.

## Implementation Units

### U1 — Profile Package

Files:

- `packages/profile-deep-research-agent/package.json`
- `packages/profile-deep-research-agent/src/profile.ts`
- `packages/profile-deep-research-agent/src/index.ts`
- `packages/profile-deep-research-agent/src/profile-deep-research-agent.test.ts`

Work:

- Define profile metadata and prompt helper.

### U2 — Source Policy

Files:

- `packages/profile-deep-research-agent/src/source-policy.ts`
- tests

Work:

- Encode 7-layer funnel order.
- Classify source paths into layers.

### U3 — Evidence Ledger

Files:

- `packages/profile-deep-research-agent/src/evidence-ledger.ts`
- tests

Work:

- Define evidence item DTO.
- Add sorting/grouping/quality helpers.

### U4 — Report Writer

Files:

- `packages/profile-deep-research-agent/src/report-writer.ts`
- tests

Work:

- Render Markdown report with required sections.
- Add quality check for missing evidence.

### U5 — CLI Profile

Files:

- `packages/cli/src/commands/run.ts`
- `packages/cli/src/run.test.ts`
- package manifests / lockfile

Work:

- Support `--profile deep-research`.

### U6 — Docs, Blog, Finish

Files:

- `docs/solutions/architecture-patterns/deep-research-agent-profile.md`
- `blog/build-agent-from-zero-deep-research-agent.md`

Acceptance:

- `pnpm -r --workspace-concurrency=1 test`
- `pnpm -r typecheck`
- `pnpm -r build`
