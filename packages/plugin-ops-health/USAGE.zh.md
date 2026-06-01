# @guga-agent/plugin-ops-health 用法

## 用途

`@guga-agent/plugin-ops-health` 提供 provider health check 以及经过 redaction 的 credential/config 视图。它为运维状态界面而构建；除非 host 注入显式的网络 health checker，否则它是 hermetic 的。

## 导入

```ts
import {
  checkProviderHealth,
  createOpsHealthPlugin,
  redactSecret,
  resolveCredentialConfig
} from "@guga-agent/plugin-ops-health";
```

## 主要 API

- `resolveCredentialConfig(options)`: 将 env 或 static credential configuration 解析为经过 redaction 的视图和诊断。
- `redactSecret(value)`: 对看起来像 secret 的值进行 redaction 以便展示。
- `checkProviderHealth(options)`: 调用注入的 health checker 并规范化 status。
- `createOpsHealthPlugin(options)`: 注册 `provider.health` 和 `provider.config` operation descriptor。
- 类型：`CredentialConfigInput`、`ResolveCredentialConfigOptions`、`ProviderHealthCheck`、`ProviderHealthCheckResult`、`ProviderHealthTarget` 和 `OpsHealthPluginOptions`。

## 常见用法

```ts
const config = resolveCredentialConfig({
  providerId: "openai",
  source: "env",
  env: process.env,
  requiredKeys: ["OPENAI_API_KEY"]
});

const health = await checkProviderHealth({
  target: { providerId: "openai", modelId: "gpt-5.4" },
  check: async () => ({ status: "healthy" })
});
```

## 参数说明

- `resolveCredentialConfig(options)` 使用 `ResolveCredentialConfigOptions`。`providerId` 和 `source` 必填；`values` 可选，用于 static 或 managed 配置值；`requiredKeys` 可选，用于声明必须存在的 key；`env` 可选，仅在 `source: "env"` 时用于替代 `process.env`。
- `redactSecret(value)` 接收 `string | undefined`。缺失值返回 `<missing>`，短值完全 redaction，较长值只保留头尾片段。
- `checkProviderHealth(options)` 的 `target` 必填，使用 `ProviderHealthTarget`，其中 `providerId` 必填、`modelId` 可选；`check` 可选，使用 `ProviderHealthCheck`，用于执行实际健康检查；`now` 可选，用于提供检查时间。
- `createOpsHealthPlugin(options)` 使用 `OpsHealthPluginOptions`。`pluginId` 可选；该 factory 只注册 `provider.health` 和 `provider.config` operation descriptor。

## 注意事项

- 没有注入 `check` 函数时，provider health 会报告为 `unknown`，而不是发起网络调用。
- Static secret 会被 redaction 并带 warning 报告。
- 该插件只注册 operation descriptor；host 决定如何暴露 operation data。

## 相关包

- `@guga-agent/core` 提供运维契约。
- `@guga-agent/profile-code-agent` 和 `@guga-agent/cli` 可以在组合运行时中包含 ops health。
