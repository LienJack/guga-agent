# M36 Memory JSONL Capability Namespace

## Problem

Memory JSONL operation descriptors now expose a complete name vocabulary, but their capability descriptors do not include a namespace. Hosts can filter by `ownerPluginId`, but namespace is the existing cross-plugin grouping field used by skills and MCP. Adding it makes descriptor discovery more uniform.

## Goals

- Add a stable `memory-jsonl` namespace to all memory JSONL operation descriptors.
- Export the namespace constant from `@guga-agent/plugin-memory-jsonl`.
- Keep operation names, trust, source, and ownership unchanged.
- Update tests to assert namespace metadata for storage and read-only projection descriptors.

## Non-Goals

- Do not change capability ids.
- Do not change plugin id defaults.
- Do not add execution handlers or host commands.

## Acceptance Criteria

- Runtime capability discovery includes `namespace: "memory-jsonl"` on every memory JSONL operation descriptor.
- The package exports a namespace constant for host code.
- Focused package gates pass:
  - `pnpm --filter @guga-agent/plugin-memory-jsonl test`
  - `pnpm --filter @guga-agent/plugin-memory-jsonl typecheck`
  - `pnpm --filter @guga-agent/plugin-memory-jsonl build`
- Full workspace gates pass before archive:
  - `pnpm -r --workspace-concurrency=1 test`
  - `pnpm -r typecheck`
  - `pnpm -r build`
