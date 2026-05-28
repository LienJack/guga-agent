import { AgentEventType, type AgentEvent } from "../contracts/events";
import type { DurableEventEnvelope, JsonObject } from "../contracts/persistence";
import type { ResumeInterruptedOperation, ResumeOperationKind, ResumeOperationStatus } from "./resume-report";

type OpenOperation = {
  key: string;
  kind: ResumeOperationKind;
  runId?: string;
  turn?: number;
  eventId: string;
  startedAt: string;
  message: string;
  metadata?: JsonObject;
};

const terminalByKind: Record<ResumeOperationKind, ResumeOperationStatus[]> = {
  run: ["completed", "failed", "cancelled", "timeout"],
  turn: ["completed", "failed", "cancelled", "timeout"],
  model: ["completed", "failed", "cancelled", "timeout"],
  tool: ["completed", "failed", "cancelled", "timeout", "denied"],
  permission: ["completed", "failed", "cancelled", "timeout", "denied"],
  hook: ["completed", "failed", "cancelled", "timeout", "denied"],
  compaction: ["completed", "failed", "cancelled", "timeout"]
};

export function detectInterruptedOperations(events: readonly DurableEventEnvelope[]): ResumeInterruptedOperation[] {
  const open = new Map<string, OpenOperation>();

  for (const envelope of events) {
    const event = envelope.payload as AgentEvent;
    const started = startOperation(envelope, event) ?? genericStartOperation(envelope);
    if (started) {
      open.set(started.key, started);
    }

    for (const terminal of [...terminalOperations(envelope, event), ...genericTerminalOperations(envelope)]) {
      open.delete(terminal.key);
    }
  }

  return [...open.values()].map((operation) => ({
    kind: operation.kind,
    status: "interrupted",
    ...(operation.runId ? { runId: operation.runId } : {}),
    ...(operation.turn !== undefined ? { turn: operation.turn } : {}),
    eventId: operation.eventId,
    startedAt: operation.startedAt,
    message: operation.message,
    allowedActions: allowedActionsFor(operation.kind),
    ...(operation.metadata ? { metadata: operation.metadata } : {})
  }));
}

function startOperation(envelope: DurableEventEnvelope, event: AgentEvent): OpenOperation | undefined {
  switch (event.type) {
    case AgentEventType.RunStarted:
      return operation(envelope, "run", event.runId, undefined, `Run ${event.runId} was started but has no terminal marker`);
    case AgentEventType.ModelRequested:
      return operation(envelope, "model", event.runId, event.turn, `Model request for run ${event.runId} turn ${event.turn} did not finish`);
    case AgentEventType.ToolStarted:
      return operation(envelope, "tool", event.runId, event.turn, `Tool ${event.call.name} started but has no terminal marker`, {
        toolCallId: event.call.id,
        toolName: event.call.name
      });
    case AgentEventType.PermissionRequested:
      return operation(envelope, "permission", event.runId, event.turn, `Permission request for turn ${event.turn} did not resolve`, {
        permissionId: event.request.toolCallId,
        toolName: event.request.subject.toolName
      });
    case AgentEventType.ContextCompactStarted:
      return operation(envelope, "compaction", event.runId, event.turn, `Compaction ${event.projectionId} started but has no terminal marker`, {
        projectionId: event.projectionId
      });
    default:
      return undefined;
  }
}

function genericStartOperation(envelope: DurableEventEnvelope): OpenOperation | undefined {
  switch (envelope.eventType) {
    case "turn.started":
      return operation(envelope, "turn", envelope.runId, envelope.turn, `Turn ${envelope.turn ?? "unknown"} was started but has no terminal marker`);
    case "hook.started": {
      const payload = payloadRecord(envelope);
      const phase = stringValue(payload.phase);
      const pluginId = stringValue(payload.pluginId);
      const hookId = stringValue(payload.hookId);
      return operation(envelope, "hook", envelope.runId, envelope.turn, "Hook started but has no terminal marker", {
        phase,
        pluginId,
        hookId,
        hookKey: hookIdentity(phase, pluginId, hookId, envelope.turn)
      });
    }
    default:
      return undefined;
  }
}

function terminalOperations(envelope: DurableEventEnvelope, event: AgentEvent): Array<{ key: string }> {
  switch (event.type) {
    case AgentEventType.RunFinished:
      return [{ key: key("run", event.runId) }];
    case AgentEventType.ModelResponded:
      return [{ key: key("model", event.runId, event.turn) }];
    case AgentEventType.ModelEvent:
      return isModelTerminal(event.event.type)
        ? [{ key: key("model", event.runId, event.turn) }]
        : [];
    case AgentEventType.ToolCompleted:
    case AgentEventType.ToolFailed:
    case AgentEventType.ToolDenied:
    case AgentEventType.ToolCancelled:
    case AgentEventType.ToolTimeout:
      return [{ key: key("tool", event.runId, event.turn, event.call.id) }];
    case AgentEventType.ToolResult:
      return [{ key: key("tool", event.runId, event.turn, event.call.id) }];
    case AgentEventType.PermissionResolved:
      return [{ key: key("permission", event.runId, event.turn, event.request.toolCallId) }];
    case AgentEventType.ContextCompactCompleted:
    case AgentEventType.ContextCompactFailed:
      return [{ key: key("compaction", event.runId, event.turn, event.projectionId) }];
    case AgentEventType.HookDecision:
    case AgentEventType.ContextHookDecision:
    case AgentEventType.HookFailure:
      return hookTerminal(envelope, event);
    default:
      return [];
  }
}

