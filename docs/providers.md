# Guga Provider 登录与模型可用性

## 一句话结论

Guga 把 provider 登录、credential storage、模型可用性、runtime provider adapter 分层处理。API key provider 继续走 env/local credential；GitHub Copilot 与 OpenAI/Codex 走 Guga-owned OAuth session，不复用外部 CLI 的登录态。

## 常用命令

```bash
guga login openai --api-key-env OPENAI_API_KEY
guga login openai --api-key sk-...
guga login copilot
guga login codex
guga auth status
guga auth status codex
guga logout codex
guga --list-models
```

Workbench 中对应命令：

```text
/login
/login copilot
/login codex
/auth status
/logout codex
/models
/model codex
```

## Credential 存储

Guga Home 默认是 `~/.guga`，可用 `GUGA_HOME` 覆盖。Provider credential 存储在：

```text
credentials/providers/<provider>.json
```

文件中可能包含 raw token 或 API key，因此写入时会尽量使用受限权限。用户可见的 status、diagnostics、model list、runtime metadata 只显示 redacted auth view，不显示 access token、refresh token、API key、raw OAuth payload 或 Authorization header。

## OAuth Provider

### GitHub Copilot

Copilot 登录采用 CLI/headless 友好的 device-code 形状：显示验证 URL 与 user code，按 provider interval 轮询，处理 pending、slow_down、expired、cancelled 和 denied。Credential 归 Guga 管理，后续 runtime adapter 只消费解析后的 token/header。

真实 CLI 登录需要配置 Guga 自有 GitHub OAuth app client id：

```bash
GUGA_COPILOT_CLIENT_ID=... guga login copilot
```

### OpenAI / Codex

Codex 登录采用 browser callback 形状，并保留手动 code/redirect URL fallback。当前实现把 OpenAI/Codex 官方账号面作为契约参考；不把 ChatGPT/Codex 内部 token payload 暴露给 core contracts。默认 CLI runner 在稳定第三方 ChatGPT/Codex OAuth endpoint 合同确认前保持关闭，但测试和 host 层已经通过 injectable runner 覆盖完整存储、状态和模型可用性链路。

## 模型可用性

`copilot` 和 `codex` 是内置 alias，会进入与普通 provider 相同的 `model-registry.ts` 视图：

- 登录前：模型可见但 unavailable，原因是 `missing auth`。
- 登录后：模型变为 available，可通过 `/model` 或 `--model` 选择。
- token 过期或 refresh 失败：模型 unavailable，提示 expired/refresh failed auth。
- logout 后：只删除对应 provider 的本地 credential，模型回到 unavailable。

## 不支持范围

- 不同步 GitHub CLI、Copilot CLI、Codex CLI 或 Claude Code 的 credential store。
- 不实现 consumer Claude OAuth；Anthropic/Claude 继续使用官方 API key 或 Workload Identity Federation。
- 不实现 DeepSeek 或 Kimi/Moonshot OAuth；它们继续通过 API key 或 OpenAI-compatible provider 配置接入。
- 不在正常测试中访问真实 GitHub、OpenAI、ChatGPT 或 provider endpoint；真实账号 smoke 必须显式 opt-in。
