# Migrate legacy built-in import paths

## Goal

Move first-party runtime consumers off legacy built-in compatibility packages and onto `@guga-agent/core/builtins`, so core built-in filesystem, git, shell, and AI SDK provider helpers are consumed from their canonical location.

## What I Already Know

- The built-in implementations already live under `packages/core/src/builtins/*`.
- The legacy `packages/provider-ai-sdk`, `packages/plugin-tools-filesystem`, `packages/plugin-tools-git`, and `packages/plugin-tools-shell` wrappers were removed after first-party callers migrated to `@guga-agent/core/builtins`.
- The AI SDK provider bridge now lives in `packages/core/src/provider-ai-sdk/` rather than under the tool-oriented `builtins/` directory.
- Current first-party runtime consumers still import some of those wrappers.

## Requirements

- Replace first-party imports of built-in filesystem, git, shell, and AI SDK provider helpers with `@guga-agent/core/builtins`.
- Remove no-longer-needed workspace dependencies on compatibility packages from first-party packages.
- Keep compatibility packages present and tested as deprecated aliases for external or downstream callers.
- Update docs that point users at old wrapper packages as the preferred path.

## Acceptance Criteria

- [x] `rg` finds no first-party runtime import of legacy built-in wrappers outside the wrapper packages' own tests/docs.
- [x] `pnpm typecheck` passes.
- [x] Relevant core tests pass.

## Verification

- `pnpm --filter @guga-agent/core typecheck`
- `pnpm --filter @guga-agent/core test`
- `pnpm --filter @guga-agent/core test`
- `pnpm --filter @guga-agent/profile-code-agent typecheck`
- `pnpm --filter @guga-agent/cli typecheck`
- `pnpm typecheck`

## Out Of Scope

- Deleting compatibility packages.
- Renaming published packages.
- Removing wrapper package test coverage.

## Technical Notes

- Relevant specs: `.trellis/spec/backend/quality-guidelines.md`, `.trellis/spec/backend/directory-structure.md`, `.trellis/spec/guides/code-reuse-thinking-guide.md`.
- Removed packages: `@guga-agent/provider-ai-sdk`, `@guga-agent/plugin-tools-filesystem`, `@guga-agent/plugin-tools-git`, `@guga-agent/plugin-tools-shell`.
