# @guga-agent/plugin-session-jsonl 用法

## 用途

`@guga-agent/plugin-session-jsonl` 提供 local-first 的核心 `EventStore` 和 `SessionStore` JSONL 实现。它会在 host 提供的 root directory 下持久化 durable event envelope 和 session tree fact。

## 导入

```ts
import {
  JsonlEventStore,
  JsonlSessionStore,
  createJsonlSessionPlugin
} from "@guga-agent/plugin-session-jsonl";
```

## 主要 API

- `createJsonlSessionPlugin(options)`: 同时注册 JSONL event store 和 session store。
- `JsonlEventStore`: append-only durable event stream store。
- `JsonlSessionStore`: session、branch 和 active-leaf fact store。
- 类型：`JsonlSessionPluginOptions`、`JsonlEventStoreOptions` 和 `JsonlSessionStoreOptions`。

## 常见用法

```ts
const runtime = createAgentRuntime({
  plugins: [
    createJsonlSessionPlugin({
      rootDir: ".guga/sessions"
    })
  ]
});
```

高级 host 可以直接实例化 store：

```ts
const eventStore = new JsonlEventStore({ rootDir: ".guga/sessions/events" });
const sessionStore = new JsonlSessionStore({ rootDir: ".guga/sessions/sessions" });
```

## 参数说明

- `createJsonlSessionPlugin(options)` 使用 `JsonlSessionPluginOptions`。`rootDir` 为必填字段，作为 JSONL event/session store 的根目录；`pluginId` 可选；`upcasters` 可选，用于事件读取时的 schema 升级；`now` 可选，用于 session fact 时间戳。
- `new JsonlEventStore(options)` 使用 `JsonlEventStoreOptions`。`rootDir` 必填；`upcasters` 可选，传给 durable event upcast 流程。
- `JsonlEventStore.append(event, options)` 的 `event` 为必填 `DurableEventEnvelope`；`options` 使用 core 的 `EventAppendOptions`，常见用途是传入 expected revision 或 idempotency 信息。
- `JsonlEventStore.readStream(streamId, options)` 的 `streamId` 必填；`options` 使用 core 的 `EventStreamReadOptions`，可用于限制读取范围或指定目标 schema version。
- `new JsonlSessionStore(options)` 使用 `JsonlSessionStoreOptions`。`rootDir` 必填；`now` 可选，默认返回当前 ISO 时间字符串。

## 注意事项

- Event record 是 append-only durable envelope，并支持 expected revision 和 idempotency。
- 读取会校验 revision order 和 hash-chain continuity。
- 部分最终行可以在读取时报告为可恢复的 tail diagnostic，但 append 会拒绝继续写入带 partial tail 的 stream。
- 进程内 append queue 不是跨进程 lock。
- 该包不实现 remote sync、search、multi-writer conflict resolution 或 curated memory。

## 相关包

- `@guga-agent/core` 定义持久化契约。
- `@guga-agent/plugin-replay-audit` 读取这些 store 以进行 replay。
