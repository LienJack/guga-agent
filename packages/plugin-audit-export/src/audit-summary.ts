import {
  AgentEventType,
  type AgentEvent,
  type AuditSummary,
  type OperationalDiagnostic,
  type Usage,
  type UsageCost
} from "@guga-agent/core";

export type CreateAuditSummaryOptions = {
  runId: string;
  events: AgentEvent[];
  startedAt?: string;
  completedAt?: string;
};

export function createAuditSummary(options: CreateAuditSummaryOptions): AuditSummary {
  const usage = createEmptyUsage();
  const failures: OperationalDiagnostic[] = [];
  let startedAt = options.startedAt;
  let completedAt = options.completedAt;
  let sawUnknownCost = false;
  let costAmount = 0;
  let costCurrency: string | undefined;
  let costSamples = 0;
  const toolCalls = {
    started: 0,
    completed: 0,
    failed: 0
  };
  const permissions = {
    requested: 0,
    allowed: 0,
    denied: 0
  };

  for (const event of filterRunEvents(options.runId, options.events)) {
    switch (event.type) {
      case AgentEventType.RunStarted:
        startedAt ??= new Date(0).toISOString();
        break;
      case AgentEventType.RunFinished:
        completedAt ??= new Date(0).toISOString();
        if (event.status === "failed") {
          failures.push({
            severity: "error",
            code: "RUN_FAILED",
            message: event.reason ?? "Run finished with failed status"
          });
        }
        break;
      case AgentEventType.ToolStarted:
        toolCalls.started += 1;
        break;
      case AgentEventType.ToolCompleted:
        toolCalls.completed += 1;
        break;
      case AgentEventType.ToolFailed:
      case AgentEventType.ToolDenied:
      case AgentEventType.ToolCancelled:
      case AgentEventType.ToolTimeout:
        toolCalls.failed += 1;
        if (!event.result.ok) {
          failures.push(toolFailureDiagnostic(event.result.error.code, event.result.error.message));
        }
        break;
      case AgentEventType.PermissionRequested:
        permissions.requested += 1;
        break;
      case AgentEventType.PermissionResolved:
        if (event.decision.action === "allow") {
          permissions.allowed += 1;
        }
        if (event.decision.action === "deny") {
          permissions.denied += 1;
        }
        break;
      case AgentEventType.UsageRecorded:
        addUsage(usage, event.usage);
        if (event.usage.cost?.status === "known") {
          costSamples += 1;
          if (costCurrency === undefined) {
            costCurrency = event.usage.cost.currency;
          }
          if (costCurrency === event.usage.cost.currency) {
            costAmount += event.usage.cost.amount;
          } else {
            sawUnknownCost = true;
          }
        } else {
          sawUnknownCost = true;
        }
        break;
      case AgentEventType.Error:
      case AgentEventType.PluginFailure:
        failures.push({
          severity: "error",
          code: event.code,
          message: event.message
        });
        break;
      case AgentEventType.HookFailure:
        failures.push({
          severity: "error",
          code: "HOOK_FAILURE",
          message: event.message
        });
        break;
      default:
        break;
    }
  }

  usage.cost = summarizeCost({
    amount: costAmount,
    ...(costCurrency === undefined ? {} : { currency: costCurrency }),
    samples: costSamples,
    sawUnknownCost
  });

  const summary: AuditSummary = {
    runId: options.runId,
    toolCalls,
    permissions,
    usage,
    failures
  };
  if (startedAt !== undefined) {
    summary.startedAt = startedAt;
  }
  if (completedAt !== undefined) {
    summary.completedAt = completedAt;
  }
  return summary;
}

function filterRunEvents(runId: string, events: AgentEvent[]): AgentEvent[] {
  return events.filter((event) => event.runId === runId);
}

function createEmptyUsage(): Usage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0
  };
}

function addUsage(target: Usage, usage: Usage): void {
  target.inputTokens = (target.inputTokens ?? 0) + (usage.inputTokens ?? 0);
  target.outputTokens = (target.outputTokens ?? 0) + (usage.outputTokens ?? 0);
  target.totalTokens = (target.totalTokens ?? 0) + (usage.totalTokens ?? 0);
  target.cachedInputTokens = (target.cachedInputTokens ?? 0) + (usage.cachedInputTokens ?? 0);
  target.reasoningTokens = (target.reasoningTokens ?? 0) + (usage.reasoningTokens ?? 0);
}

function summarizeCost(input: {
  amount: number;
  currency?: string;
  samples: number;
  sawUnknownCost: boolean;
}): UsageCost {
  if (input.samples > 0 && !input.sawUnknownCost && input.currency !== undefined) {
    return {
      status: "known",
      amount: input.amount,
      currency: input.currency
    };
  }

  return {
    status: "unknown",
    reason: input.samples > 0
      ? "event stream contains unknown or mixed-currency usage costs"
      : "event stream does not contain known usage costs"
  };
}

function toolFailureDiagnostic(code: string, message: string): OperationalDiagnostic {
  return {
    severity: "error",
    code,
    message
  };
}
