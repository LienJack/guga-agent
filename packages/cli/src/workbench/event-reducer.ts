import type { HostEvent, QueuedRunInputSummaryResource } from "@guga-agent/host-protocol";
import type {
  AssistantTranscriptBlock,
  ContextTranscriptBlock,
  QueueSummary,
  TranscriptBlock,
  WorkbenchAction,
  WorkbenchState
} from "./state";

export function reduceHostEvent(state: WorkbenchState, event: HostEvent): WorkbenchState {
  const nextState = reduceKnownHostEvent(state, event);
  if (event.seq > state.lastSeq + 1) {
    return withDisconnected(nextState, {
      reason: "seq-discontinuity",
      message: `Host event sequence jumped from ${state.lastSeq} to ${event.seq}.`,
      expectedSeq: state.lastSeq + 1,
      actualSeq: event.seq
    });
  }
  return nextState;
}

function reduceKnownHostEvent(state: WorkbenchState, event: HostEvent): WorkbenchState {
  switch (event.type) {
    case "run.started":
      return {
        ...baseEventState(state, event),
        activeSessionId: event.sessionId,
        activeRunId: event.runId,
        runStatus: "running",
        statusText: "Running"
      };
    case "run.completed":
      return {
        ...withAssistantFinal(withoutPendingForRun(baseEventState(state, event), event.runId), event),
        runStatus: "completed",
        statusText: "Completed"
      };
    case "run.failed":
      return withTranscriptBlock({
        ...withoutPendingForRun(baseEventState(state, event), event.runId),
        runStatus: isAbortError(event.error.code) ? "cancelled" : "failed",
        statusText: isAbortError(event.error.code) ? "Aborted" : `Failed: ${event.error.message}`
      }, {
        id: `${isAbortError(event.error.code) ? "abort" : "error"}:${event.runId}:${event.seq}`,
        kind: isAbortError(event.error.code) ? "abort" : "error",
        sessionId: event.sessionId,
        runId: event.runId,
        firstSeq: event.seq,
        lastSeq: event.seq,
        occurredAt: event.occurredAt,
        error: event.error
      });
    case "run.cancelled":
      return withTranscriptBlock({
        ...withoutPendingForRun(baseEventState(state, event), event.runId),
        runStatus: "cancelled",
        statusText: "Aborted"
      }, {
        id: `abort:${event.runId}:${event.seq}`,
        kind: "abort",
        sessionId: event.sessionId,
        runId: event.runId,
        firstSeq: event.seq,
        lastSeq: event.seq,
        occurredAt: event.occurredAt,
        error: {
          code: "RUN_CANCELLED",
          message: event.reason ?? "Run was cancelled"
        }
      });
    case "message.delta":
      return withAssistantDelta(baseEventState(state, event), event);
    case "message.completed":
      return updateTranscriptBlock(baseEventState(state, event), `assistant:${event.messageId}`, (block) => {
        if (block.kind !== "assistant") {
          return block;
        }
        return {
          ...block,
          status: "completed",
          lastSeq: event.seq,
          occurredAt: event.occurredAt
        };
      });
    case "tool.started":
      return withTranscriptBlock(baseEventState(state, event), {
        id: `tool:${event.callId}`,
        kind: "tool",
        sessionId: event.sessionId,
        runId: event.runId,
        callId: event.callId,
        name: event.name,
        status: "running",
        artifactIds: [],
        ...(event.input !== undefined ? { input: event.input } : {}),
        firstSeq: event.seq,
        lastSeq: event.seq,
        occurredAt: event.occurredAt
      });
    case "tool.progress":
      return updateTranscriptBlock({
        ...baseEventState(state, event),
        statusText: event.message ?? `Tool running: ${event.name}`
      }, `tool:${event.callId}`, (block) => {
        if (block.kind !== "tool") {
          return block;
        }
        return {
          ...block,
          status: "running",
          ...(event.progress !== undefined ? { progress: event.progress } : {}),
          ...(event.message ? { progressMessage: event.message } : {}),
          lastSeq: event.seq,
          occurredAt: event.occurredAt
        };
      }, () => ({
        id: `tool:${event.callId}`,
        kind: "tool",
        sessionId: event.sessionId,
        runId: event.runId,
        callId: event.callId,
        name: event.name,
        status: "running",
        ...(event.progress !== undefined ? { progress: event.progress } : {}),
        ...(event.message ? { progressMessage: event.message } : {}),
        artifactIds: [],
        firstSeq: event.seq,
        lastSeq: event.seq,
        occurredAt: event.occurredAt
      }));
    case "tool.completed":
      return updateTranscriptBlock(baseEventState(state, event), `tool:${event.callId}`, (block) => {
        if (block.kind !== "tool") {
          return block;
        }
        return {
          ...block,
          status: "completed",
          ...(event.output !== undefined ? { output: event.output } : {}),
          artifactIds: event.artifactIds ?? block.artifactIds,
          lastSeq: event.seq,
          occurredAt: event.occurredAt
        };
      }, () => ({
        id: `tool:${event.callId}`,
        kind: "tool",
        sessionId: event.sessionId,
        runId: event.runId,
        callId: event.callId,
        name: event.name,
        status: "completed",
        ...(event.output !== undefined ? { output: event.output } : {}),
        artifactIds: event.artifactIds ?? [],
        firstSeq: event.seq,
        lastSeq: event.seq,
        occurredAt: event.occurredAt
      }));
    case "tool.failed":
      return updateTranscriptBlock(baseEventState(state, event), `tool:${event.callId}`, (block) => {
        if (block.kind !== "tool") {
          return block;
        }
        return {
          ...block,
          status: "failed",
          error: event.error,
          lastSeq: event.seq,
          occurredAt: event.occurredAt
        };
      }, () => ({
        id: `tool:${event.callId}`,
        kind: "tool",
        sessionId: event.sessionId,
        runId: event.runId,
        callId: event.callId,
        name: event.name,
        status: "failed",
        artifactIds: [],
        error: event.error,
        firstSeq: event.seq,
        lastSeq: event.seq,
        occurredAt: event.occurredAt
      }));
    case "permission.requested":
      return withTranscriptBlock({
        ...baseEventState(state, event),
        runStatus: "waiting-for-permission",
        statusText: `Waiting for permission: ${event.toolName}`,
        pendingPermission: {
          sessionId: event.sessionId,
          runId: event.runId,
          requestId: event.requestId,
          callId: event.callId,
          toolName: event.toolName,
          ...(event.input !== undefined ? { input: event.input } : {}),
          ...(event.reason ? { reason: event.reason } : {}),
          firstSeq: event.seq,
          lastSeq: event.seq,
          occurredAt: event.occurredAt
        }
      }, {
        id: `permission:${event.requestId}`,
        kind: "permission",
        sessionId: event.sessionId,
        runId: event.runId,
        requestId: event.requestId,
        callId: event.callId,
        toolName: event.toolName,
        status: "pending",
        ...(event.input !== undefined ? { input: event.input } : {}),
        ...(event.reason ? { reason: event.reason } : {}),
        firstSeq: event.seq,
        lastSeq: event.seq,
        occurredAt: event.occurredAt
      });
    case "permission.resolved":
      return updateTranscriptBlock({
        ...withoutPendingPermission(baseEventState(state, event), event.requestId),
        runStatus: "running",
        statusText: "Running"
      }, `permission:${event.requestId}`, (block) => {
        if (block.kind !== "permission") {
          return block;
        }
        return {
          ...block,
          status: event.decision === "allow" ? "allowed" : "denied",
          ...(event.remember ? { remember: event.remember } : {}),
          ...(event.reason ? { resolutionReason: event.reason } : {}),
          lastSeq: event.seq,
          occurredAt: event.occurredAt
        };
      });
    case "permission.cancelled":
      return updateTranscriptBlock({
        ...withoutPendingPermission(baseEventState(state, event), event.requestId),
        runStatus: "cancelled",
        statusText: "Permission cancelled"
      }, `permission:${event.requestId}`, (block) => {
        if (block.kind !== "permission") {
          return block;
        }
        return {
          ...block,
          status: "cancelled",
          ...(event.reason ? { resolutionReason: event.reason } : {}),
          lastSeq: event.seq,
          occurredAt: event.occurredAt
        };
      }, () => ({
        id: `permission:${event.requestId}`,
        kind: "permission",
        sessionId: event.sessionId,
        runId: event.runId,
        requestId: event.requestId,
        callId: event.callId,
        toolName: event.toolName,
        status: "cancelled",
        ...(event.reason ? { resolutionReason: event.reason } : {}),
        firstSeq: event.seq,
        lastSeq: event.seq,
        occurredAt: event.occurredAt
      }));
    case "interaction.requested":
      return withTranscriptBlock({
        ...baseEventState(state, event),
        runStatus: "waiting-for-interaction",
        statusText: `Waiting for interaction: ${event.request.kind}`,
        pendingInteraction: {
          sessionId: event.sessionId,
          runId: event.runId,
          requestId: event.requestId,
          request: event.request,
          firstSeq: event.seq,
          lastSeq: event.seq,
          occurredAt: event.occurredAt
        }
      }, {
        id: `interaction:${event.requestId}`,
        kind: "interaction",
        sessionId: event.sessionId,
        runId: event.runId,
        requestId: event.requestId,
        request: event.request,
        status: "pending",
        firstSeq: event.seq,
        lastSeq: event.seq,
        occurredAt: event.occurredAt
      });
    case "interaction.resolved":
      return updateTranscriptBlock({
        ...withoutPendingInteraction(baseEventState(state, event), event.requestId),
        runStatus: "running",
        statusText: "Running"
      }, `interaction:${event.requestId}`, (block) => {
        if (block.kind !== "interaction") {
          return block;
        }
        return {
          ...block,
          status: "resolved",
          ...(event.response !== undefined ? { response: event.response } : {}),
          lastSeq: event.seq,
          occurredAt: event.occurredAt
        };
      });
    case "interaction.cancelled":
      return updateTranscriptBlock({
        ...withoutPendingInteraction(baseEventState(state, event), event.requestId),
        runStatus: "cancelled",
        statusText: "Interaction cancelled"
      }, `interaction:${event.requestId}`, (block) => {
        if (block.kind !== "interaction") {
          return block;
        }
        return {
          ...block,
          status: "cancelled",
          lastSeq: event.seq,
          occurredAt: event.occurredAt
        };
      }, () => ({
        id: `interaction:${event.requestId}`,
        kind: "interaction",
        sessionId: event.sessionId,
        runId: event.runId,
        requestId: event.requestId,
        request: { kind: "notify", level: "warning", message: event.reason ?? "Interaction cancelled" },
        status: "cancelled",
        firstSeq: event.seq,
        lastSeq: event.seq,
        occurredAt: event.occurredAt
      }));
    case "queue.updated": {
      const queue = summarizeQueue(event.pending);
      return withTranscriptBlock({
        ...baseEventState(state, event),
        queue,
        statusText: queueStatusText(state, queue)
      }, {
        id: `queue:${event.seq}`,
        kind: "queue",
        sessionId: event.sessionId,
        runId: event.runId,
        firstSeq: event.seq,
        lastSeq: event.seq,
        occurredAt: event.occurredAt,
        ...queue
      });
    }
    case "retry.started":
      return withTranscriptBlock({
        ...baseEventState(state, event),
        statusText: `Retrying: attempt ${event.attempt}`
      }, {
        id: `retry:${event.runId}:${event.attempt}`,
        kind: "retry",
        sessionId: event.sessionId,
        runId: event.runId,
        attempt: event.attempt,
        status: "started",
        reason: event.reason,
        firstSeq: event.seq,
        lastSeq: event.seq,
        occurredAt: event.occurredAt
      });
    case "retry.completed":
      return updateTranscriptBlock({
        ...baseEventState(state, event),
        statusText: "Running"
      }, `retry:${event.runId}:${event.attempt}`, (block) => {
        if (block.kind !== "retry") {
          return block;
        }
        return {
          ...block,
          status: "completed",
          lastSeq: event.seq,
          occurredAt: event.occurredAt
        };
      }, () => ({
        id: `retry:${event.runId}:${event.attempt}`,
        kind: "retry",
        sessionId: event.sessionId,
        runId: event.runId,
        attempt: event.attempt,
        status: "completed",
        firstSeq: event.seq,
        lastSeq: event.seq,
        occurredAt: event.occurredAt
      }));
    case "usage.recorded":
      return {
        ...baseEventState(state, event),
        usage: {
          inputTokens: state.usage.inputTokens + (event.inputTokens ?? 0),
          outputTokens: state.usage.outputTokens + (event.outputTokens ?? 0),
          totalTokens: state.usage.totalTokens + (event.totalTokens ?? 0),
          ...usageCost(state.usage.costUsd, event.costUsd)
        }
      };
    case "artifact.created":
      return withTranscriptBlock(baseEventState(state, event), {
        id: `artifact:${event.artifactId}`,
        kind: "artifact",
        sessionId: event.sessionId,
        runId: event.runId,
        artifactId: event.artifactId,
        name: event.name,
        ...(event.mimeType ? { mimeType: event.mimeType } : {}),
        ...(event.sizeBytes !== undefined ? { sizeBytes: event.sizeBytes } : {}),
        firstSeq: event.seq,
        lastSeq: event.seq,
        occurredAt: event.occurredAt
      });
    case "context.compacted":
      return withTranscriptBlock(baseEventState(state, event), {
        id: `context:${event.boundaryId}`,
        kind: "context",
        sessionId: event.sessionId,
        runId: event.runId,
        boundaryId: event.boundaryId,
        trigger: event.trigger,
        ...contextSummary(event.summary),
        firstSeq: event.seq,
        lastSeq: event.seq,
        occurredAt: event.occurredAt
      });
    default:
      return assertNever(event);
  }
}

