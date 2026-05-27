# M16 Memory Governance Store Plan

Date: 2026-05-28

## Scope

Build a pure governance layer in `@guga-agent/plugin-memory-candidates` that converts valid, safe candidates plus explicit decisions into active memory items. Keep it deterministic, serializable, and plugin-discoverable.

## Implementation Units

### U1: Planning Artifacts

- Create Trellis PRD and curated context.
- Write requirements and research notes.
- Commit planning artifacts.

### U2: Governance Types And Projection

- Add `memory-governance.ts`.
- Define decision, reviewer, item, ledger, diagnostic, and filter types.
- Implement validation for decisions.
- Implement accepted/rejected/superseded projection.
- Enforce candidate validation and content safety before producing active items.

### U3: Rendering And Plugin Descriptor

- Add bounded active-memory rendering helper.
- Add scope listing helper.
- Register `memory.governance` operation descriptor.
- Export public helpers and types.

### U4: Tests And Review

- Cover accept, reject, supersede, invalid decisions, unsafe candidate denial, and scope filtering.
- Run focused package gates.
- Run full repo `test/typecheck/build`.
- Review for correctness, tests, maintainability, and project standards.

### U5: Compound And Finish

- Write solution note under `docs/solutions/architecture-patterns/`.
- Write `blog/build-agent-from-zero-m16-memory-governance-store.md`.
- Update `docs/research/index.md`.
- Validate and archive the Trellis task.

## Risks

- Treating decisions as storage too early. Mitigation: expose pure ledgers only.
- Letting unsafe candidates become active via direct object construction. Mitigation: revalidate candidates and rescan content during projection.
- Scope leakage. Mitigation: list helpers require explicit scope filters for host-facing reads.

## Validation

- `pnpm --filter @guga-agent/plugin-memory-candidates test`
- `pnpm --filter @guga-agent/plugin-memory-candidates typecheck`
- `pnpm --filter @guga-agent/plugin-memory-candidates build`
- `pnpm -r --workspace-concurrency=1 test && pnpm -r typecheck && pnpm -r build`
