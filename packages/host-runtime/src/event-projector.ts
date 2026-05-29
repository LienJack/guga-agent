import { AgentEventType, ModelEventType, type AgentEvent } from "@guga-agent/core";
import {
  createHostEventSequencer,
  type HostEvent,
  type HostEventSequencer
} from "@guga-agent/host-protocol";

export type AgentEventProjectionContext = {
  sessionId: string;
  runId: string;
  sourceRunId?: string;
  sequencer: HostEventSequencer;
};

export function createProjectionContext(options: {
  sessionId: string;
  runId: string;
  startSeq?: number;
  now?: () => Date;
}): AgentEventProjectionContext {
  return {
    sessionId: options.sessionId,
    runId: options.runId,
    sequencer: createHostEventSequencer({
      ...(options.startSeq !== undefined ? { startSeq: options.startSeq } : {}),
      ...(options.now ? { now: options.now } : {})
    })
  };
}

export function projectAgentEvent(event: AgentEvent, context: AgentEventProjectionContext): HostEvent[] {
  if (event.runId !== (context.sourceRunId ?? context.runId)) {
    return [];
  }

  if (event.type === AgentEventType.RunStarted) {
    return [context.sequencer.next({
      type: "run.started",
      sessionId: context.sessionId,
      runId: context.runId,
      input: event.input
    })];
  }

  if (event.type === AgentEventType.ModelResponded && event.response.type === "final") {
    const messageId = `assistant-${context.runId}-${event.turn}`;
    return [
      context.sequencer.next({
        type: "message.delta",
        sessionId: context.sessionId,
        runId: context.runId,
        messageId,
        role: "assistant",
        text: event.response.content
      }),
      context.sequencer.next({
        type: "message.completed",
        sessionId: context.sessionId,
        runId: context.runId,
        messageId,
        role: "assistant"
      })
    ];
  }

  if (event.type === AgentEventType.ModelEvent && event.event.type === ModelEventType.ReasoningDelta) {
    return [context.sequencer.next({
      type: "message.reasoning_delta",
      sessionId: context.sessionId,
      runId: context.runId,
      messageId: `reasoning-${context.runId}-${event.turn}`,
      text: event.event.delta
    })];
  }

  if (event.type === AgentEventType.ModelEvent && event.event.type === ModelEventType.RetryScheduled) {
    return [context.sequencer.next({
      type: "retry.started",
      sessionId: context.sessionId,
      runId: context.runId,
      attempt: event.event.nextAttempt,
      reason: event.event.error.message
    })];
  }

  if (
    event.type === AgentEventType.ModelEvent
    && (event.event.type === ModelEventType.Finished || event.event.type === ModelEventType.ProviderError)
    && event.event.attempt !== undefined
    && event.event.attempt > 0
  ) {
    return [context.sequencer.next({
      type: "retry.completed",
      sessionId: context.sessionId,
      runId: context.runId,
      attempt: event.event.attempt
    })];
  }

  if (event.type === AgentEventType.ToolStarted) {
    return [context.sequencer.next({
      type: "tool.started",
      sessionId: context.sessionId,
      runId: context.runId,
      callId: event.call.id,
      name: event.call.name,
      input: event.call.input
    })];
  }

  if (
    event.type === AgentEventType.ToolCompleted
    || event.type === AgentEventType.ToolDenied
    || event.type === AgentEventType.ToolCancelled
    || event.type === AgentEventType.ToolTimeout
  ) {
    return [context.sequencer.next({
      type: event.result.ok ? "tool.completed" : "tool.failed",
      sessionId: context.sessionId,
      runId: context.runId,
      callId: event.call.id,
      name: event.call.name,
      ...(event.result.ok
        ? { output: event.result.content }
        : { error: event.result.error })
    } as HostEvent)];
  }

  if (event.type === AgentEventType.ToolFailed) {
    return [context.sequencer.next({
      type: "tool.failed",
      sessionId: context.sessionId,
      runId: context.runId,
      callId: event.call.id,
      name: event.call.name,
      error: event.result.ok
        ? { code: "TOOL_FAILED", message: event.result.content }
        : event.result.error
    })];
  }

  if (event.type === AgentEventType.PermissionRequested) {
    const reason = event.request.metadata?.reason;
    return [context.sequencer.next({
      type: "permission.requested",
      sessionId: context.sessionId,
      runId: context.runId,
      requestId: permissionRequestId(event.request),
      callId: event.request.toolCallId,
      toolName: event.request.call.name,
      input: event.request.call.input,
      ...(typeof reason === "string" ? { reason } : {})
    })];
  }

  if (event.type === AgentEventType.PermissionResolved) {
    const remember = event.decision.action === "ask" ? undefined : event.decision.remember;
    return [context.sequencer.next({
      type: "permission.resolved",
      sessionId: context.sessionId,
      runId: context.runId,
      requestId: permissionRequestId(event.request),
      callId: event.request.toolCallId,
      decision: event.decision.action === "allow" ? "allow" : "deny",
      ...(remember ? { remember } : {}),
      ...(event.decision.reason ? { reason: event.decision.reason } : {})
    })];
  }

  if (event.type === AgentEventType.ContextCompactCompleted) {
    return [context.sequencer.next({
      type: "context.compacted",
      sessionId: context.sessionId,
      runId: context.runId,
      boundaryId: event.projectionId,
      trigger: event.result.trigger,
      ...(event.result.summary ? { summary: event.result.summary } : {})
    })];
  }

  if (event.type === AgentEventType.UsageRecorded) {
    return [context.sequencer.next({
      type: "usage.recorded",
      sessionId: context.sessionId,
      runId: context.runId,
      ...(event.usage.totalTokens !== undefined ? { totalTokens: event.usage.totalTokens } : {}),
      ...(event.usage.inputTokens !== undefined ? { inputTokens: event.usage.inputTokens } : {}),
      ...(event.usage.outputTokens !== undefined ? { outputTokens: event.usage.outputTokens } : {}),
      ...(event.usage.cost?.status === "known" && event.usage.cost.currency === "USD"
        ? { costUsd: event.usage.cost.amount }
        : {})
    })];
  }

  return [];
}

function permissionRequestId(request: {
  runId: string;
  toolCallId: string;
  attempt: number;
}): string {
  return `${request.runId}:${request.toolCallId}:${request.attempt}`;
}