export function reduceHostEvents(state: WorkbenchState, events: readonly HostEvent[]): WorkbenchState {
  return events.reduce(reduceHostEvent, state);
}

export function reduceWorkbenchAction(state: WorkbenchState, action: WorkbenchAction): WorkbenchState {
  switch (action.type) {
    case "ui.clear":
      return {
        ...state,
        clearedThroughSeq: state.lastSeq
      };
    case "stream.error":
      return withDisconnected(state, {
        reason: "stream-error",
        message: action.message
      });
    case "stream.seq_discontinuity":
      return withDisconnected(state, {
        reason: "seq-discontinuity",
        message: `Host event sequence jumped from ${action.expectedSeq - 1} to ${action.actualSeq}.`,
        expectedSeq: action.expectedSeq,
        actualSeq: action.actualSeq
      });
    case "stream.replay_unavailable":
      return withDisconnected(state, {
        reason: "replay-unavailable",
        message: action.message ?? replayUnavailableMessage(action.afterSeq),
        ...(action.afterSeq !== undefined ? { expectedSeq: action.afterSeq + 1 } : {})
      });
    case "stream.reconnected": {
      const { disconnected: _disconnected, ...nextState } = state;
      return {
        ...nextState,
        statusText: state.runStatus === "running" ? "Running" : state.statusText
      };
    }
  }
}

