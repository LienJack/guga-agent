# @guga-agent/cli

Command-line entry point for running Guga through the shared host protocol.

## Quick Install

From the repository root:

```bash
pnpm install:cli
source ~/.zshrc
guga
```

`pnpm install:cli` builds the CLI and installs an idempotent shell alias:

```bash
alias guga='node /path/to/guga-agent/packages/cli/dist/index.js'
```

The path is generated on each developer machine from that local clone, so the committed installer does not hard-code one person's home directory.

By default the alias is installed into the current user's shell startup file:

- zsh: `~/.zshrc`
- bash: `~/.bashrc`
- other shells: `~/.profile`

Use a custom shell rc file when needed:

```bash
pnpm install:cli -- --shell-rc ~/.bashrc
```

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

Guga uses a local user workspace called Guga Home. By default it is `~/.guga`; set `GUGA_HOME` to move the whole workspace:

```text
~/.guga/
  config.toml
  sessions/projects/<project-key>/
    events/
    sessions/
  artifacts/projects/<project-key>/
  memory/
  cache/
  logs/
  profiles/
```

Session, artifact, and memory files can contain sensitive local state. Do not commit or casually sync them. Project `.guga/config.toml` is only a config layer; default runtime state stays in Guga Home unless you explicitly configure otherwise.

Config is TOML-first and layered:

1. built-in defaults
2. user `~/.guga/config.toml` or legacy `~/.guga/config.json`
3. project `.guga/config.toml` or legacy `.guga/config.json`
4. explicit `GUGA_CONFIG`
5. environment variables
6. CLI flags

Environment variables such as `GUGA_MODEL` and `GUGA_PROVIDER` override file values. Built-in defaults apply when neither files nor environment provide a value.

Example `~/.guga/config.toml`:

```toml
defaultModel = "gpt"
defaultProfile = "code"
providerId = "ai-sdk"
providerMode = "openai"

[[models]]
id = "gpt"
label = "GPT"
modelId = "gpt-5"
apiKeyEnv = "OPENAI_API_KEY"

[[models]]
id = "local"
modelId = "llama3.1"
providerMode = "openai-compatible"
baseURL = "http://localhost:11434/v1"
apiKeyEnv = "LOCAL_OPENAI_API_KEY"
```

Use `apiKeyEnv` for secrets. Raw `apiKey` values are supported for compatibility but display paths redact secrets and docs avoid recommending them.

Common environment overrides:

```bash
GUGA_PROVIDER=ai-sdk
GUGA_PROVIDER_MODE=openai-compatible
GUGA_MODEL=gpt-5
GUGA_BASE_URL=https://api.openai.com/v1
GUGA_API_KEY=...
```

Legacy JSON config remains supported when the TOML file for that layer does not exist. A project config can override one model alias while preserving unrelated user aliases.

Session history is append-only local history under `sessions/`; compaction and branch summaries are session facts, not long-term memory. The `memory/` directory is for governed memory projections and is not auto-populated from every transcript or injected into prompts by default.

## Models And Profiles

Use model aliases in config for repeatable CLI and workbench selection. The default profile is `code`; use `--profile deep-research` or `--profile review` when a task should run through another first-party profile.

```bash
guga run "review this change" --profile review --model gpt-5
guga -p "Say exactly: ok" --mock
```

## Permissions

The `code` profile uses the shared permission kernel for filesystem, shell, git, skills, and MCP-backed tools. Interactive workbench clients answer permission prompts through the Host UI protocol; headless clients fail closed for ask-required actions unless a policy explicitly allows them.
