import type { ProjectionLedgerEntry } from "../contracts/context";
import { AgentEventType, type AgentEvent } from "../contracts/events";
import type { CoreMessage } from "../contracts/messages";
import type {
  DurableEventEnvelope,
  EventStore,
  JsonValue,
  ProviderInputRecord,
  ReplayDiagnostic,
  SessionStore,
  StoreCorruptionDiagnostic
} from "../contracts/persistence";
import { ensureToolPairingSafety, toolPairingDecisionCode } from "../context/tool-pairing-safety";
import { detectInterruptedOperations } from "./interruption-detector";
import type { ResumeReportResult } from "./resume-report";
import { buildSessionTree } from "./session-tree";

export type ResumeSessionFromStoresOptions = {
  sessionId: string;
  branchId?: string;
  throughEventId?: string;
  streamId?: string;
};

export async function resumeSessionFromStores(
  stores: { eventStore: EventStore; sessionStore: SessionStore },
  options: ResumeSessionFromStoresOptions
): Promise<ResumeReportResult> {
  const streamId = options.streamId ?? `session/${options.sessionId}`;
  const read = await stores.eventStore.readStream(streamId);
  if (!read.ok) {
    const diagnostics = read.diagnostics;
    return {
      ok: false,
      status: read.status === "not_found" ? "not_found" : read.status === "unavailable" ? "unavailable" : "repair_required",
      diagnostics
    };
  }

  const blockingCorruption = (read.diagnostics ?? []).filter((diagnostic) => !diagnostic.recoverable);
  if (blockingCorruption.length > 0) {
    return {
      ok: false,
      status: "repair_required",
      diagnostics: blockingCorruption
    };
  }

  const tree = await buildSessionTree(stores.sessionStore, read.events, options);
  if (!tree.ok) {
    return {
      ok: false,
      status: tree.status,
      diagnostics: tree.diagnostics
    };
  }

  const replay = replayVisibleSession(tree.projection.visibleEvents);
  const corruptionDiagnostics = read.diagnostics ?? [];
  const diagnostics: Array<ReplayDiagnostic | StoreCorruptionDiagnostic> = [
    ...corruptionDiagnostics,
    ...tree.projection.diagnostics,
    ...replay.diagnostics
  ];

  if (diagnostics.some((diagnostic) => "severity" in diagnostic && diagnostic.severity === "error")) {
    return {
      ok: false,
      status: "repair_required",
      diagnostics
    };
  }

  return {
    ok: true,
    session: tree.projection.session,
    branches: tree.projection.branches,
    activeLeaf: tree.projection.activeLeaf,
    conversation: replay.conversation,
    projectionLedger: replay.projectionLedger,
    interrupted: detectInterruptedOperations(tree.projection.visibleEvents),
    diagnostics
  };
}

export type ReplayedSessionState = {
  conversation: CoreMessage[];
  projectionLedger: ProjectionLedgerEntry[];
  providerInputs: ProviderInputRecord[];
  artifactRefs: DurableEventEnvelope["artifactRefs"];
  diagnostics: ReplayDiagnostic[];
};

export function replayVisibleSession(events: readonly DurableEventEnvelope[]): ReplayedSessionState {
  const rawMessages = rebuildMessagesFromEvents(events);
  const pairing = ensureToolPairingSafety(rawMessages);
  const projectionLedger = rebuildProjectionLedger(events);
  const diagnostics: ReplayDiagnostic[] = pairing.decisions
    .filter((decision) => decision.type !== "valid")
    .map((decision) => ({
      severity: decision.type === "refuse" ? "error" : "warning",
      code: toolPairingDecisionCode(decision),
      message: decision.reason,
      metadata: {
        batchId: decision.batchId ?? null,
        retainedToolCallIds: decision.retainedToolCallIds,
        snippedToolCallIds: decision.snippedToolCallIds
      }
    }));

  return {
    conversation: pairing.messages,
    projectionLedger,
    providerInputs: providerInputs(events),
    artifactRefs: events.flatMap((event) => event.artifactRefs ?? []),
    diagnostics
  };
}

