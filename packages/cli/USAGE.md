# @guga-agent/cli Usage

## Purpose

`@guga-agent/cli` provides the end-user `guga` command. It supports the interactive Ink workbench, headless runs, provider login/auth/config, model listing, and local host-backed execution.

This package is a CLI entry point, not a reusable library API. Importing the package root executes the CLI top-level entry.

## Install For Local Development

From the repository root:

```sh
pnpm dev:cli --install
source ~/.zshrc
guga
```

The package `bin` maps `guga` to `./dist/index.js`.

## Import

Do not import this package as a library. The package root is an executable entry point and runs the CLI top-level code.

```sh
guga --help
```

## Main APIs

- CLI binary: `guga`.
- Internal executable entry: `src/index.ts`.
- Internal command dispatcher: `runCli(argv, io)` in `commands/run.ts`, used by tests and the binary.
- Workbench internals: Ink UI under `ink-workbench/`, terminal compatibility helpers under `tui/`, host creation under `host-factory.ts`, and event rendering under `render/`.

## Commands

- `guga`: start the interactive workbench when stdin/stdout are TTYs.
- `guga chat` or `guga interactive`: explicit interactive aliases.
- `guga run "<prompt>"`: run one headless prompt.
- `guga -p "<prompt>"`: short one-shot alias for headless mode.
- `guga init`: initialize user or project config.
- `guga login <provider>`: configure provider credentials or supported OAuth flows.
- `guga logout <provider>`: remove local Guga-owned provider credentials.
- `guga auth status [provider]`: inspect redacted provider auth state.
- `guga --list-models`: print model aliases and defaults.

Common run flags include `--mock`, `--debug-events`, `--ops`, `--profile`, `--provider`, and `--model`.

## Common Usage

```sh
guga
guga run "summarize the repo" --mock --debug-events
guga -p "summarize the repo"
guga login openai --api-key-env OPENAI_API_KEY
guga auth status
guga --list-models
```

## Parameters

- `guga` / `guga chat` / `guga interactive`: accepts optional `--mock`, `--profile <code|deep-research|review>`, `--provider <id>`, and `--model <id>` flags. Interactive mode requires TTY stdin and stdout.
- `guga run "<prompt>"` and `guga -p "<prompt>"`: `<prompt>` is required. `--provider <id>` and `--model <id>` constrain model selection. `--profile <code|deep-research|review>` selects the runtime profile. `--mock` uses the deterministic local mock provider. `--debug-events` prints structured event rendering, and `--ops` prints operational status after the run.
- `guga init`: `--user` and `--project` choose config scope, defaulting to user scope. `--force` overwrites an existing config. `--provider <id>`, `--provider-mode <openai|anthropic|openai-compatible|gateway>`, `--model <id>`, `--base-url <url>`, and `--api-key-env <VAR>` are optional config fields.
- `guga login <provider>`: `<provider>` is required. `--api-key <key>` or `--api-key-env <VAR>` is required for non-OAuth providers. `--mode` / `--provider-mode`, `--model <id>`, and `--static` are optional.
- `guga logout <provider>`: `<provider>` is required.
- `guga auth status [provider]`: `provider` is optional; omit it to show all known provider auth states.
- `guga --list-models`: takes no additional parameters.
- `runCli(argv, io)`: internal test-facing entry point. `argv` is required and excludes the executable path. `io.stdout` and `io.stderr` are required writers; `stdin`, `env`, and `oauthLoginRunner` are optional.

## Internal Entry Points

- `src/index.ts`: executable entry that calls `runCli(process.argv.slice(2), io)`.
- `runCli(argv, io)`: command parser and dispatcher used by tests and the executable.
- Host construction lives in `host-factory.ts`; rendering lives under `render/`; Ink workbench code lives under `ink-workbench/`.

## Notes

- Bare `guga` in a TTY opens the Ink workbench. Non-TTY headless commands stream host events and close the local host after the run.
- Codex OAuth support is present as a pending/injected-runner path and may be disabled unless the host supplies the runner.
- Runtime state defaults to Guga Home, normally `~/.guga`, unless config or `GUGA_HOME` overrides it.

## Related Packages

- `@guga-agent/host-sdk`, `@guga-agent/host-runtime`, and `@guga-agent/host-protocol` provide the host bridge.
- Profile and plugin packages provide code, research, review, storage, ops, memory, eval, and web-search capabilities.
