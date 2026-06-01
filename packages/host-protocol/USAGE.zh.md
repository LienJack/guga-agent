# @guga-agent/host-protocol 用法

## 用途

`@guga-agent/host-protocol` 定义 runtime、local server、SDK、CLI 和未来 UI clients 共享的可序列化 host protocol。它只包含 DTO 和辅助函数；不运行 agents、不提供 HTTP 服务，也不渲染 UI。

## 导入

```ts
import {
  HOST_PROTOCOL_VERSION,
  createHostEventSequencer,
  createSseEnvelope,
  type HostEvent,
  type RunResource
} from "@guga-agent/host-protocol";
```

## 主要 API

- Host events：`HostEvent`、`HostEventInput`，以及带类型的 run、message、tool、permission、interaction、queue、task、verification、artifact、usage 和 operational event 形态。
- Event helpers：`createHostEventSequencer()`、`hostEventSseName()`、`isTerminalHostEvent()` 和 `HOST_EVENT_SSE_NAME`。
- Resource DTOs：sessions、branches、runs、queued input、interactions、permissions、capabilities、provider health、audit summaries、metrics、operations、tasks、verification attempts、artifacts 和 usage。
- Protocol constants：`HOST_PROTOCOL_VERSION` 和 `HOST_PROTOCOL_FEATURES`。
- SSE helpers：`createSseEnvelope()` 和 `encodeSseEnvelope()`。

## 常见用法

```ts
const sequencer = createHostEventSequencer();
const event = sequencer({
  type: "run.started",
  sessionId: "session-1",
  runId: "run-1",
  input: "hello"
});

const frame = encodeSseEnvelope(createSseEnvelope(event));
```

## 参数说明

- `createHostEventSequencer(options?: { startSeq?: number; now?: () => Date })`：`startSeq` 指定已有事件序号的起点，省略时从 `0` 开始；`now` 可注入时间源，省略时使用当前时间。返回的 `next(event)` 接收 `HostEventInput`，会自动补齐递增 `seq` 和默认 `occurredAt`。
- `HostEventInput`：是 `HostEvent` 去掉 `seq` 与 `occurredAt` 后的输入形态；run 范围事件通常需要 `type`、`sessionId`、`runId`，再加各事件自身字段，例如 `run.started` 需要 `input`，`permission.resolved` 需要 `requestId`、`callId` 和 `decision`。
- `createSseEnvelope(event: HostEvent)`：`event` 必须已经带有 `seq`；返回的 envelope 使用 `String(event.seq)` 作为 `id`，并使用 host event SSE 名称作为 `event`。
- `encodeSseEnvelope(envelope: SseEnvelope)`：将 `id`、`event` 和 JSON 序列化的 `data` 编码为 SSE frame 字符串；传入的 `data` 应保持 JSON-serializable。
- `PermissionResolution`：`decision` 为必填，取 `"allow"` 或 `"deny"`；`remember` 可选，取 `"once"`、`"session"` 或 `"always"`；`reason` 和 `updatedInput` 可选，用于说明决策或替换工具输入。

## 注意事项

- 公共消费者应从包根入口导入。`events.ts` 中的一些内部 event type aliases 会体现在 `HostEvent` union 内，但不会逐个重新导出。
- 保持 protocol objects 可 JSON 序列化。Runtime objects、functions、AbortSignals、child processes 和原始 provider clients 不属于 protocol resources。

## 相关包

- `@guga-agent/host-runtime` 发出这些 resources 和 events。
- `@guga-agent/host-local-server` 通过 HTTP 和 SSE 暴露它们。
- `@guga-agent/host-sdk`、`@guga-agent/host-stdio` 和 `@guga-agent/cli` 消费它们。
