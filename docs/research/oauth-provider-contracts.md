# OAuth Provider Contracts for M41 U1

更新时间：2026-05-28

## 一句话结论

M41 可以把 GitHub Copilot 与 OpenAI/Codex 的登录体验统一成 Guga-owned OAuth session contract，但两条路径成熟度不同：GitHub Copilot 有 GitHub 官方 OAuth/device-flow 与 Copilot SDK token consumer 说明，可作为第一优先实现；OpenAI/Codex 只有官方 Codex CLI 与 `openai/codex` app-server 的账号面可确认，第三方复刻 ChatGPT OAuth 端点仍应标为 compatibility-only / Pending Verification，不能在 core 或公共 contract 中固化 raw token shape。

## 范围与分级

| 分级 | 含义 | M41 处理 |
|---|---|---|
| official | 一手官方文档直接定义的公开行为或 API surface | 可进入实现合同 |
| technical-preview | 官方 preview / technical preview，功能可变 | 可做可替换 adapter，避免硬依赖污染主链路 |
| compatibility-only | 官方仓库/现有产品暴露的行为，但不是面向 Guga 的稳定第三方 API 合同 | 只能作为兼容参考或后续 spike 输入 |
| Pending Verification | 需要真实账号、法律/产品确认或进一步源码/发布说明确认 | 不写死到默认实现 |

## Provider 合同

### GitHub Copilot

| 项 | 结论 | 证据强度 | 状态 |
|---|---|---|---|
| 登录方式 | CLI/headless 场景应使用 GitHub OAuth Device Authorization Grant：先取 `device_code/user_code/verification_uri/expires_in/interval`，展示 URL/code，再按 interval 轮询 token。 | Fact | official |
| polling 规则 | 必须尊重初始 `interval`；`slow_down` 后增加 5 秒；`authorization_pending` 继续等待；`expired_token`、`access_denied`、`incorrect_device_code` 等应转成终止失败。 | Fact | official |
| token consumer | Copilot SDK 支持显式传入 GitHub OAuth/GitHub App user token，并设置 `useLoggedInUser: false` 避免读外部 CLI 或 GitHub CLI 登录态。 | Fact | technical-preview |
| token lifecycle | 应用负责 token storage、refresh、expiration handling；SDK 使用调用方传入的 token，不拥有完整 OAuth lifecycle。 | Fact | technical-preview |
| token 类型 | `gho_` OAuth user token、`ghu_` GitHub App user token、`github_pat_` fine-grained PAT 被文档列为支持；classic `ghp_` 不作为默认支持。 | Fact | technical-preview |
| Guga session ownership | Guga 不应读取 Copilot CLI / GitHub CLI store 作为默认路径；应持有自己的 provider-scoped credential record。 | Inference | official + Guga R5 |
| 依赖选择 | 暂不把 `@github/copilot-sdk` 加入 `packages/cli/package.json`。U1 只锁定 OAuth contract；后续真正 Copilot runtime adapter 再引入可选依赖，并隔离到 CLI/provider adapter 层。 | Inference | technical-preview |

最小合同：

```ts
type CopilotOAuthSession = {
  providerId: "github-copilot";
  source: "oauth";
  accessToken: string;
  refreshToken?: string;
  tokenType: "bearer";
  expiresAt?: string;
  scopes?: string[];
  account?: { login?: string; id?: string };
};
```

该类型只应停留在 CLI/host auth 层或内部 store schema，不进入 `packages/core/src/contracts`。

### OpenAI / Codex

| 项 | 结论 | 证据强度 | 状态 |
|---|---|---|---|
| Codex CLI auth surface | OpenAI 官方 Codex CLI 页面说明首次运行会提示使用 ChatGPT account 或 API key 登录；ChatGPT Plus、Pro、Business、Edu、Enterprise 计划包含 Codex。 | Fact | official |
| Codex app-server account surface | `openai/codex` 官方仓库的 app-server JSON-RPC 暴露 `account/read`、`account/login/start`、`account/login/cancel`、`account/logout`、`account/updated`、`account/rateLimits/read`。 | Fact | official repo |
| ChatGPT managed flow | app-server 支持 `type: "chatgpt"` browser flow 和 `type: "chatgptDeviceCode"` device-code flow；登录成功后 `account/updated` 报 `authMode: "chatgpt"` 与 `planType`。 | Fact | compatibility-only |
| API key flow | app-server 也支持 `type: "apiKey"`；这与现有 M40 API key/env/local credential 路径兼容。 | Fact | official repo |
| 第三方 OAuth endpoint | OpenAI 官方 developer 页面没有把 ChatGPT OAuth endpoint、client id、token exchange 或 refresh contract 作为稳定第三方 API 文档发布给 Guga。 | Fact | Pending Verification |
| Guga session ownership | 不共享 Codex CLI store；即使后续参考 app-server，也应将 Guga 的 session 存在 Guga Home 并由 Guga refresh/logout。 | Inference | Guga R5 + reference evidence |
| runtime 调用路径 | OpenAI/Codex OAuth-backed local model call 是否能通过 OpenAI-compatible `Authorization` header 进入当前 AI SDK bridge，需要真实 endpoint/模型 route 验证。 | Pending Verification | compatibility-only |

