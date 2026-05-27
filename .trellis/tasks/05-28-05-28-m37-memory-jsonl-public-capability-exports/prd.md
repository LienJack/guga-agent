# M37 Memory JSONL Public Capability Exports

## Problem

M35 and M36 exported memory JSONL capability constants from the package entrypoint, but tests still import those constants from the internal plugin module. That proves the constants exist, not that host-facing package exports are usable.

## Goals

- Add a package entrypoint test importing capability constants from `./index`.
- Verify public exports preserve exact operation names and namespace.
- Keep runtime behavior unchanged.

## Non-Goals

- Do not add new capability names.
- Do not change descriptor registration metadata.
- Do not change JSONL store behavior.

## Acceptance Criteria

- Tests fail if `packages/plugin-memory-jsonl/src/index.ts` stops exporting the capability constants.
- Focused package gates pass:
  - `pnpm --filter @guga-agent/plugin-memory-jsonl test`
  - `pnpm --filter @guga-agent/plugin-memory-jsonl typecheck`
  - `pnpm --filter @guga-agent/plugin-memory-jsonl build`
- Full workspace gates pass before archive:
  - `pnpm -r --workspace-concurrency=1 test`
  - `pnpm -r typecheck`
  - `pnpm -r build`
