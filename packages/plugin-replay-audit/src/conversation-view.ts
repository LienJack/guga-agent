import { AgentEventType, type AgentEvent, type CoreMessage, type DurableEventEnvelope, type ReplayDiagnostic, type ReplayConversationResult } from "@guga-agent/core";

export type ConversationViewResult = ReplayConversationResult;

export function buildConversationView(events: readonly DurableEventEnvelope[]): ConversationViewResult {
  const messages = rebuildMessagesFromEvents(events);
  const completedToolCallIds = completedToolCalls(events);
  const danglingAssistantToolCalls = events
    .map((envelope) => envelope.payload as AgentEvent)
    .filter((event): event is Extract<AgentEvent, { type: typeof AgentEventType.ModelResponded }> => event.type === AgentEventType.ModelResponded)
    .flatMap((event) => event.response.type === "tool_calls"
      ? event.response.toolCalls
        .filter((call) => !completedToolCallIds.has(call.id))
        .map((call) => ({ event, call }))
      : []);
  const danglingToolCalls = events
    .map((envelope) => envelope.payload as AgentEvent)
    .filter((event): event is Extract<AgentEvent, { type: typeof AgentEventType.ToolStarted }> => event.type === AgentEventType.ToolStarted)
    .filter((event) => !completedToolCallIds.has(event.call.id));

  const assistantDiagnostics: ReplayDiagnostic[] = danglingAssistantToolCalls.map(({ event, call }) => ({
    severity: "warning",
    code: "TOOL_PAIRING_REPAIRED",
    message: `Assistant tool call ${call.id} had no terminal tool result and was replaced with a replay diagnostic observation`,
    metadata: {
      toolCallId: call.id,
      toolName: call.name,
      runId: event.runId,
      turn: event.turn
    }
  }));
  const diagnostics: ReplayDiagnostic[] = [...assistantDiagnostics];
  const toolStartDiagnostics: ReplayDiagnostic[] = danglingToolCalls.map((event) => ({
    severity: "warning",
    code: "TOOL_PAIRING_REPAIRED",
    message: `Tool call ${event.call.id} started without a terminal result and was replaced with a replay diagnostic observation`,
    metadata: {
      toolCallId: event.call.id,
      toolName: event.call.name,
      runId: event.runId,
      turn: event.turn
    }
  }));
  diagnostics.push(...toolStartDiagnostics);

  for (const { call } of danglingAssistantToolCalls) {
    messages.push({
      role: "tool",
      toolCallId: call.id,
      name: call.name,
      content: `Replay diagnostic: tool call ${call.id} did not record a terminal tool result.`,
      isError: true
    });
  }
  for (const event of danglingToolCalls) {
    if (danglingAssistantToolCalls.some(({ call }) => call.id === event.call.id)) {
      continue;
    }
    messages.push({
      role: "tool",
      toolCallId: event.call.id,
      name: event.call.name,
      content: `Replay diagnostic: tool call ${event.call.id} did not record a terminal tool result.`,
      isError: true
    });
  }

  return { ok: true, messages, diagnostics };
}

function rebuildMessagesFromEvents(events: readonly DurableEventEnvelope[]): CoreMessage[] {
  const messages: CoreMessage[] = [];
  for (const envelope of events) {
    const event = envelope.payload as AgentEvent;
    if (event.type === AgentEventType.RunStarted) {
      messages.push({ role: "user", content: event.input });
      continue;
    }
    if (event.type === AgentEventType.ModelResponded) {
      if (event.response.type === "final") {
        messages.push({ role: "assistant", content: event.response.content });
      } else if (event.response.type === "tool_calls") {
        const completed = completedToolCalls(events);
        const safeToolCalls = event.response.toolCalls.filter((call) => completed.has(call.id));
        if (safeToolCalls.length > 0) {
          messages.push({
          role: "assistant",
          ...(event.response.content ? { content: event.response.content } : {}),
            toolCalls: safeToolCalls
          });
        } else if (event.response.content) {
          messages.push({ role: "assistant", content: event.response.content });
        }
      } else {
        messages.push({ role: "assistant", content: `Provider failure: ${event.response.error.message}` });
      }
      continue;
    }
    if (isToolTerminal(event)) {
      messages.push({
        role: "tool",
        toolCallId: event.call.id,
        name: event.call.name,
        content: event.result.ok ? event.result.content : event.result.error.message,
        isError: !event.result.ok
      });
    }
  }
  return messages;
}

function completedToolCalls(events: readonly DurableEventEnvelope[]): Set<string> {
  const completed = new Set<string>();
  for (const envelope of events) {
    const event = envelope.payload as AgentEvent;
    if (isToolTerminal(event)) {
      completed.add(event.call.id);
    }
  }
  return completed;
}

function isToolTerminal(event: AgentEvent): event is Extract<AgentEvent, { type:
  | typeof AgentEventType.ToolResult
  | typeof AgentEventType.ToolCompleted
  | typeof AgentEventType.ToolFailed
  | typeof AgentEventType.ToolDenied
  | typeof AgentEventType.ToolCancelled
  | typeof AgentEventType.ToolTimeout
}> {
  return event.type === AgentEventType.ToolResult
    || event.type === AgentEventType.ToolCompleted
    || event.type === AgentEventType.ToolFailed
    || event.type === AgentEventType.ToolDenied
    || event.type === AgentEventType.ToolCancelled
    || event.type === AgentEventType.ToolTimeout;
}