最小合同：

```ts
type CodexOAuthSession = {
  providerId: "openai-codex";
  source: "oauth";
  authMode: "chatgpt";
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  planType?: string;
  account?: { email?: string; id?: string };
};
```

U1 不建议把 ChatGPT OAuth endpoint 常量写入代码。下一步应先由主线程确认：Guga 是直接实现 ChatGPT OAuth/browser callback，还是以 official `openai/codex` app-server account surface 作为可选 compatibility adapter 的参考。

## Guga Host Contract

### Auth 状态

`packages/cli/src/provider-auth.ts` 目前状态是 `configured | missing | invalid | unknown`，source 是 `env | static | local | none`。M41 应扩展而不是平行实现：

```ts
type ProviderAuthStatus =
  | "configured"
  | "missing"
  | "invalid"
  | "unknown"
  | "expired"
  | "refresh_failed"
  | "logged_out";

type ProviderAuthSource = "env" | "static" | "local" | "oauth" | "none";
```

Fact：现有 resolver 已返回 redacted view，且 `packages/cli/src/model-registry.ts` 使用该 view 解释模型 availability。  
Inference：OAuth session 应接入同一 view，避免 `/models`、`/login`、runtime host factory 各维护一份状态。

### Login flow events

Guga 的 provider OAuth runner 应产生 renderer-neutral 状态，供 CLI/workbench/Ink controller 消费：

```ts
type ProviderOAuthLoginEvent =
  | { type: "started"; providerId: string; loginId: string }
  | { type: "device_code"; providerId: string; verificationUri: string; userCode: string; expiresInSeconds: number; intervalSeconds: number }
  | { type: "browser_url"; providerId: string; authUrl: string; callbackPort?: number }
  | { type: "polling"; providerId: string; loginId: string; nextPollInSeconds: number }
  | { type: "completed"; providerId: string; loginId: string }
  | { type: "cancelled"; providerId: string; loginId: string }
  | { type: "failed"; providerId: string; loginId?: string; code: string; message: string };
```

Fact：GitHub device flow 明确需要展示 URL/code 并轮询；Codex app-server browser/device flow 也将 URL/code 暴露给前端。  
Inference：这些事件应由 auth runner 产出，UI 只负责展示、取消、打开浏览器，不拥有 token exchange。

### Storage contract

OAuth credential record 应在 Guga Home 下 provider-scoped 存储，例如：

```text
credentials/providers/<provider>.oauth.json
```

要求：

- 文件内容包含 raw token 时必须 `0600` 写入；Windows 等价策略后续验证。
- 写入用临时文件 + atomic replace。
- refresh 用 provider-scoped lock，避免并发 Guga 进程同时消费 refresh token。
- redacted view 只能显示 source、status、expiresAt/account label，不显示 access/refresh token 或 Authorization header。

Fact：`packages/cli/src/provider-login.ts` 已将 local credential 写到 `credentials/providers/<provider>.json` 且 mode 为 `0600`。  
Inference：OAuth store 应复用 Guga Home 模型并补 typed credentials root，而不是新增独立目录。

## Runtime / Dependency Boundary

### AI SDK bridge

Fact：`packages/core/src/provider-ai-sdk/index.ts` 的 config 只接受 SDK-neutral `apiKey`、`baseURL`、`headers`、`providerOptions`；`openAiSettings()` 将这些设置传给 provider factory。AI SDK 官方文档也支持 `createOpenAI`/`createOpenAICompatible` 的 `apiKey`、`baseURL`、`headers`，以及 `generateText` 的 `providerOptions`。

Inference：

- OAuth refresh、token storage、login UX 不属于 `packages/core/src/provider-ai-sdk/`。
- host factory 只应把已解析 credential material 转成 SDK-neutral config，例如 `headers: { Authorization: "Bearer <token>" }` 或 provider SDK adapter config。
- provider SDK types 不进入 `packages/core/src/contracts`，也不进入 provider/model public event payload。

### Copilot SDK dependency

Fact：GitHub 官方 `github/copilot-sdk` README 将 SDK 标为 Public Preview，并提供 Node.js/TypeScript 安装方式 `npm install @github/copilot-sdk`；认证文档要求显式 token 时传 `gitHubToken` 并关闭 `useLoggedInUser`。  
Inference：M41 U1 不应现在添加 dependency。后续若实现 Copilot runtime adapter，应优先作为 optional dependency 或 CLI package 私有依赖，并把 adapter 置于 CLI/host/provider 层；core 仍只看 Guga provider contract。