function baseEventState(state: WorkbenchState, event: HostEvent): WorkbenchState {
  return {
    ...state,
    activeSessionId: event.sessionId,
    activeRunId: event.runId,
    lastSeq: Math.max(state.lastSeq, event.seq)
  };
}

function withAssistantDelta(state: WorkbenchState, event: Extract<HostEvent, { type: "message.delta" }>): WorkbenchState {
  return updateTranscriptBlock(state, `assistant:${event.messageId}`, (block) => {
    if (block.kind !== "assistant") {
      return block;
    }
    return {
      ...block,
      text: `${block.text}${event.text}`,
      status: "streaming",
      lastSeq: event.seq,
      occurredAt: event.occurredAt
    };
  }, () => ({
    id: `assistant:${event.messageId}`,
    kind: "assistant",
    sessionId: event.sessionId,
    runId: event.runId,
    messageId: event.messageId,
    text: event.text,
    status: "streaming",
    firstSeq: event.seq,
    lastSeq: event.seq,
    occurredAt: event.occurredAt
  }));
}

function withAssistantFinal(state: WorkbenchState, event: Extract<HostEvent, { type: "run.completed" }>): WorkbenchState {
  if (event.finalAnswer === undefined || event.finalAnswer.length === 0) {
    return markRunAssistantBlocksCompleted(state, event.runId, event.seq, event.occurredAt);
  }
  const existingAssistant = state.transcriptBlocks.find(
    (block): block is AssistantTranscriptBlock => block.kind === "assistant" && block.runId === event.runId
  );
  if (existingAssistant) {
    return markRunAssistantBlocksCompleted(state, event.runId, event.seq, event.occurredAt);
  }
  return withTranscriptBlock(state, {
    id: `assistant:final:${event.runId}`,
    kind: "assistant",
    sessionId: event.sessionId,
    runId: event.runId,
    messageId: `final:${event.runId}`,
    text: event.finalAnswer,
    status: "completed",
    firstSeq: event.seq,
    lastSeq: event.seq,
    occurredAt: event.occurredAt
  });
}

