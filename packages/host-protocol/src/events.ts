import type {
  CodeTaskCompletionEvidenceResource,
  CodeTaskPlanResource,
  CodeTaskStateResource,
  CodeTaskTerminalReasonResource,
  InteractionRequest,
  QueuedRunInputSummaryResource,
  VerificationAttemptResource
} from "./resources";

export const HOST_EVENT_SSE_NAME = "guga.host-event";

export type HostEventType =
  | "run.started"
  | "run.completed"
  | "run.failed"
  | "run.cancelled"
  | "task.created"
  | "task.phase_changed"
  | "task.completed"
  | "task.blocked"
  | "task.failed"
  | "task.cancelled"
  | "verification.started"
  | "verification.completed"
  | "message.delta"
  | "message.reasoning_delta"
  | "message.completed"
  | "tool.started"
  | "tool.progress"
  | "tool.completed"
  | "tool.failed"
  | "permission.requested"
  | "permission.resolved"
  | "permission.cancelled"
  | "interaction.requested"
  | "interaction.resolved"
  | "interaction.cancelled"
  | "queue.updated"
  | "retry.started"
  | "retry.completed"
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

type TaskScopedEvent<Type extends HostEventType> = HostEventBase<Type> & {
  sessionId: string;
  taskId: string;
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

export type RunCancelledHostEvent = RunScopedEvent<"run.cancelled"> & {
  reason?: string;
};

export type TaskCreatedHostEvent = TaskScopedEvent<"task.created"> & {
  rootRunId: string;
  cwd: string;
  objective: string;
  state: Extract<CodeTaskStateResource, "created">;
  plan?: CodeTaskPlanResource;
};

export type TaskPhaseChangedHostEvent = TaskScopedEvent<"task.phase_changed"> & {
  from: CodeTaskStateResource;
  to: CodeTaskStateResource;
  activeRunId?: string;
  attempt: number;
  plan?: CodeTaskPlanResource;
};

export type TaskCompletedHostEvent = TaskScopedEvent<"task.completed"> & {
  evidence: CodeTaskCompletionEvidenceResource;
};

export type TaskBlockedHostEvent = TaskScopedEvent<"task.blocked"> & {
  reason: CodeTaskTerminalReasonResource;
};

export type TaskFailedHostEvent = TaskScopedEvent<"task.failed"> & {
  reason: CodeTaskTerminalReasonResource;
};

export type TaskCancelledHostEvent = TaskScopedEvent<"task.cancelled"> & {
  actor: "user" | "host" | "runtime";
  reason?: string;
};

export type VerificationStartedHostEvent = TaskScopedEvent<"verification.started"> & {
  runId?: string;
  attempt: VerificationAttemptResource;
};

export type VerificationCompletedHostEvent = TaskScopedEvent<"verification.completed"> & {
  runId?: string;
  attempt: VerificationAttemptResource;
};

export type MessageDeltaHostEvent = RunScopedEvent<"message.delta"> & {
  messageId: string;
  role: "assistant";
  text: string;
};

export type MessageReasoningDeltaHostEvent = RunScopedEvent<"message.reasoning_delta"> & {
  messageId: string;
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

export type ToolProgressHostEvent = RunScopedEvent<"tool.progress"> & {
  callId: string;
  name: string;
  message?: string;
  progress?: number;
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

export type PermissionCancelledHostEvent = RunScopedEvent<"permission.cancelled"> & {
  requestId: string;
  callId: string;
  toolName: string;
  reason?: string;
};

export type InteractionRequestedHostEvent = RunScopedEvent<"interaction.requested"> & {
  requestId: string;
  request: InteractionRequest;
};

export type InteractionResolvedHostEvent = RunScopedEvent<"interaction.resolved"> & {
  requestId: string;
  response?: unknown;
};

export type InteractionCancelledHostEvent = RunScopedEvent<"interaction.cancelled"> & {
  requestId: string;
  reason?: string;
};

export type QueueUpdatedHostEvent = RunScopedEvent<"queue.updated"> & {
  pending: QueuedRunInputSummaryResource[];
};

export type RetryStartedHostEvent = RunScopedEvent<"retry.started"> & {
  attempt: number;
  reason: string;
};

export type RetryCompletedHostEvent = RunScopedEvent<"retry.completed"> & {
  attempt: number;
};

export type ContextCompactedHostEvent = RunScopedEvent<"context.compacted"> & {
  boundaryId: string;
  trigger: string;
  summary?: string | {
    objective?: string;
    completedWork?: string[];
    currentBlockers?: string[];
    nextSteps?: string[];
    keyFilesAndSymbols?: string[];
    unresolvedQuestions?: string[];
    userConstraints?: string[];
  };
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
  | RunCancelledHostEvent
  | TaskCreatedHostEvent
  | TaskPhaseChangedHostEvent
  | TaskCompletedHostEvent
  | TaskBlockedHostEvent
  | TaskFailedHostEvent
  | TaskCancelledHostEvent
  | VerificationStartedHostEvent
  | VerificationCompletedHostEvent
  | MessageDeltaHostEvent
  | MessageReasoningDeltaHostEvent
  | MessageCompletedHostEvent
  | ToolStartedHostEvent
  | ToolProgressHostEvent
  | ToolCompletedHostEvent
  | ToolFailedHostEvent
  | PermissionRequestedHostEvent
  | PermissionResolvedHostEvent
  | PermissionCancelledHostEvent
  | InteractionRequestedHostEvent
  | InteractionResolvedHostEvent
  | InteractionCancelledHostEvent
  | QueueUpdatedHostEvent
  | RetryStartedHostEvent
  | RetryCompletedHostEvent
  | ContextCompactedHostEvent
  | ArtifactCreatedHostEvent
  | UsageRecordedHostEvent;

export type HostEventInput<Event extends HostEvent = HostEvent> = Event extends HostEvent
  ? Omit<Event, "seq" | "occurredAt"> & { occurredAt?: string }
  : never;

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
      } as unknown as Event;
    },
    currentSeq() {
      return seq;
    }
  };
}

export function isTerminalHostEvent(
  event: HostEvent
): event is RunCompletedHostEvent | RunFailedHostEvent | RunCancelledHostEvent {
  return event.type === "run.completed" || event.type === "run.failed" || event.type === "run.cancelled";
}

export function hostEventSseName(_event: HostEvent): string {
  return HOST_EVENT_SSE_NAME;
}