### OpenAI/Codex dependency

Fact：当前已存在 `@ai-sdk/openai`、`@ai-sdk/openai-compatible`、`ai` optional dependencies 在 `packages/core/package.json`。  
Inference：OpenAI/Codex OAuth 首版不需要新增 npm dependency。真正阻塞项不是 SDK，而是 official endpoint/permission/plan contract。若最终选择复用 `openai/codex` app-server，应作为 compatibility adapter 设计，不应读写官方 Codex CLI credential store。

## 参考项目证据

| 来源 | 观察 | 证据强度 |
|---|---|---|
| `docs/research/context-packs/provider-abstraction.md` | Provider transport 与 auth/credential lifecycle 应分层；credential refresh/401/429/402 处理是生产能力，但 M41 MVP 不做完整 pool。 | Fact |
| `docs/research/repomix/pi-focused-context.xml` | Pi 在 provider request 前通过 `getApiKeyAndHeaders()` 每次解析 credential/header，支持 token 更新后下一次请求生效。 | Fact |
| `docs/research/repomix/pi-focused-context.xml` | Pi 的 OAuth selector 把 OAuth-only provider 与 API-key provider 分开，并在 UI 中展示 stored OAuth/auth env/config 状态。 | Fact |
| `docs/research/source-analysis/hermes-agent-anatomy/docs/04-多Provider适配.md` | Hermes 选择独立 Codex OAuth session，理由是共享外部 CLI refresh token 会产生互相失效风险。 | Fact |
| `docs/research/source-analysis/learn-opencode/docs/internals/provider.md` | OpenCode 将 provider auth、headers、模型 metadata 作为 provider surface 的一部分，而不是让 agent loop 直接处理 secret。 | Fact |

## 不建议照搬

- 不照搬 Hermes 的完整 credential pool。M41 需要 provider-scoped lock + atomic write + refresh failure state；多 key 策略、租约、冷却可后置。
- 不让 `GH_TOKEN` / `GITHUB_TOKEN` 自动变成 Copilot 推理 provider。GitHub token 很常见，自动检测会把 repo 操作凭证误解释为模型凭证。
- 不把 Codex app-server 的 JSON-RPC 方法名当作 Guga public API。它可指导 UI 状态形状，但 Guga 应保留自己的 provider auth contract。
- 不在正常测试中访问 `github.com`、`auth.openai.com`、`chatgpt.com` 或真实 provider endpoint。

## 测试落点

- `packages/cli/src/provider-oauth.test.ts`：U1 contract fixture，验证 provider ownership、preview dependency 不强制、device-code 必需字段、polling slow_down 行为和 session redaction。
- `packages/core/src/provider-ai-sdk/provider.test.ts`：验证 OAuth bearer header 可以通过 SDK-neutral provider config 传入 model factory，且 raw provider metadata 中的 `Authorization` 会被 redacted。

## Pending Verification

1. OpenAI/Codex：Guga 是否获得/使用稳定 ChatGPT OAuth client、browser callback 与 device-code endpoint，还是只提供 API key + optional compatibility adapter。
2. OpenAI/Codex：OAuth-backed token 能访问的本地模型调用 endpoint、模型 id 与 rate-limit surface，是否与 current AI SDK OpenAI/OpenAI-compatible bridge 兼容。
3. GitHub Copilot：`@github/copilot-sdk` 进入 `packages/cli` 的 license、bundle size、server-mode lifecycle、tool permission surface 和版本 pinning。
4. GitHub Copilot：device flow app registration/client id 归属，是 Guga 自有 GitHub App/OAuth App，还是需要企业自配置。
5. 跨平台 credential store：Windows 文件权限等价策略与后续 OS keychain adapter 边界。

## 资料来源

- GitHub Docs: [Authorizing OAuth apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
- GitHub Docs: [Using GitHub OAuth with Copilot SDK](https://docs.github.com/en/copilot/how-tos/copilot-sdk/set-up-copilot-sdk/github-oauth)
- GitHub Docs: [Authenticating with Copilot SDK](https://docs.github.com/en/copilot/how-tos/copilot-sdk/authenticate-copilot-sdk/authenticate-copilot-sdk)
- GitHub: [github/copilot-sdk](https://github.com/github/copilot-sdk)
- OpenAI Developers: [Codex CLI](https://developers.openai.com/codex/cli)
- OpenAI GitHub: [openai/codex app-server README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)
- AI SDK Docs: [OpenAI provider](https://ai-sdk.dev/providers/ai-sdk-providers/openai), [OpenAI-compatible providers](https://ai-sdk.dev/providers/openai-compatible-providers), [settings](https://ai-sdk.dev/docs/ai-sdk-core/settings)