function markRunAssistantBlocksCompleted(state: WorkbenchState, runId: string, seq: number, occurredAt: string): WorkbenchState {
  return {
    ...state,
    transcriptBlocks: state.transcriptBlocks.map((block) => {
      if (block.kind !== "assistant" || block.runId !== runId) {
        return block;
      }
      return {
        ...block,
        status: "completed",
        lastSeq: Math.max(block.lastSeq, seq),
        occurredAt
      };
    })
  };
}

function withTranscriptBlock(state: WorkbenchState, block: TranscriptBlock): WorkbenchState {
  const existingIndex = state.transcriptBlocks.findIndex((candidate) => candidate.id === block.id);
  if (existingIndex === -1) {
    return {
      ...state,
      transcriptBlocks: [...state.transcriptBlocks, block]
    };
  }
  return {
    ...state,
    transcriptBlocks: state.transcriptBlocks.map((candidate, index) => index === existingIndex ? block : candidate)
  };
}

function updateTranscriptBlock(
  state: WorkbenchState,
  id: string,
  update: (block: TranscriptBlock) => TranscriptBlock,
  create?: () => TranscriptBlock
): WorkbenchState {
  const existingIndex = state.transcriptBlocks.findIndex((block) => block.id === id);
  if (existingIndex === -1) {
    return create ? withTranscriptBlock(state, create()) : state;
  }
  return {
    ...state,
    transcriptBlocks: state.transcriptBlocks.map((block, index) => index === existingIndex ? update(block) : block)
  };
}

