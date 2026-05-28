# @guga-agent/cli

Command-line entry point for running Guga through the shared host protocol.

## Commands

```bash
guga
guga run "summarize the repo"
guga -p "summarize the repo"
guga --list-models
guga run "hello" --mock --debug-events
```

- `guga` starts the interactive terminal workbench for a project.
- `guga run "<prompt>"` runs one headless turn and prints the streamed result.
- `guga -p "<prompt>"` is the short one-shot alias for the headless path.
- `guga --list-models` prints configured model aliases and provider defaults.

## Configuration

Guga reads one config file from the first matching source, then applies environment overrides:

1. `GUGA_CONFIG`
2. project `.guga/config.json`
3. user `~/.guga/config.json`

Environment variables such as `GUGA_MODEL` and `GUGA_PROVIDER` override file values. Built-in defaults apply when neither files nor environment provide a value.

Common environment overrides:

```bash
GUGA_PROVIDER=ai-sdk
GUGA_PROVIDER_MODE=openai-compatible
GUGA_MODEL=gpt-5
GUGA_BASE_URL=https://api.openai.com/v1
GUGA_API_KEY=...
```

## Models And Profiles

Use model aliases in config for repeatable CLI and workbench selection. The default profile is `code`; use `--profile deep-research` or `--profile review` when a task should run through another first-party profile.

```bash
guga run "review this change" --profile review --model gpt-5
guga -p "Say exactly: ok" --mock
```

## Permissions

The `code` profile uses the shared permission kernel for filesystem, shell, git, skills, and MCP-backed tools. Interactive workbench clients answer permission prompts through the Host UI protocol; headless clients fail closed for ask-required actions unless a policy explicitly allows them.
