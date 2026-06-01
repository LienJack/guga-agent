# @guga-agent/plugin-ops-health Usage

## Purpose

`@guga-agent/plugin-ops-health` provides provider health checks and redacted credential/config views. It is built for operational status surfaces and is hermetic unless the host injects an explicit network health checker.

## Import

```ts
import {
  checkProviderHealth,
  createOpsHealthPlugin,
  redactSecret,
  resolveCredentialConfig
} from "@guga-agent/plugin-ops-health";
```

## Main APIs

- `resolveCredentialConfig(options)`: resolves env or static credential configuration into a redacted view plus diagnostics.
- `redactSecret(value)`: redacts secret-looking values for display.
- `checkProviderHealth(options)`: calls an injected health checker and normalizes status.
- `createOpsHealthPlugin(options)`: registers `provider.health` and `provider.config` operation descriptors.
- Types: `CredentialConfigInput`, `ResolveCredentialConfigOptions`, `ProviderHealthCheck`, `ProviderHealthCheckResult`, `ProviderHealthTarget`, and `OpsHealthPluginOptions`.

## Common Usage

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

## Parameters

- `resolveCredentialConfig(options)` requires `providerId` and `source`. Use `source: "env"` with `requiredKeys` and optional `env`, or `source: "static"` with `values`; when `requiredKeys` is omitted, keys are inferred from `values`.
- `redactSecret(value)` accepts a secret string or `undefined`; missing values return `<missing>`, short values return `<redacted>`, and longer values keep only a small prefix and suffix.
- `checkProviderHealth(options)` requires `target.providerId`; optional `target.modelId` scopes the check to a model. Optional `check` performs the real health probe, and optional `now` controls the reported `checkedAt` timestamp.
- `createOpsHealthPlugin(options)` accepts optional `pluginId`; omit it to register the default `ops-health` operation plugin.

## Notes

- Without an injected `check` function, provider health is reported as `unknown` instead of making a network call.
- Static secrets are redacted and reported with warnings.
- The plugin registers operation descriptors only; hosts decide how to expose the operation data.

## Related Packages

- `@guga-agent/core` supplies operational contracts.
- `@guga-agent/profile-code-agent` and `@guga-agent/cli` can include ops health in composed runtimes.
