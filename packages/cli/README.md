# @guga-agent/cli

Command-line entry point for running Guga through the shared host protocol.

## Quick Install

From the repository root:

```bash
pnpm dev:cli --install
source ~/.zshrc
guga
```

`pnpm dev:cli --install` builds the CLI and installs an idempotent shell function:

```bash
guga() {
  (cd /path/to/guga-agent && pnpm run dev:cli "$@")
}
```

The function delegates to the repository's `pnpm run dev:cli` path, so local development uses the same CLI entry as manual runs. The path is generated on each developer machine from that local clone, so the committed installer does not hard-code one person's home directory.

By default the shell function is installed into common POSIX shell startup files:

- zsh: `~/.zshrc`
- bash: `~/.bashrc`
- sh/profile-style shells: `~/.profile`

Use a custom shell rc file when needed:

```bash
pnpm dev:cli --install --shell-rc ~/.bashrc
```

Use only the current shell's startup file when you do not want the common-shell install:

```bash
pnpm dev:cli --install --current-shell
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

`/status`、`/tools`、`/mcp`、`/skills`、`/permissions` 和 `/tasks` 会投影为结构化 workbench panel。它们展示 host capability/status/task facts 的 source、status、namespace、owner、reason、trust、availability 和 unavailable/degraded 原因。`/compact` 当前是保留命令；它会明确显示未实现，而不是伪装成已支持。

Permission 和 interaction prompt 会临时接管输入焦点。Permission overlay 会显示 tool、run/call scope、reason/input 摘要和保守 risk label；未知审批输入会 fail closed，不会调用 allow/deny API。它们不会清掉你正在输入的 prompt 或 running input 草稿；完成响应后，原草稿会回到输入框。

Continuity panel 会显示 context compaction、stream disconnect/reload、session resume/fork/new 的恢复状态。它只展示 typed host events/resources 投影出的保留事实，例如 compact summary 的 objective/next steps、reload 后的 replay seq、当前 task ledger 或 pending permission。

Transcript 会区分 user、assistant、reasoning/status、tool、permission、interaction、queue、abort、error、artifact、context 和 retry。Reasoning/status 只来自 host 明确暴露的 `message.reasoning_delta`，不会展示隐藏 chain-of-thought。

Autonomous code-task state is also projected from typed host events. The workbench tracks active task phase, ledger progress, current ledger item, changed files, verification status, blockers and completion evidence through `task.*` and `verification.*` events instead of inferring progress from assistant text. `/tasks` is the long-task inspection surface and shows ledger progress when the host provides it. SDK/local-server/stdio adapters expose the same platform/task/verification/compaction facts so non-TUI clients do not need to scrape terminal output.

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
