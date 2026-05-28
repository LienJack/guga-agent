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
guga login openai --api-key-env OPENAI_API_KEY
guga login copilot
guga login codex
guga auth status
guga logout codex
guga --list-models
guga run "hello" --mock --debug-events
```

- `guga` starts the interactive terminal workbench for a project.
- `guga run "<prompt>"` runs one headless turn and prints the streamed result.
- `guga -p "<prompt>"` is the short one-shot alias for the headless path.
- `guga login <provider>` configures a named provider using an env var, a Guga-managed local credential reference, or OAuth for built-in Copilot/Codex flows.
- `guga auth status [provider]` prints redacted provider auth state.
- `guga logout <provider>` removes the local Guga-owned credential for that provider.
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
fallbackModels = ["sonnet"]
defaultProfile = "code"

[[providers]]
id = "openai"
mode = "openai"
apiKeyEnv = "OPENAI_API_KEY"

[[providers]]
id = "anthropic"
mode = "anthropic"
apiKeyEnv = "ANTHROPIC_API_KEY"

[[models]]
id = "gpt"
label = "GPT"
providerId = "openai"
modelId = "gpt-5"

[[models]]
id = "sonnet"
providerId = "anthropic"
modelId = "claude-sonnet"

[[models]]
id = "local"
modelId = "llama3.1"
providerId = "local"
providerMode = "openai-compatible"
baseURL = "http://localhost:11434/v1"
apiKeyEnv = "LOCAL_OPENAI_API_KEY"
```

Use `apiKeyEnv` for secrets when possible. `guga login openai --api-key <key>` writes a local credential reference under Guga Home and stores only the reference in config. Raw `apiKey` values are supported only for compatibility and diagnostics mark them as risky.

OAuth-backed built-ins are visible in the same model registry:

```bash
guga login copilot
guga login codex
guga auth status codex
guga --list-models
guga logout codex
```

`copilot` and `codex` credentials are stored under Guga Home `credentials/providers/` and are owned by Guga, not by GitHub CLI, Copilot CLI, Codex CLI, or any external tool. Status output, model lists, runtime metadata, and diagnostics show only redacted account/status information; access tokens, refresh tokens, raw OAuth payloads, and authorization headers must not be printed.

Copilot OAuth uses GitHub device flow and requires a Guga-owned GitHub OAuth app client id:

```bash
GUGA_COPILOT_CLIENT_ID=... guga login copilot
```

Codex OAuth is wired through the same runner/storage/model surfaces, but the default CLI runner remains disabled until OpenAI confirms a stable third-party ChatGPT/Codex OAuth endpoint contract. API-key OpenAI models remain available through the normal `openai` provider.

Workbench exposes the same surfaces:

```text
/login
/login copilot
/logout codex
/auth status
/models
/model sonnet
```

`/models` and `--list-models` share the same availability view. Missing auth, invalid config, unhealthy providers, and unsupported capabilities are shown as unavailable reasons. Health is unknown by default and does not make network calls unless a future explicit check injects one.

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

Fallback is explicit: `fallbackModels` names backup aliases for the primary route. Auxiliary models use a model `purpose` field such as `summarizer`; the router, not the provider bridge, owns retry/fallback selection.

Anthropic/Claude remains API-key or Workload Identity Federation for this milestone. DeepSeek and Kimi/Moonshot remain API-key or OpenAI-compatible provider configuration paths; their OAuth flows are not part of this milestone.

## Models And Profiles

Use model aliases in config for repeatable CLI and workbench selection. The default profile is `code`; use `--profile deep-research` or `--profile review` when a task should run through another first-party profile.

```bash
guga run "review this change" --profile review --model gpt-5
guga -p "Say exactly: ok" --mock
```

## Permissions

The `code` profile uses the shared permission kernel for filesystem, shell, git, skills, and MCP-backed tools. Interactive workbench clients answer permission prompts through the Host UI protocol; headless clients fail closed for ask-required actions unless a policy explicitly allows them.