function summarizeQueue(pending: QueuedRunInputSummaryResource[]): QueueSummary {
  return {
    pending,
    pendingCount: pending.filter((input) => input.status === "pending").length,
    deferredCount: pending.filter((input) => input.status === "deferred").length,
    followUpCount: pending.filter((input) => input.mode === "follow_up").length,
    steerCount: pending.filter((input) => input.mode === "steer").length
  };
}

function queueStatusText(state: WorkbenchState, queue: QueueSummary): string {
  if (queue.pending.length > 0) {
    return `Queued ${queue.pending.length} input${queue.pending.length === 1 ? "" : "s"} (${queue.pendingCount} pending, ${queue.deferredCount} deferred)`;
  }
  if (state.runStatus === "running") {
    return "Running";
  }
  return state.statusText;
}

function withoutPendingPermission(state: WorkbenchState, requestId: string): WorkbenchState {
  if (state.pendingPermission?.requestId !== requestId) {
    return state;
  }
  const { pendingPermission: _pendingPermission, ...nextState } = state;
  return nextState;
}

function withoutPendingInteraction(state: WorkbenchState, requestId: string): WorkbenchState {
  if (state.pendingInteraction?.requestId !== requestId) {
    return state;
  }
  const { pendingInteraction: _pendingInteraction, ...nextState } = state;
  return nextState;
}

function withoutPendingForRun(state: WorkbenchState, runId: string): WorkbenchState {
  const shouldRemovePermission = state.pendingPermission?.runId === runId;
  const shouldRemoveInteraction = state.pendingInteraction?.runId === runId;
  if (!shouldRemovePermission && !shouldRemoveInteraction) {
    return state;
  }
  const { pendingPermission: _pendingPermission, pendingInteraction: _pendingInteraction, ...nextState } = state;
  return {
    ...nextState,
    ...(!shouldRemovePermission && state.pendingPermission ? { pendingPermission: state.pendingPermission } : {}),
    ...(!shouldRemoveInteraction && state.pendingInteraction ? { pendingInteraction: state.pendingInteraction } : {})
  };
}

function withDisconnected(
  state: WorkbenchState,
  disconnected: Omit<NonNullable<WorkbenchState["disconnected"]>, "lockHint">
): WorkbenchState {
  return {
    ...state,
    disconnected: {
      ...disconnected,
      lockHint: "Input is locked while the host stream is disconnected. Run /reload to replay, or exit the workbench."
    },
    statusText: `Disconnected: ${disconnected.message}`
  };
}

function replayUnavailableMessage(afterSeq: number | undefined): string {
  return afterSeq === undefined
    ? "Host event replay is unavailable."
    : `Host event replay is unavailable after seq ${afterSeq}.`;
}

function usageCost(current: number | undefined, next: number | undefined): { costUsd?: number } {
  if (next === undefined) {
    return current === undefined ? {} : { costUsd: current };
  }
  return { costUsd: (current ?? 0) + next };
}

function contextSummary(summary: Extract<HostEvent, { type: "context.compacted" }>["summary"]): { summary?: string } {
  if (summary === undefined) {
    return {};
  }
  if (typeof summary === "string") {
    return { summary };
  }
  const parts = [
    summary.objective,
    ...(summary.completedWork ?? []),
    ...(summary.nextSteps ?? [])
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? { summary: parts.join(" ") } : {};
}

function isAbortError(code: string): boolean {
  return code === "RUN_CANCELLED" || code === "ABORTED" || code === "RUN_ABORTED";
}

function assertNever(value: never): never {
  throw new Error(`Unhandled workbench reducer input: ${JSON.stringify(value)}`);
}
