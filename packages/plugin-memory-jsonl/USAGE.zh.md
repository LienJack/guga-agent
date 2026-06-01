# @guga-agent/plugin-memory-jsonl 用法

## 用途

`@guga-agent/plugin-memory-jsonl` 将记忆候选项和决策作为 JSONL 记录持久化，然后派生出治理账本、评审报告、健康视图、检索结果、精选 Markdown 和审计快照。

## 导入

```ts
import {
  JsonlMemoryStore,
  MEMORY_JSONL_OPERATION_NAMES,
  createMemoryJsonlPlugin
} from "@guga-agent/plugin-memory-jsonl";
```

## 主要 API

- `JsonlMemoryStore`：基于 JSONL 的记忆记录存储和派生视图读取器。
- `createMemoryJsonlPlugin(options)`：注册可发现的记忆 JSONL 操作。
- `MEMORY_JSONL_OPERATION_NAME`、`MEMORY_JSONL_OPERATION_NAMESPACE`、`MEMORY_JSONL_OPERATION_NAMES` 和 `MEMORY_JSONL_READ_OPERATION_NAMES`：稳定的操作常量。
- 用于追加、读取、审计快照、评审、健康、检索、精选 Markdown、诊断、记录和存储选项的类型。

## 常见用法

```ts
const store = new JsonlMemoryStore({
  rootDir: ".guga/memory"
});

await store.appendCandidate(candidate);
await store.appendDecision(decision);

const ledger = await store.readGovernanceLedger();
const retrieval = await store.readRetrieval("package docs", {});
```

当某个运行时需要公开操作命名空间时，安装该插件：

```ts
const runtime = createAgentRuntime({
  plugins: [createMemoryJsonlPlugin()]
});
```

## 参数说明

- `new JsonlMemoryStore(options)` 使用 `JsonlMemoryStoreOptions`。`rootDir` 必填，表示 JSONL 目录；`fileName` 可选，默认是 `"memory.jsonl"`。
- `appendCandidate(candidate, options)` 与 `appendDecision(decision, options)` 会先验证 `MemoryCandidate` 或 `MemoryDecision`。`options.recordId` 可覆盖默认记录 id，`options.recordedAt` 可覆盖写入时间；省略时分别使用候选项/决策 id 和当前 ISO 时间。
- `readRecords()` 无参数，返回原始 `JsonlMemoryRecord[]`、候选项、决策和可恢复诊断；遇到不可恢复 JSON 或记录损坏时返回 `status: "corrupt"`。
- `readGovernanceLedger()`、`readReviewReport()` 和 `readReviewHealth()` 无业务参数，都是从当前 JSONL 派生视图；它们不写入文件。
- `readReviewMarkdown(options)` 与 `readAuditSnapshot(options)` 接收 `RenderMemoryReviewReportOptions`，用于控制标题、条目数量和内容截断长度。`readReviewHealthMarkdown(options)` 只支持可选 `title`。
- `readRetrieval(query, options)` 的 `query` 是检索文本，`options` 使用 `MemoryRetrievalOptions`；其中 `scope` 必填，`kind`、`tags`、`includeSuperseded` 和 `maxResults` 可选。
- `readCuratedMarkdown(options)` 接收 `RenderCuratedMemoryMarkdownOptions`，可用 `scopes`、`kinds`、`maxItems`、`maxContentChars`、`includeSourceRefs`、`includeTags` 和 `title` 控制导出 Markdown。
- `createMemoryJsonlPlugin(options)` 接收 `MemoryJsonlPluginOptions`；目前只有可选 `pluginId`，默认是 `"memory-jsonl"`。插件只注册 `MEMORY_JSONL_OPERATION_NAMES` 描述符，不绑定具体 `JsonlMemoryStore` 实例。

## 注意事项

- 该插件注册操作描述符；调用方仍然决定实际持久化时使用哪个存储实例。
- `memory.jsonl` 可读写。评审、报告、健康、审计快照、检索和精选 Markdown 操作都是只读描述符。
- 当 JSONL 文件存在阻塞性损坏或最终行不完整时，追加操作会拒绝继续。

## 相关包

- `@guga-agent/plugin-memory-candidates` 提供候选项、治理、检索和渲染逻辑。
- `@guga-agent/core` 提供操作描述符契约。
