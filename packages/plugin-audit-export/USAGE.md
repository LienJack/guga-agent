# @guga-agent/plugin-audit-export Usage

## Purpose

`@guga-agent/plugin-audit-export` projects agent event streams into safe operational summaries and metric snapshots. It is intended for audit and health surfaces that need counts, statuses, usage, failures, and permission outcomes without copying prompts, tool inputs, or raw tool outputs.

## Import

```ts
import {
  createAuditExportPlugin,
  createAuditSummary,
  createMetricsSnapshot
} from "@guga-agent/plugin-audit-export";
```

## Main APIs

- `createAuditSummary(options)`: aggregates run, tool, permission, usage, and failure facts from `AgentEvent[]`.
- `createMetricsSnapshot(options)`: derives high-level runtime metrics from event streams.
- `createAuditExportPlugin(options)`: registers discoverable `audit.summary` and `metrics.snapshot` operations.
- Types: `CreateAuditSummaryOptions`, `CreateMetricsSnapshotOptions`, and `AuditExportPluginOptions`.

## Common Usage

```ts
const summary = createAuditSummary({
  runId: "run-1",
  events,
  startedAt: "2026-06-01T00:00:00.000Z",
  completedAt: "2026-06-01T00:00:05.000Z"
});

const runtime = createAgentRuntime({
  plugins: [createAuditExportPlugin()]
});
```

## Notes

- The plugin registers operation descriptors only; it does not expose a model-visible tool or HTTP route by itself.
- Failure messages are included in summaries, so callers should avoid placing secrets in error messages.
- Pass explicit timestamps when you need meaningful duration fields.

## Related Packages

- `@guga-agent/core` supplies `AgentEvent` and operational contracts.
- `@guga-agent/profile-code-agent` and `@guga-agent/cli` can include audit operations in composed runtimes.
