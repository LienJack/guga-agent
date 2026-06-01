# @guga-agent/plugin-audit-export 用法

## 用途

`@guga-agent/plugin-audit-export` 将 agent 事件流投影为安全的运维摘要和指标快照。它面向需要计数、状态、用量、失败和权限结果的审计与健康状态界面，同时避免复制 prompt、工具输入或原始工具输出。

## 导入

```ts
import {
  createAuditExportPlugin,
  createAuditSummary,
  createMetricsSnapshot
} from "@guga-agent/plugin-audit-export";
```

## 主要 API

- `createAuditSummary(options)`: 从 `AgentEvent[]` 聚合 run、tool、permission、usage 和 failure 事实。
- `createMetricsSnapshot(options)`: 从事件流派生高层运行时指标。
- `createAuditExportPlugin(options)`: 注册可发现的 `audit.summary` 和 `metrics.snapshot` 操作。
- 类型：`CreateAuditSummaryOptions`、`CreateMetricsSnapshotOptions` 和 `AuditExportPluginOptions`。

## 常见用法

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

## 参数说明

- `createAuditSummary(options)` 使用 `CreateAuditSummaryOptions`。`runId` 和 `events` 为必填字段，分别用于限定目标 run 和传入 `AgentEvent[]`；`startedAt`、`completedAt` 可选，用于显式覆盖摘要中的开始/完成时间。
- `createMetricsSnapshot(options)` 使用 `CreateMetricsSnapshotOptions`。`events` 必填；`runId` 可选，传入后只统计对应 run；`updatedAt` 可选，缺省使用当前时间。
- `createAuditExportPlugin(options)` 使用 `AuditExportPluginOptions`。`pluginId` 可选，用于覆盖默认插件 id；该 factory 不接收事件数据，只注册 `audit.summary` 和 `metrics.snapshot` operation descriptor。

## 注意事项

- 该插件只注册 operation descriptor；它本身不会暴露模型可见工具或 HTTP route。
- 摘要中会包含失败消息，因此调用方应避免在错误消息中放入 secret。
- 需要有意义的 duration 字段时，请传入显式时间戳。

## 相关包

- `@guga-agent/core` 提供 `AgentEvent` 和运维契约。
- `@guga-agent/profile-code-agent` 和 `@guga-agent/cli` 可以在组合运行时中包含 audit 操作。
