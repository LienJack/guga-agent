# @guga-agent/host-stdio 用法

## 用途

`@guga-agent/host-stdio` 为基于 `HostClient` 的 Pi-compatible stdio 风格集成提供 JSONL command 和 event adapter helpers。

它是 adapter library，不是独立进程：该包没有 `bin` 入口，也不自行拥有 read loop。

## 导入

```ts
import {
  encodeJsonLine,
  handleStdioCommand,
  hostEventToPiCompatibleEvents,
  parseJsonLine
} from "@guga-agent/host-stdio";
```

## 主要 API

- `parseJsonLine(line)`：将一行 JSON command 解析为 `StdioCommand`。
- `encodeJsonLine(value)`：将 result 或 event 序列化为以换行结尾的 JSON 字符串。
- `handleStdioCommand(client, command)`：通过注入的 `HostClient` 分发 commands。
- `hostEventToPiCompatibleEvents(event)`：将 host protocol events 映射为 Pi-compatible event names。
- Types：`StdioCommand`、`StdioCommandResult` 和 `PiCompatibleEvent`。

## 常见用法

```ts
const command = parseJsonLine(line);
const result = await handleStdioCommand(hostClient, command);
stdout.write(encodeJsonLine(result));
```

支持的 command types 包括 `new_session`、`prompt`、`steer`、`follow_up`、`abort`、`get_state`、`get_messages`、`switch_session`、`fork`、`respond_interaction`、`extension_ui_response` 和 `get_last_assistant_text`。

## 参数说明

- `parseJsonLine(line: string)`：`line` 必须是一个 JSON 字符串，解析结果按 `StdioCommand` 处理；此函数不做 schema 校验，调用方应保证 command shape 正确。
- `encodeJsonLine(value: unknown)`：`value` 可以是 result 或 event；返回值总是 JSON 字符串加一个换行，适合直接写入 stdout。
- `handleStdioCommand(client, command)`：`client` 必须实现 `HostClient`；`command.type` 决定分发路径，返回 `StdioCommandResult`，成功时为 `{ ok: true, data }`，失败时为 `{ ok: false, error }`。
- `StdioCommand`：`new_session` 可带 `title`；`prompt` 需要 `sessionId` 和 `input`，可带 `providerId`、`modelId`、`maxTurns`；`steer` 和 `follow_up` 需要 `runId`、`text`；`abort`、`get_messages`、`get_last_assistant_text` 需要 `runId`；`get_state` 需要 `sessionId` 或 `runId`；`switch_session` 需要 `sessionId`，可带 `branchId`；`fork` 需要 `sessionId`，可带 `parentBranchId`、`createdFromRunId`、`summary`。
- Interaction commands：`respond_interaction` 使用 `requestId` 和可选 `response`；`extension_ui_response` 使用 Pi-compatible 的 `request_id` 和可选 `response`。
- `hostEventToPiCompatibleEvents(event: HostEvent)`：`event` 必须是 host protocol event；无法映射到 Pi-compatible vocabulary 的事件会返回空数组。

## 注意事项

- `compact` 在 command type 中保留，但目前返回 `UNSUPPORTED_COMMAND`。
- `abort` 委托给 host client 的 abort path。
- Event mapping 按设计是有损的，因为它面向 Pi-compatible event vocabulary。

## 相关包

- `@guga-agent/host-sdk` 提供 `HostClient`。
- `@guga-agent/host-protocol` 提供 host event types。
