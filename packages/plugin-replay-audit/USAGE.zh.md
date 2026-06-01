# @guga-agent/plugin-replay-audit 用法

## 用途

`@guga-agent/plugin-replay-audit` 从持久 session、event 和 artifact 事实派生 replay 与 audit 视图。它无需重新运行 provider、tool 或 hook，就能重建 conversation、model-input 和 audit 投影。

## 导入

```ts
import {
  ReplayAuditProjectionCapability,
  buildAuditView,
  buildConversationView,
  buildModelInputView,
  createReplayAuditPlugin
} from "@guga-agent/plugin-replay-audit";
```

## 主要 API

- `createReplayAuditPlugin(options)`: 向运行时注册 replay capability。
- `ReplayAuditProjectionCapability`: 围绕 store 的直接 replay capability wrapper。
- `buildConversationView(options)`: 重建 branch 可见的 conversation message。
- `buildModelInputView(options)`: 从已提交事实重建 provider 可见的 model input。
- `buildAuditView(options)`: 构建有序 audit timeline。
- 类型：`ReplayAuditPluginOptions`、`ReplayAuditStores`、`ConversationViewResult`、`ModelInputViewResult`、`AuditViewResult` 和 `BranchReplayView`。

## 常见用法

```ts
const runtime = createAgentRuntime({
  plugins: [
    createJsonlSessionPlugin({ rootDir: ".guga/sessions" }),
    createFilesystemArtifactPlugin({ rootDir: ".guga/artifacts" }),
    createReplayAuditPlugin()
  ]
});
```

当高级 host 已经自行管理 store 时，可以直接构造 `ReplayAuditProjectionCapability`。

## 参数说明

- `createReplayAuditPlugin(options)` 使用 `ReplayAuditPluginOptions`。`pluginId` 可选；`eventStore`、`sessionStore` 和 `artifactStore` 可选，未传入时会尝试从 plugin context 获取。`eventStore` 是 replay 的关键依赖；缺失时 replay capability 会返回 unavailable。
- `new ReplayAuditProjectionCapability(stores)` 接收 `Partial<ReplayAuditStores>`。`eventStore` 用于读取持久事件流；`sessionStore` 用于解析 branch-aware 视图；`artifactStore` 用于 audit 视图中的 artifact 校验。
- `buildConversationView(events)` 接收 `DurableEventEnvelope[]`，用于重建对话消息和相关诊断。
- `buildModelInputView(events, request)` 接收 `DurableEventEnvelope[]`；`request.turn` 可选，用于选择特定 turn 的 provider input 投影。
- `buildAuditView(options)` 的 `events` 必填；`branch`、`artifactStore` 和 `readDiagnostics` 可选，分别用于附加 branch 信息、检查 artifact 引用和合并读取诊断。

## 注意事项

- Replay 不会修改状态，也不会模拟或重新运行 model/tool 行为。
- 没有 event store 时，replay 会报告 unavailable。
- 没有 session store 时，branch-aware view 会回退到 main/default branch 假设。
- Audit view 包含针对 open run、open tool、open model request、open permission、compaction、artifact verification 和相关持久事实的诊断。

## 相关包

- `@guga-agent/core` 定义 replay 契约。
- `@guga-agent/plugin-session-jsonl` 提供本地持久 event/session store。
- `@guga-agent/plugin-artifact-filesystem` 提供 audit view 使用的 artifact 读取能力。
