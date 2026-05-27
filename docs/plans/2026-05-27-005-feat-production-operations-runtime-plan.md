# M8 Production Operations Runtime Plan

## Goal

Add the first production operations substrate for Guga: provider health, redacted credential/config resolution, audit export, trust/scope capability metadata, a basic eval/replay runner, and event-derived metrics.

## Scope

- Keep core small: only add stable contracts that multiple packages consume.
- Prefer first-party plugins/packages for operational behavior.
- Feed host/CLI/workbench surfaces through typed resources.
- Keep all tests hermetic; no real provider credentials.

## Non-Goals

- No remote credential vault.
- No billing ledger.
- No SaaS telemetry.
- No deployment platform.
- No large benchmark framework.
- No full credential pool/OAuth daemon in this slice.

## Implementation Units

### U1 — Operations Contracts

Files:

- `packages/core/src/contracts/operations.ts`
- `packages/core/src/contracts/plugins.ts`
- `packages/core/src/index.ts`
- `packages/core/src/contracts/contracts.test.ts`

Work:

- Define `ProviderHealth`, `CredentialConfigView`, `AuditSummary`, `MetricsSnapshot`, and `TrustDescriptor`.
- Extend capability descriptors with optional trust/scope metadata.
- Add serialization/redaction contract tests.

Acceptance:

- Contracts are JSON-serializable.
- Existing capability descriptor callers remain compatible.
- Trust/scope is optional and does not break M6 descriptors.

### U2 — Provider Health And Config Plugin

Files:

- `packages/plugin-ops-health/package.json`
- `packages/plugin-ops-health/src/index.ts`
- `packages/plugin-ops-health/src/config-resolver.ts`
- `packages/plugin-ops-health/src/provider-health.ts`
- `packages/plugin-ops-health/src/plugin-ops-health.test.ts`

Work:

- Resolve env/static provider config into redacted views.
- Provide mockable health checks for providers/models.
- Expose operational capability descriptors.

Acceptance:

- Redaction tests prove API keys never appear in returned views.
- Health check tests cover healthy, missing-config, and failed states.

### U3 — Audit Export And Metrics

Files:

- `packages/plugin-audit-export/package.json`
- `packages/plugin-audit-export/src/index.ts`
- `packages/plugin-audit-export/src/audit-summary.ts`
- `packages/plugin-audit-export/src/metrics-snapshot.ts`
- `packages/plugin-audit-export/src/plugin-audit-export.test.ts`

Work:

- Build audit summaries from core/host events.
- Aggregate run/tool/permission/usage counters.
- Keep cost unknown explicit.

Acceptance:

- Mock run events produce deterministic audit summary.
- Metrics snapshot updates from event sequences.
- Sensitive values are redacted.

### U4 — Eval / Replay Runner

Files:

- `packages/plugin-eval-runner/package.json`
- `packages/plugin-eval-runner/src/index.ts`
- `packages/plugin-eval-runner/src/eval-runner.ts`
- `packages/plugin-eval-runner/src/fixtures.ts`
- `packages/plugin-eval-runner/src/eval-runner.test.ts`

Work:

- Define local eval fixture shape.
- Run hermetic fixtures through existing runtime/replay capabilities.
- Return structured pass/fail diagnostics.

Acceptance:

- At least one mock provider fixture passes.
- A failing fixture returns actionable diagnostics.
- Runner does not require network or real API credentials.

### U5 — Host / CLI Exposure

Files:

- `packages/host-protocol/src/resources.ts`
- `packages/host-local-server/src/routes.ts`
- `packages/host-sdk/src/client.ts`
- `packages/cli/src/commands/run.ts`
- relevant tests

Work:

- Expose operational resource endpoints where needed.
- Add CLI-readable operational status path if small.
- Avoid duplicating plugin logic in host/CLI.

Acceptance:

- SDK can read health/audit/metrics resources.
- CLI can print basic operational diagnostics without leaking secrets.

### U6 — Docs, Review, Blog, Finish

Files:

- `docs/research/production-operations-runtime.md`
- `docs/solutions/architecture-patterns/production-operations-runtime.md`
- `blog/build-agent-from-zero-m8-production-ops.md`

Work:

- Document production substrate boundaries.
- Run code review.
- Write M8 blog article.
- Archive Trellis task.

Acceptance:

- `pnpm -r --workspace-concurrency=1 test`
- `pnpm -r typecheck`
- `pnpm -r build`

## Risks

- Trust/scope metadata can become too broad if it tries to model every enterprise policy now.
- Provider health can accidentally become a real network test; keep checks injectable and hermetic by default.
- Audit export can leak inputs if redaction is not applied consistently.
- Eval runner can sprawl; first slice should stay fixture-based.

## Sequencing

1. U1 contracts.
2. U2 health/config.
3. U3 audit/metrics.
4. U4 eval runner.
5. U5 host/CLI exposure.
6. U6 docs/review/blog/finish.
