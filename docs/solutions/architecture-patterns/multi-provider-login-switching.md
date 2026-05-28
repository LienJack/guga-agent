# Multi Provider Login And Switching

## Decision

Guga treats provider auth, model availability, model selection, and provider transport as separate layers.

- CLI/host owns credential policy and redacted diagnostics.
- The model registry view merges config aliases, registered model metadata, auth state, health state, and capability fit.
- Host factory turns the resolved view into provider plugins and explicit router policy.
- Core router owns retry, fallback, purpose routing, and model events.
- Provider bridges consume resolved credential/config material and return normalized provider responses.

## Configuration Shape

Named providers live in Guga Home layered config:

```toml
defaultModel = "gpt"
fallbackModels = ["sonnet"]

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
providerId = "openai"
modelId = "gpt-5"

[[models]]
id = "sonnet"
providerId = "anthropic"
modelId = "claude-sonnet"
```

Legacy top-level `providerId`, `providerMode`, `modelId`, `apiKeyEnv`, `apiKey`, and `baseURL` still normalize into the same view.

## Auth Rules

Preferred sources:

- `apiKeyEnv` for environment-managed credentials.
- `credentialRef` for Guga-managed local files under Guga Home.
- static `apiKey` only for compatibility, with warning diagnostics.

Auth status is local and conservative: `configured`, `missing`, `invalid`, or `unknown`. A locally present key is not reported as valid unless an explicit health check proves it.

OAuth is future work. Gemini OAuth should add a host-owned auth source and credential refresh flow without changing bridge or router ownership.

## Runtime Rules

`/models`, `--list-models`, `/model`, and host factory consume the same resolved model view. Unavailable reasons include missing auth, invalid config, provider health, and unsupported capabilities.

Fallback is explicit. `fallbackModels` lists backup aliases for the primary route; purpose-specific models use the model `purpose` field. The AI SDK bridge keeps `maxRetries: 0`, so retry/fallback events come from Guga router policy.

## Diagnostics

No ordinary CLI, workbench, model, status, or ops output may include API keys, bearer tokens, static secrets, authorization headers, or raw provider request payloads. Provider metadata and error text must be redacted before projection.
