# @guga-agent/host-stdio Usage

## Purpose

`@guga-agent/host-stdio` provides JSONL command and event adapter helpers for a Pi-compatible stdio-style integration over a `HostClient`.

It is an adapter library, not a standalone process: the package has no `bin` entry and does not own a read loop by itself.

## Import

```ts
import {
  encodeJsonLine,
  handleStdioCommand,
  hostEventToPiCompatibleEvents,
  parseJsonLine
} from "@guga-agent/host-stdio";
```

## Main APIs

- `parseJsonLine(line)`: parses one JSON command line into `StdioCommand`.
- `encodeJsonLine(value)`: serializes a result or event as a newline-terminated JSON string.
- `handleStdioCommand(client, command)`: dispatches commands through an injected `HostClient`.
- `hostEventToPiCompatibleEvents(event)`: maps host protocol events into Pi-compatible event names.
- Types: `StdioCommand`, `StdioCommandResult`, and `PiCompatibleEvent`.

## Common Usage

```ts
const command = parseJsonLine(line);
const result = await handleStdioCommand(hostClient, command);
stdout.write(encodeJsonLine(result));
```

Supported command types include `new_session`, `prompt`, `steer`, `follow_up`, `abort`, `get_state`, `get_messages`, `switch_session`, `fork`, `respond_interaction`, `extension_ui_response`, and `get_last_assistant_text`.

## Parameters

- `parseJsonLine(line)`: `line` is required and must be one complete JSON object for a `StdioCommand`.
- `encodeJsonLine(value)`: `value` is required and may be a command result or Pi-compatible event payload. The return value always includes a trailing newline.
- `handleStdioCommand(client, command)`: `client` is a required `HostClient`. `command.type` is required and determines the other required fields: `prompt` needs `sessionId` and `input`; `steer`, `follow_up`, `abort`, `get_messages`, and `get_last_assistant_text` need `runId`; `switch_session` and `fork` need `sessionId`; interaction responses need `requestId` or `request_id`.
- `StdioCommand` optional fields: `title`, `providerId`, `modelId`, `maxTurns`, `branchId`, `parentBranchId`, `createdFromRunId`, `summary`, `response`, `sessionId`, and `runId` are optional only on the command variants that declare them.
- `hostEventToPiCompatibleEvents(event)`: `event` is a required host protocol event. Some host events map to multiple Pi-compatible events, and unsupported event types return an empty array.

## Notes

- `compact` is reserved in the command type but currently returns `UNSUPPORTED_COMMAND`.
- `abort` delegates to the host client's abort path.
- Event mapping is lossy by design because it targets a Pi-compatible event vocabulary.

## Related Packages

- `@guga-agent/host-sdk` supplies the `HostClient`.
- `@guga-agent/host-protocol` supplies host event types.
