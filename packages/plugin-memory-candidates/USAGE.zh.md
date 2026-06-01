# @guga-agent/plugin-memory-candidates 用法

## 用途

`@guga-agent/plugin-memory-candidates` 包含纯内存候选项、治理、检索、Markdown 渲染和评审报告辅助能力。它还为一方记忆界面暴露小型操作注册插件。

将此包用于记忆逻辑和视图。它本身不提供持久化存储，也不提供模型可见的工具。

## 导入

```ts
import {
  createMemoryCandidate,
  createMemoryCandidateLedger,
  createMemoryCandidatesPlugin,
  createMemoryGovernanceLedger,
  renderGovernedMemoryBlock,
  searchGovernedMemoryItems
} from "@guga-agent/plugin-memory-candidates";
```

## 主要 API

- 候选项辅助函数：`createMemoryCandidate()`、`createMemoryCandidateLedger()`、`scanMemoryCandidateContent()`、`validateMemoryCandidate()` 和 `renderMemoryContextBlock()`。
- 治理辅助函数：`createMemoryGovernanceLedger()`、`validateMemoryDecision()`、`listMemoryItemsByScope()` 和 `renderGovernedMemoryBlock()`。
- 检索辅助函数：`searchGovernedMemoryItems()` 和 `renderMemoryRetrievalBlock()`。
- Markdown/评审辅助函数：`renderCuratedMemoryMarkdown()`、`createMemoryReviewHealth()`、`createMemoryReviewReport()`、`renderMemoryReviewHealthBlock()` 和 `renderMemoryReviewReport()`。
- 插件：`createMemoryCandidatesPlugin()`、`createMemoryGovernancePlugin()` 和 `createMemoryReviewPlugin()`。
- 用于候选项、治理决策、检索结果、评审报告和渲染选项的类型。

## 常见用法

```ts
const candidate = createMemoryCandidate({
  id: "mem-1",
  scope: "project",
  kind: "workflow",
  content: "Prefer package-root public APIs in docs.",
  confidence: 0.9,
  importance: 0.7,
  status: "accepted",
  createdAt: new Date().toISOString(),
  sourceRefs: [{ eventId: "event-1" }]
});

const diagnostics = validateMemoryCandidate(candidate);
const block = renderMemoryContextBlock([candidate]);
```

只有当某个运行时需要公开记忆操作时，才安装该插件：

```ts
const runtime = createAgentRuntime({
  plugins: [createMemoryCandidatesPlugin()]
});
```

## 参数说明

- `createMemoryCandidate(input)` 接收 `Omit<MemoryCandidate, "safety"> & { safety?: MemorySafetyVerdict }`。`id`、`scope`、`kind`、`content`、`confidence`、`importance`、`status`、`createdAt` 和非空 `sourceRefs` 是候选项的核心字段；`confidence` 与 `importance` 必须是 `0` 到 `1` 之间的数字，`createdAt` 使用 ISO 时间字符串。`safety` 可省略，函数会用 `scanMemoryCandidateContent()` 自动生成并与显式值合并；`tags` 可选。
- `createMemoryGovernanceLedger(candidates, decisions)` 需要候选项数组和 `MemoryDecision` 数组。`MemoryDecision` 的 `action` 为 `"accept"`、`"reject"` 或 `"supersede"`；`supersede` 必须提供 `supersedesItemId`，`itemId` 可用于覆盖生成的记忆项 id。
- `listMemoryItemsByScope(ledger, filter)` 的 `filter.scope` 必填；`kind`、`tags` 和 `includeSuperseded` 可选，用于缩小返回的 `GovernedMemoryItem[]`。
- `searchGovernedMemoryItems(items, query, options)` 的 `query` 必须包含可检索词，`options.scope` 必填；`kind`、`tags`、`includeSuperseded` 和 `maxResults` 可选，默认只返回 active 且 safe 的结果。
- 渲染函数的 options 只影响视图，不改变数据。`RenderMemoryContextOptions`、`RenderGovernedMemoryOptions` 和 `RenderMemoryRetrievalOptions` 常用字段包括 `maxItems`、`maxContentChars`、`includeSourceRefs` 与 `title`；`RenderMemoryRetrievalOptions.includeReasons` 会附加命中原因。`RenderCuratedMemoryMarkdownOptions` 还支持 `scopes`、`kinds` 和 `includeTags`。
- `renderMemoryReviewReport(report, options)` 使用 `RenderMemoryReviewReportOptions` 控制报告标题和各分区数量：`maxActiveItems`、`maxSupersededItems`、`maxCandidateItems`、`maxDiagnostics`、`maxContentChars`。
- `createMemoryCandidatesPlugin(options)`、`createMemoryGovernancePlugin(options)` 和 `createMemoryReviewPlugin(options)` 都接收 `MemoryCandidatesPluginOptions`；目前只有可选 `pluginId`，省略时分别使用包内默认 id。

## 注意事项

- 插件工厂只注册操作描述符；它们不会持久化记忆记录。
- 需要 JSONL 持久化时，请使用 `@guga-agent/plugin-memory-jsonl`。
- 检索和渲染辅助函数作用于调用方传入的、经过治理的内存数据。

## 相关包

- `@guga-agent/core` 提供操作发现契约。
- `@guga-agent/plugin-memory-jsonl` 基于这些辅助函数构建持久化 JSONL 工作流。
