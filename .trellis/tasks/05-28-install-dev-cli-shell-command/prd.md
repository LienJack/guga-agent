# Install Dev CLI Shell Command

## Goal

Make the local development install expose a reliable `guga` command in common shells while preserving the repo's `pnpm run dev:cli` execution path.

## Requirements

- `pnpm install:cli` installs a `guga` command usable from zsh/bash after sourcing the shell rc or opening a new terminal.
- The installed command runs from the repository root and delegates to the development CLI path instead of hardcoding a one-off Node invocation in shell rc.
- The install remains idempotent and supports `--shell-rc <path>` for tests or custom shells.
- The shell rc integration should avoid alias expansion pitfalls in non-interactive shells by installing a shell function.
- Do not leak configured API keys in output.

## Pi Reference

- Fact: Pi's normal install path uses package-manager installation and a `pi` command available from the shell.
- Fact: Pi documents shell behavior separately for the shell used by tool execution; it does not rely on ordinary shell aliases as its main product command installation path.
- Inference: For Guga's local dev workflow, a generated shell function that delegates to the repo script is the smallest analogue before publishing a package/global binary.

## Acceptance

- `pnpm install:cli -- --shell-rc <temp>` writes a managed shell function block.
- Sourcing that rc in zsh/bash makes `guga --list-models` resolve to the local dev CLI.
- Existing `pnpm dev:cli --list-models` still works.
