import {
  AgentEventType,
  type AgentEvent,
  type MetricsSnapshot
} from "@guga-agent/core";

export type CreateMetricsSnapshotOptions = {
  events: AgentEvent[];
  runId?: string;
  updatedAt?: string;
};

export function createMetricsSnapshot(options: CreateMetricsSnapshotOptions): MetricsSnapshot {
  const counters: Record<string, number> = {
    "runs.started": 0,
    "runs.completed": 0,
    "runs.failed": 0,
    "tools.started": 0,
    "tools.completed": 0,
    "tools.failed": 0,
    "permissions.requested": 0,
    "permissions.allowed": 0,
    "permissions.denied": 0,
    "usage.input_tokens": 0,
    "usage.output_tokens": 0,
    "usage.total_tokens": 0,
    "usage.cached_input_tokens": 0,
    "usage.reasoning_tokens": 0
  };

  for (const event of filterEvents(options.events, options.runId)) {
    switch (event.type) {
      case AgentEventType.RunStarted:
        increment(counters, "runs.started");
        break;
      case AgentEventType.RunFinished:
        if (event.status === "completed") {
          increment(counters, "runs.completed");
        } else {
          increment(counters, "runs.failed");
        }
        break;
      case AgentEventType.ToolStarted:
        increment(counters, "tools.started");
        break;
      case AgentEventType.ToolCompleted:
        increment(counters, "tools.completed");
        break;
      case AgentEventType.ToolFailed:
      case AgentEventType.ToolDenied:
      case AgentEventType.ToolCancelled:
      case AgentEventType.ToolTimeout:
        increment(counters, "tools.failed");
        break;
      case AgentEventType.PermissionRequested:
        increment(counters, "permissions.requested");
        break;
      case AgentEventType.PermissionResolved:
        if (event.decision.action === "allow") {
          increment(counters, "permissions.allowed");
        }
        if (event.decision.action === "deny") {
          increment(counters, "permissions.denied");
        }
        break;
      case AgentEventType.UsageRecorded:
        increment(counters, "usage.input_tokens", event.usage.inputTokens ?? 0);
        increment(counters, "usage.output_tokens", event.usage.outputTokens ?? 0);
        increment(counters, "usage.total_tokens", event.usage.totalTokens ?? 0);
        increment(counters, "usage.cached_input_tokens", event.usage.cachedInputTokens ?? 0);
        increment(counters, "usage.reasoning_tokens", event.usage.reasoningTokens ?? 0);
        break;
      default:
        break;
    }
  }

  return {
    updatedAt: options.updatedAt ?? new Date().toISOString(),
    counters
  };
}

function filterEvents(events: AgentEvent[], runId: string | undefined): AgentEvent[] {
  if (runId === undefined) {
    return events;
  }
  return events.filter((event) => event.runId === runId);
}

function increment(counters: Record<string, number>, key: string, amount = 1): void {
  counters[key] = (counters[key] ?? 0) + amount;
}
