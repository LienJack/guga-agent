# M35 Memory JSONL Capability Name Constants

## Problem

The memory JSONL plugin now registers several operation descriptors. Their names are duplicated between plugin registration, tests, and future host callers. As the capability surface grows, scattered string literals make accidental drift more likely.

## Goals

- Export stable memory JSONL operation name constants from `@guga-agent/plugin-memory-jsonl`.
- Use those constants inside plugin registration.
- Keep existing descriptor names unchanged.
- Add or update tests so exported constants remain aligned with runtime registration.

## Non-Goals

- Do not change descriptor trust, source, ownership, or registration behavior.
- Do not add execution handlers.
- Do not change JSONL store APIs.

## Acceptance Criteria

- The package exports constants for:
  - broad read/write storage capability;
  - broad review compatibility capability;
  - read-only projection capabilities.
- Runtime descriptor tests prove every exported name is registered with the expected trust shape.
- Focused package gates pass:
  - `pnpm --filter @guga-agent/plugin-memory-jsonl test`
  - `pnpm --filter @guga-agent/plugin-memory-jsonl typecheck`
  - `pnpm --filter @guga-agent/plugin-memory-jsonl build`
- Full workspace gates pass before archive:
  - `pnpm -r --workspace-concurrency=1 test`
  - `pnpm -r typecheck`
  - `pnpm -r build`

## Notes

This is a maintenance module that stabilizes the increasingly explicit descriptor taxonomy from M31-M34.
