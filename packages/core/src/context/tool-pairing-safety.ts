import type { CoreMessage, ToolCall } from "../contracts/messages";

export type ToolPairingDecision =
  | {
      type: "valid";
      reason: string;
      batchId: string;
      retainedToolCallIds: string[];
      snippedToolCallIds: string[];
    }
  | {
      type: "repair";
      reason: string;
      batchId: string;
      retainedToolCallIds: string[];
      snippedToolCallIds: string[];
      syntheticResults: string[];
    }
  | {
      type: "refuse";
      reason: string;
      batchId?: string;
      retainedToolCallIds: string[];
      snippedToolCallIds: string[];
    };

export type ToolPairingSafetyResult = {
  messages: CoreMessage[];
  decisions: ToolPairingDecision[];
};

export function toolPairingDecisionCode(decision: ToolPairingDecision): "TOOL_PAIRING_VALID" | "TOOL_PAIRING_REPAIRED" | "TOOL_PAIRING_REFUSED" {
  if (decision.type === "repair") {
    return "TOOL_PAIRING_REPAIRED";
  }
  if (decision.type === "refuse") {
    return "TOOL_PAIRING_REFUSED";
  }
  return "TOOL_PAIRING_VALID";
}

export function ensureToolPairingSafety(messages: readonly CoreMessage[]): ToolPairingSafetyResult {
  const next = structuredClone(messages) as CoreMessage[];
  const decisions: ToolPairingDecision[] = [];
  const openCalls = new Map<string, { call: ToolCall; batchId: string; assistantIndex: number }>();

  for (let index = 0; index < next.length; index += 1) {
    const message = next[index];
    if (!message) {
      continue;
    }
    if (message.role === "assistant" && "toolCalls" in message) {
      const batchId = `message-${index}`;
      for (const call of message.toolCalls) {
        openCalls.set(call.id, { call, batchId, assistantIndex: index });
      }
      decisions.push({
        type: "valid",
        reason: "assistant tool call batch is tracked as an indivisible pairing unit",
        batchId,
        retainedToolCallIds: message.toolCalls.map((call) => call.id),
        snippedToolCallIds: []
      });
      continue;
    }

    if (message.role !== "tool") {
      continue;
    }

    const call = openCalls.get(message.toolCallId);
    if (!call) {
      decisions.push({
        type: "refuse",
        reason: `orphan tool result has no matching assistant tool call: ${message.toolCallId}`,
        retainedToolCallIds: [message.toolCallId],
        snippedToolCallIds: []
      });
      continue;
    }

    openCalls.delete(message.toolCallId);
  }

  const incompleteByBatch = groupOpenCalls(openCalls);
  for (const [batchId, calls] of incompleteByBatch) {
    const assistant = next[calls[0]?.assistantIndex ?? -1];
    if (!assistant || assistant.role !== "assistant" || !("toolCalls" in assistant)) {
      continue;
    }

    const syntheticResults = calls.map(({ call }) => call.id);
    for (const { call } of calls) {
      next.push({
        role: "tool",
        toolCallId: call.id,
        name: call.name,
        content: "TOOL_RESULT_SNIPPED: Tool result was omitted to preserve tool call/result pairing.",
        isError: true
      });
    }
    decisions.push({
      type: "repair",
      reason: "pending assistant tool calls received synthetic placeholder results",
      batchId,
      retainedToolCallIds: assistant.toolCalls.map((call) => call.id),
      snippedToolCallIds: syntheticResults,
      syntheticResults
    });
  }

  return { messages: next, decisions };
}

function groupOpenCalls(openCalls: Map<string, { call: ToolCall; batchId: string; assistantIndex: number }>) {
  const grouped = new Map<string, Array<{ call: ToolCall; assistantIndex: number }>>();
  for (const value of openCalls.values()) {
    grouped.set(value.batchId, [...(grouped.get(value.batchId) ?? []), { call: value.call, assistantIndex: value.assistantIndex }]);
  }
  return grouped;
}