function genericTerminalOperations(envelope: DurableEventEnvelope): Array<{ key: string }> {
  switch (envelope.eventType) {
    case "turn.finished":
    case "turn.completed":
    case "turn.failed":
    case "turn.cancelled":
    case "turn.timeout":
      return [{ key: key("turn", envelope.runId, envelope.turn ?? "unknown") }];
    case "model.failed":
    case "model.cancelled":
    case "model.timeout":
      return [{ key: key("model", envelope.runId, envelope.turn ?? "unknown") }];
    case "hook.finished":
    case "hook.completed":
    case "hook.failed":
    case "hook.cancelled":
    case "hook.timeout":
    case "hook.denied": {
      const payload = payloadRecord(envelope);
      return [{ key: key("hook", envelope.runId, hookIdentity(stringValue(payload.phase), stringValue(payload.pluginId), stringValue(payload.hookId), envelope.turn)) }];
    }
    default:
      return [];
  }
}

export function interruptionTerminalStatuses(kind: ResumeOperationKind): ResumeOperationStatus[] {
  return terminalByKind[kind];
}

function hookTerminal(envelope: DurableEventEnvelope, event: AgentEvent): Array<{ key: string }> {
  if (event.type === AgentEventType.HookDecision) {
    return [{ key: key("hook", event.runId, event.phase, event.pluginId, event.hookId, event.call.id) }];
  }
  if (event.type === AgentEventType.ContextHookDecision) {
    return [{ key: key("hook", event.runId, event.phase, event.pluginId, event.hookId) }];
  }
  if (event.type !== AgentEventType.HookFailure) {
    return [];
  }
  return [{ key: key("hook", event.runId, event.phase, event.pluginId, event.hookId, envelope.turn ?? "unknown") }];
}

function operation(
  envelope: DurableEventEnvelope,
  kind: ResumeOperationKind,
  runId: string | undefined,
  turn: number | undefined,
  message: string,
  metadata?: JsonObject
): OpenOperation {
  return {
    key: operationKey(envelope, kind, runId, turn, metadata),
    kind,
    ...(runId ? { runId } : {}),
    ...(turn !== undefined ? { turn } : {}),
    eventId: envelope.eventId,
    startedAt: envelope.createdAt,
    message,
    ...(metadata ? { metadata } : {})
  };
}

function operationKey(envelope: DurableEventEnvelope, kind: ResumeOperationKind, runId?: string, turn?: number, metadata?: JsonObject): string {
  if (kind === "tool" && typeof metadata?.toolCallId === "string") {
    return key(kind, runId, turn, metadata.toolCallId);
  }
  if (kind === "permission" && typeof metadata?.permissionId === "string") {
    return key(kind, runId, turn, metadata.permissionId);
  }
  if (kind === "compaction" && typeof metadata?.projectionId === "string") {
    return key(kind, runId, turn, metadata.projectionId);
  }
  if (kind === "hook" && typeof metadata?.hookKey === "string") {
    return key(kind, runId, metadata.hookKey);
  }
  if (kind === "run") {
    return key(kind, runId);
  }
  return key(kind, runId, turn ?? envelope.turn ?? "unknown");
}

function key(kind: ResumeOperationKind, ...parts: Array<string | number | undefined>): string {
  return [kind, ...parts.map((part) => part ?? "unknown")].join(":");
}

function allowedActionsFor(kind: ResumeOperationKind): ResumeInterruptedOperation["allowedActions"] {
  if (kind === "tool" || kind === "model" || kind === "compaction") {
    return ["fork", "mark_abandoned", "repair"];
  }
  return ["resume", "fork", "mark_abandoned"];
}

function isModelTerminal(type: string): boolean {
  return type === "model.finished" || type === "model.provider_error" || type === "provider.timeout" || type === "provider.cancelled";
}

function payloadRecord(envelope: DurableEventEnvelope): Record<string, unknown> {
  return typeof envelope.payload === "object" && envelope.payload !== null ? envelope.payload as Record<string, unknown> : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : "unknown";
}

function hookIdentity(phase: string, pluginId: string, hookId: string, turn: number | undefined): string {
  return [phase, pluginId, hookId, turn ?? "unknown"].join(":");
}
