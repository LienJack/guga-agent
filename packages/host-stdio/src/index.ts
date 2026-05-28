import type { HostEvent } from "@guga-agent/host-protocol";
import type { HostClient } from "@guga-agent/host-sdk";

export type StdioCommand =
  | { type: "new_session"; title?: string }
  | { type: "prompt"; sessionId: string; input: string; providerId?: string; modelId?: string; maxTurns?: number }
  | { type: "steer"; runId: string; text: string }
  | { type: "follow_up"; runId: string; text: string }
  | { type: "abort"; runId: string }
  | { type: "get_state"; sessionId?: string; runId?: string }
  | { type: "switch_session"; sessionId: string; branchId?: string }
  | { type: "fork"; sessionId: string; parentBranchId?: string; createdFromRunId?: string; summary?: string }
  | { type: "get_last_assistant_text"; runId: string }
  | { type: "compact"; sessionId: string; runId?: string };

export type StdioCommandResult =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string } };

export type PiCompatibleEvent = Record<string, unknown> & {
  type: string;
};

export function parseJsonLine(line: string): StdioCommand {
  return JSON.parse(line) as StdioCommand;
}

export function encodeJsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

export function hostEventToPiCompatibleEvents(event: HostEvent): PiCompatibleEvent[] {
  switch (event.type) {
    case "run.started":
      return [
        { type: "agent_start", session_id: event.sessionId, run_id: event.runId },
        { type: "turn_start", session_id: event.sessionId, run_id: event.runId, input: event.input }
      ];
    case "run.completed":
      return [{ type: "agent_end", session_id: event.sessionId, run_id: event.runId, status: "completed", final_text: event.finalAnswer }];
    case "run.failed":
      return [{ type: "agent_end", session_id: event.sessionId, run_id: event.runId, status: "failed", error: event.error }];
    case "message.delta":
      return [{ type: "message_update", session_id: event.sessionId, run_id: event.runId, message_id: event.messageId, text: event.text }];
    case "message.completed":
      return [{ type: "message_end", session_id: event.sessionId, run_id: event.runId, message_id: event.messageId }];
    case "tool.started":
      return [{ type: "tool_execution_start", session_id: event.sessionId, run_id: event.runId, call_id: event.callId, name: event.name, input: event.input }];
    case "tool.completed":
      return [{ type: "tool_execution_end", session_id: event.sessionId, run_id: event.runId, call_id: event.callId, name: event.name, output: event.output, status: "completed" }];
    case "tool.failed":
      return [{ type: "tool_execution_end", session_id: event.sessionId, run_id: event.runId, call_id: event.callId, name: event.name, error: event.error, status: "failed" }];
    case "queue.updated":
      return [{ type: "queue_update", session_id: event.sessionId, run_id: event.runId, pending: event.pending }];
    case "context.compacted":
      return [{ type: "compaction_end", session_id: event.sessionId, run_id: event.runId, boundary_id: event.boundaryId, summary: event.summary }];
    case "interaction.requested":
      return [{ type: "extension_ui_request", session_id: event.sessionId, run_id: event.runId, request_id: event.requestId, request: event.request }];
    case "interaction.resolved":
      return [{ type: "extension_ui_response", session_id: event.sessionId, run_id: event.runId, request_id: event.requestId, response: event.response }];
    case "permission.requested":
      return [{ type: "extension_ui_request", session_id: event.sessionId, run_id: event.runId, request_id: event.requestId, request: { kind: "confirm", message: event.reason ?? `Allow ${event.toolName}?`, toolName: event.toolName, input: event.input } }];
    case "permission.resolved":
      return [{ type: "extension_ui_response", session_id: event.sessionId, run_id: event.runId, request_id: event.requestId, response: event.decision }];
    case "artifact.created":
      return [{ type: "artifact_created", session_id: event.sessionId, run_id: event.runId, artifact_id: event.artifactId, name: event.name }];
    case "usage.recorded":
      return [{ type: "usage_update", session_id: event.sessionId, run_id: event.runId, total_tokens: event.totalTokens, cost_usd: event.costUsd }];
    default:
      return [];
  }
}

export async function handleStdioCommand(client: HostClient, command: StdioCommand): Promise<StdioCommandResult> {
  try {
    switch (command.type) {
      case "new_session":
        return ok(await client.createSession({ ...(command.title ? { title: command.title } : {}) }));
      case "prompt":
        return ok(await client.startRun(command.sessionId, {
          input: command.input,
          ...(command.providerId ? { providerId: command.providerId } : {}),
          ...(command.modelId ? { modelId: command.modelId } : {}),
          ...(command.maxTurns !== undefined ? { maxTurns: command.maxTurns } : {})
        }));
      case "steer":
        return ok(await client.sendRunInput(command.runId, { mode: "steer", text: command.text }));
      case "follow_up":
        return ok(await client.sendRunInput(command.runId, { mode: "follow_up", text: command.text }));
      case "abort":
        return ok(await client.abortRun(command.runId));
      case "get_state":
        if (command.runId) {
          return ok(await client.getRun(command.runId));
        }
        if (command.sessionId) {
          return ok(await client.getSession(command.sessionId));
        }
        return failure("BAD_COMMAND", "get_state requires sessionId or runId");
      case "switch_session":
        return ok(await client.resumeSession(command.sessionId, { ...(command.branchId ? { branchId: command.branchId } : {}) }));
      case "fork":
        return ok(await client.forkSession(command.sessionId, {
          ...(command.parentBranchId ? { parentBranchId: command.parentBranchId } : {}),
          ...(command.createdFromRunId ? { createdFromRunId: command.createdFromRunId } : {}),
          ...(command.summary ? { summary: command.summary } : {})
        }));
      case "get_last_assistant_text": {
        const events = await client.listRunEvents(command.runId);
        const text = events
          .filter((event) => event.type === "message.delta")
          .map((event) => event.text)
          .join("");
        return ok({ text });
      }
      case "compact":
        return failure("UNSUPPORTED_COMMAND", "compact is reserved for the host protocol but is not implemented by this adapter yet");
      default:
        return failure("UNKNOWN_COMMAND", "Unknown stdio command");
    }
  } catch (error) {
    return failure("COMMAND_FAILED", error instanceof Error ? error.message : "Command failed");
  }
}

function ok(data: unknown): StdioCommandResult {
  return { ok: true, data };
}

function failure(code: string, message: string): StdioCommandResult {
  return { ok: false, error: { code, message } };
}
