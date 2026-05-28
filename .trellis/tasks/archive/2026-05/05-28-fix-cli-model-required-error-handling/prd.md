# Fix CLI model-required error handling

## Goal

When `guga` or `guga run <prompt>` is started without a configured model, the CLI should print the existing friendly `MODEL_REQUIRED` message and exit with code 2 instead of letting Node print a stack trace.

## What I Already Know

- Running the built CLI in a TTY without `GUGA_MODEL`, `.guga/config.json`, or `--mock` reproduces a `CliHostFactoryError: No model configured...` stack trace.
- `packages/cli/src/commands/run.ts` wraps command dispatch in `try/catch`, but returns async branch calls without awaiting them.
- `CliHostFactoryError` is already handled by `handleCliError`; the rejected promise simply escapes the current `try/catch`.
- Mock mode and `--list-models` already work, so model config resolution itself is not the bug.

## Requirements

- Preserve the existing `MODEL_REQUIRED` message and exit code behavior.
- Handle both headless `run` and interactive workbench startup failures through the same CLI error path.
- Add regression tests that fail before the fix and pass after it.

## Acceptance Criteria

- [ ] `runCli(["run", "hello"], io)` resolves to exit code 2 with the friendly no-model stderr message.
- [ ] `runCli([], ttyIo)` resolves to exit code 2 with the friendly no-model stderr message.
- [ ] The CLI package test suite passes.

## Out of Scope

- Changing model configuration semantics.
- Adding default real model configuration.
- Changing the mock provider behavior.

## Technical Notes

- Relevant source: `packages/cli/src/commands/run.ts`.
- Relevant tests: `packages/cli/src/run.test.ts`.
- Spec context: `.trellis/spec/backend/error-handling.md`, `.trellis/spec/backend/quality-guidelines.md`.