function rebuildMessagesFromEvents(events: readonly DurableEventEnvelope[]): CoreMessage[] {
  const messages: CoreMessage[] = [];
  const toolCallEventIds = new Set<string>();

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
        messages.push({ role: "assistant", ...(event.response.content ? { content: event.response.content } : {}), toolCalls: event.response.toolCalls });
        toolCallEventIds.add(envelope.eventId);
      }
      continue;
    }
    if (event.type === AgentEventType.ToolResult || event.type === AgentEventType.ToolCompleted || event.type === AgentEventType.ToolFailed || event.type === AgentEventType.ToolDenied || event.type === AgentEventType.ToolCancelled || event.type === AgentEventType.ToolTimeout) {
      messages.push(toToolMessage(event.call, event.result));
    }
  }

  if (toolCallEventIds.size === 0) {
    appendStartedToolCallsWithoutResponses(messages, events);
  }
  return messages;
}

function appendStartedToolCallsWithoutResponses(messages: CoreMessage[], events: readonly DurableEventEnvelope[]): void {
  const completed = new Set<string>();
  for (const envelope of events) {
    const event = envelope.payload as AgentEvent;
    if (event.type === AgentEventType.ToolResult || event.type === AgentEventType.ToolCompleted || event.type === AgentEventType.ToolFailed || event.type === AgentEventType.ToolDenied || event.type === AgentEventType.ToolCancelled || event.type === AgentEventType.ToolTimeout) {
      completed.add(event.call.id);
    }
  }

  const pending = events
    .map((envelope) => envelope.payload as AgentEvent)
    .filter((event): event is Extract<AgentEvent, { type: typeof AgentEventType.ToolStarted }> => event.type === AgentEventType.ToolStarted)
    .filter((event) => !completed.has(event.call.id))
    .map((event) => event.call);

  if (pending.length > 0) {
    messages.push({ role: "assistant", toolCalls: pending });
  }
}

function rebuildProjectionLedger(events: readonly DurableEventEnvelope[]): ProjectionLedgerEntry[] {
  return events.flatMap((envelope) => {
    const event = envelope.payload as AgentEvent;
    if (event.type !== AgentEventType.ContextProjectionCreated) {
      return [];
    }
    const projection = event.projection;
    const entry: ProjectionLedgerEntry = {
      id: `ledger-${projection.id}`,
      runId: projection.runId,
      turn: projection.turn,
      projectionId: projection.id,
      sourceRefs: projection.sourceDescriptors.flatMap((source) => source.references ?? []),
      sourceDescriptors: projection.sourceDescriptors.map(({ metadata: _metadata, ...descriptor }) => descriptor),
      policyDecisions: projection.policyDecisions,
      ...(projection.hash ? { projectionHash: projection.hash } : {})
    };
    return [entry];
  });
}

function providerInputs(events: readonly DurableEventEnvelope[]): ProviderInputRecord[] {
  const projections = new Map<string, Extract<AgentEvent, { type: typeof AgentEventType.ContextProjectionCreated }>["projection"]>();
  for (const envelope of events) {
    const event = envelope.payload as AgentEvent;
    if (event.type === AgentEventType.ContextProjectionCreated) {
      projections.set(event.projection.id, event.projection);
    }
  }

  return events.flatMap((envelope) => {
    const event = envelope.payload as AgentEvent;
    if (event.type !== AgentEventType.ProviderInputCommitted) {
      return [];
    }
    const projection = projections.get(event.projectionId);
    if (!projection) {
      return [];
    }
    return [{
      projectionId: projection.id,
      runId: event.runId,
      turn: event.turn,
      ...(projection.provider ? { provider: projection.provider } : {}),
      messages: projection.messages,
      tools: projection.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: toJsonValue(tool.inputSchema),
        effect: tool.effect
      })),
      sourceDescriptors: projection.sourceDescriptors.map(({ metadata: _metadata, ...descriptor }) => descriptor),
      policyDecisions: projection.policyDecisions,
      ...(event.projectionHash ?? projection.hash ? { projectionHash: event.projectionHash ?? projection.hash } : {}),
      artifactRefs: envelope.artifactRefs ?? []
    }];
  });
}

function toJsonValue(value: unknown): JsonValue {
  return structuredClone(value) as JsonValue;
}

function toToolMessage(
  call: Extract<AgentEvent, { type: typeof AgentEventType.ToolResult }>["call"],
  result: Extract<AgentEvent, { type: typeof AgentEventType.ToolResult }>["result"]
): CoreMessage {
  if (result.ok) {
    return {
      role: "tool",
      toolCallId: call.id,
      name: call.name,
      content: result.content,
      isError: false
    };
  }
  return {
    role: "tool",
    toolCallId: call.id,
    name: call.name,
    content: `${result.error.code}: ${result.error.message}`,
    isError: true
  };
}
