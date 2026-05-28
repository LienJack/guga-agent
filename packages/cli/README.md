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
guga --list-models
guga run "hello" --mock --debug-events
```

- `guga` starts the interactive terminal workbench for a project.
- `guga run "<prompt>"` runs one headless turn and prints the streamed result.
- `guga -p "<prompt>"` is the short one-shot alias for the headless path.
- `guga login <provider>` configures a named provider using an env var or a Guga-managed local credential reference.
- `guga --list-models` prints configured model aliases and provider defaults.

## Interactive Workbench

TTY 模式下的裸 `guga` 会进入 Ink workbench；非 TTY 的 `guga run` 和 `guga -p` 保持 headless 输出，不加载 Ink/React。

Workbench 的底部输入框会保留可见光标和输入回显。提交后的 prompt 会进入 transcript；运行中输入会按当前模式发送为 `steer` 或 `follow_up`。如果 host stream 断开，输入会锁定，只有 `/reload` 会尝试从最后安全 `seq` 重放并续流。

常用 slash 命令：

```text
/model
/profile
/resume
/tools
/mcp
/skills
/permissions
/status
/compact
/reload
/abort
```

`/tools`、`/mcp`、`/skills` 和 `/permissions` 展示 host capability 的 source、status、namespace、owner、reason 和 trust 信息。`/compact` 当前是保留命令；它会明确显示未实现，而不是伪装成已支持。

Permission 和 interaction prompt 会临时接管输入焦点。它们不会清掉你正在输入的 prompt 或 running input 草稿；完成响应后，原草稿会回到输入框。

Transcript 会区分 user、assistant、reasoning/status、tool、permission、interaction、queue、abort、error、artifact、context 和 retry。Reasoning/status 只来自 host 明确暴露的 `message.reasoning_delta`，不会展示隐藏 chain-of-thought。

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

Workbench has provider-aware guidance:

```text
/login openai
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

OAuth flows, including Gemini OAuth, are intentionally not part of this API-key/env/local-credential MVP. The provider/auth schema keeps room for a future OAuth credential source without changing model selection semantics.

## Models And Profiles

Use model aliases in config for repeatable CLI and workbench selection. The default profile is `code`; use `--profile deep-research` or `--profile review` when a task should run through another first-party profile.

```bash
guga run "review this change" --profile review --model gpt-5
guga -p "Say exactly: ok" --mock
```

## Permissions

The `code` profile uses the shared permission kernel for filesystem, shell, git, skills, and MCP-backed tools. Interactive workbench clients answer permission prompts through the Host UI protocol; headless clients fail closed for ask-required actions unless a policy explicitly allows them.
