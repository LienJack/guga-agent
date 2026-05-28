# M15 Memory Candidate Ledger Plan

## Objective

Implement a first-party package that models proposed memories as safe, replayable projection candidates without adding long-term memory writes or retrieval to the runtime.

## Scope Boundaries

- No automatic extraction.
- No persistent memory store.
- No prompt injection into core.
- No provider/vector/graph dependencies.

## Implementation Units

### U1 — Package Scaffold

Files:

- Create `packages/plugin-memory-candidates/package.json`
- Create `packages/plugin-memory-candidates/tsconfig.json`
- Create `packages/plugin-memory-candidates/src/index.ts`

Verification:

- Package is picked up by pnpm workspace.

### U2 — Candidate Ledger And Safety

Files:

- Create `packages/plugin-memory-candidates/src/memory-candidates.ts`
- Create `packages/plugin-memory-candidates/src/memory-candidates.test.ts`

Behavior:

- Define candidate/source/safety/ledger types.
- Validate candidate content, scope, kind, source refs, confidence, status, and safety verdict.
- Detect prompt injection phrases and invisible control characters.
- Sort candidates deterministically by scope, status, importance, createdAt, id.

Verification:

- Tests cover validation, safety scanning, deterministic ordering, rendering filters, and render budget.

### U3 — Plugin Descriptor

Files:

- Create `packages/plugin-memory-candidates/src/memory-candidates-plugin.ts`
- Add runtime descriptor tests.

Behavior:

- `createMemoryCandidatesPlugin()` registers an operation descriptor named `memory.candidates`.

Verification:

- Runtime capability descriptors include operation owner/trust/scope.

### U4 — Docs And Article

Files:

- Create `docs/solutions/architecture-patterns/memory-candidate-ledger.md`
- Create `blog/build-agent-from-zero-m15-memory-candidate-ledger.md`
- Update `docs/research/index.md`

Verification:

- Docs explain candidate memory vs curated memory.

## Test Commands

- `pnpm --filter @guga-agent/plugin-memory-candidates test`
- `pnpm --filter @guga-agent/plugin-memory-candidates typecheck`
- `pnpm --filter @guga-agent/plugin-memory-candidates build`
- `pnpm -r --workspace-concurrency=1 test`
- `pnpm -r typecheck`
- `pnpm -r build`
