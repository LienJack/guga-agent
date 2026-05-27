export const HOST_EVENT_SSE_NAME = "guga.host-event";

export type HostEventType =
  | "run.started"
  | "run.completed"
  | "run.failed"
  | "message.delta"
  | "message.completed"
  | "tool.started"
  | "tool.completed"
  | "tool.failed"
  | "permission.requested"
  | "permission.resolved"
  | "context.compacted"
  | "artifact.created"
  | "usage.recorded";

type HostEventBase<Type extends HostEventType> = {
  type: Type;
  seq: number;
  occurredAt: string;
};

type RunScopedEvent<Type extends HostEventType> = HostEventBase<Type> & {
  sessionId: string;
  runId: string;
};

export type RunStartedHostEvent = RunScopedEvent<"run.started"> & {
  input: string;
};

export type RunCompletedHostEvent = RunScopedEvent<"run.completed"> & {
  finalAnswer?: string;
};

export type RunFailedHostEvent = RunScopedEvent<"run.failed"> & {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type MessageDeltaHostEvent = RunScopedEvent<"message.delta"> & {
  messageId: string;
  role: "assistant";
  text: string;
};

export type MessageCompletedHostEvent = RunScopedEvent<"message.completed"> & {
  messageId: string;
  role: "assistant";
};

export type ToolStartedHostEvent = RunScopedEvent<"tool.started"> & {
  callId: string;
  name: string;
  input?: unknown;
};

export type ToolCompletedHostEvent = RunScopedEvent<"tool.completed"> & {
  callId: string;
  name: string;
  output?: unknown;
  artifactIds?: string[];
};

export type ToolFailedHostEvent = RunScopedEvent<"tool.failed"> & {
  callId: string;
  name: string;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type PermissionRequestedHostEvent = RunScopedEvent<"permission.requested"> & {
  requestId: string;
  callId: string;
  toolName: string;
  input?: unknown;
  reason?: string;
};

export type PermissionResolvedHostEvent = RunScopedEvent<"permission.resolved"> & {
  requestId: string;
  callId: string;
  decision: "allow" | "deny";
  remember?: "once" | "session" | "always";
  reason?: string;
};

export type ContextCompactedHostEvent = RunScopedEvent<"context.compacted"> & {
  boundaryId: string;
  trigger: string;
  summary?: string;
};

export type ArtifactCreatedHostEvent = RunScopedEvent<"artifact.created"> & {
  artifactId: string;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
};

export type UsageRecordedHostEvent = RunScopedEvent<"usage.recorded"> & {
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
};

export type HostEvent =
  | RunStartedHostEvent
  | RunCompletedHostEvent
  | RunFailedHostEvent
  | MessageDeltaHostEvent
  | MessageCompletedHostEvent
  | ToolStartedHostEvent
  | ToolCompletedHostEvent
  | ToolFailedHostEvent
  | PermissionRequestedHostEvent
  | PermissionResolvedHostEvent
  | ContextCompactedHostEvent
  | ArtifactCreatedHostEvent
  | UsageRecordedHostEvent;

export type HostEventInput<Event extends HostEvent = HostEvent> = Omit<Event, "seq" | "occurredAt"> & {
  occurredAt?: string;
};

export type HostEventSequencer = {
  next<Event extends HostEvent>(event: HostEventInput<Event>): Event;
  currentSeq(): number;
};

export function createHostEventSequencer(options: {
  startSeq?: number;
  now?: () => Date;
} = {}): HostEventSequencer {
  let seq = options.startSeq ?? 0;
  const now = options.now ?? (() => new Date());

  return {
    next<Event extends HostEvent>(event: HostEventInput<Event>): Event {
      seq += 1;
      return {
        ...event,
        seq,
        occurredAt: event.occurredAt ?? now().toISOString()
      } as Event;
    },
    currentSeq() {
      return seq;
    }
  };
}

export function isTerminalHostEvent(event: HostEvent): event is RunCompletedHostEvent | RunFailedHostEvent {
  return event.type === "run.completed" || event.type === "run.failed";
}

export function hostEventSseName(_event: HostEvent): string {
  return HOST_EVENT_SSE_NAME;
}
