import { AgentEventType } from "../contracts/events";
import type { BudgetedToolResult, ToolCallCorrelation, ToolResultBudget } from "../contracts/tool-runtime";
import type { ToolCall } from "../contracts/messages";
import type { ToolFailure, ToolResult } from "../contracts/tools";
import { EventBus } from "../events/event-bus";

export type ResultPolicyOptions = {
  eventBus?: EventBus;
  defaultBudget?: ToolResultBudget;
};

export type ResultPolicyApplyOptions = {
  call: ToolCall;
  correlation: ToolCallCorrelation;
  result: ToolResult;
  budget?: ToolResultBudget;
};

export type SyntheticResultReason = "cancelled" | "skipped" | "denied" | "timeout";

export class ResultPolicy {
  private readonly eventBus: EventBus;
  private readonly defaultBudget: ToolResultBudget;

  constructor(options: ResultPolicyOptions = {}) {
    this.eventBus = options.eventBus ?? new EventBus();
    this.defaultBudget = options.defaultBudget ?? {};
  }

  apply(options: ResultPolicyApplyOptions): BudgetedToolResult {
    const budget = options.budget ?? this.defaultBudget;
    const maxContentChars = budget.maxContentChars;
    if (maxContentChars === undefined) {
      return options.result;
    }

    const content = resultContent(options.result);
    if (content.length <= maxContentChars) {
      return options.result;
    }

    const result = budget.strategy === "reference"
      ? referenceResult(options.result, options.correlation, content.length)
      : truncateResult(options.result, maxContentChars, content.length);

    this.eventBus.publish({
      type: AgentEventType.ToolResultBudgeted,
      runId: options.correlation.runId,
      turn: options.correlation.turn,
      correlation: options.correlation,
      call: options.call,
      result
    });

    return result;
  }

  synthetic(reason: SyntheticResultReason, message: string, details?: unknown): ToolFailure {
    const code = {
      cancelled: "TOOL_CANCELLED",
      skipped: "TOOL_SKIPPED",
      denied: "TOOL_PERMISSION_DENIED",
      timeout: "TOOL_TIMEOUT"
    }[reason];

    return {
      ok: false,
      error: {
        code,
        message,
        details
      },
      metadata: {
        synthetic: true,
        reason
      }
    };
  }
}

function resultContent(result: ToolResult): string {
  if (result.ok) {
    return result.content;
  }

  return typeof result.error.details === "string"
    ? result.error.details
    : result.error.message;
}

function truncateResult(result: ToolResult, maxContentChars: number, originalContentChars: number): BudgetedToolResult {
  const notice = `Tool output truncated: ${originalContentChars} characters exceeded ${maxContentChars} character budget`;
  if (result.ok) {
    return {
      ...result,
      content: `${result.content.slice(0, maxContentChars)}\n\n[${notice}]`,
      budget: {
        applied: true,
        originalContentChars,
        notice
      }
    };
  }

  return {
    ...result,
    error: {
      ...result.error,
      details: {
        truncated: true,
        originalContentChars,
        content: resultContent(result).slice(0, maxContentChars)
      }
    },
    budget: {
      applied: true,
      originalContentChars,
      notice
    }
  };
}

function referenceResult(result: ToolResult, correlation: ToolCallCorrelation, originalContentChars: number): BudgetedToolResult {
  const reference = {
    type: "buffer" as const,
    id: `tool-result-${correlation.toolCallId}`,
    label: "Tool result output",
    metadata: { originalContentChars }
  };
  const notice = `Tool output stored as reference: ${reference.id}`;

  if (result.ok) {
    return {
      ...result,
      content: `[${notice}]`,
      budget: {
        applied: true,
        originalContentChars,
        notice,
        reference
      }
    };
  }

  return {
    ...result,
    error: {
      ...result.error,
      details: {
        referenced: true,
        reference
      }
    },
    budget: {
      applied: true,
      originalContentChars,
      notice,
      reference
    }
  };
}
