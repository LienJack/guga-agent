import { AgentEventType } from "../contracts/events";
import type { BudgetedToolResult, ToolCallCorrelation, ToolResultBudget } from "../contracts/tool-runtime";
import type { ToolCall } from "../contracts/messages";
import type { ToolFailure, ToolResult } from "../contracts/tools";
import type { ToolDefinition } from "../contracts/tools";
import type { ToolResultReference } from "../contracts/tool-runtime";
import { InMemoryToolResultStore, type ToolResultStore } from "../context/tool-result-store";
import { createToolResultPreview } from "../context/tool-result-views";
import { EventBus } from "../events/event-bus";

export type ResultPolicyOptions = {
  eventBus?: EventBus;
  defaultBudget?: ToolResultBudget;
  store?: ToolResultStore;
};

export type ResultPolicyApplyOptions = {
  call: ToolCall;
  correlation: ToolCallCorrelation;
  result: ToolResult;
  tool?: ToolDefinition;
  budget?: ToolResultBudget;
};

export type SyntheticResultReason = "cancelled" | "skipped" | "denied" | "timeout";

export class ResultPolicy {
  private readonly eventBus: EventBus;
  private readonly defaultBudget: ToolResultBudget;
  private readonly store: ToolResultStore;

  constructor(options: ResultPolicyOptions = {}) {
    this.eventBus = options.eventBus ?? new EventBus();
    this.defaultBudget = options.defaultBudget ?? {};
    this.store = options.store ?? new InMemoryToolResultStore();
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

    const reference = this.store.store({
      correlation: options.correlation,
      toolName: options.call.name,
      result: options.result,
      content,
      metadata: { budgetStrategy: budget.strategy ?? "truncate" }
    });
    const preview = createToolResultPreview({
      call: options.call,
      result: options.result,
      ...(options.tool ? { tool: options.tool } : {}),
      content,
      maxContentChars,
      reference
    });

    const result = budget.strategy === "reference"
      ? referenceResult(options.result, reference, content.length, preview.llmPreview, preview.notice, preview.rereadInstruction)
      : truncateResult(options.result, maxContentChars, content.length, preview.llmPreview, preview.notice, reference, preview.rereadInstruction);

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

function truncateResult(
  result: ToolResult,
  maxContentChars: number,
  originalContentChars: number,
  previewContent: string,
  notice: string,
  reference: ToolResultReference,
  rereadInstruction: string | undefined
): BudgetedToolResult {
  if (result.ok) {
    return {
      ...result,
      content: previewContent,
      budget: {
        applied: true,
        originalContentChars,
        notice,
        reference,
        ...(rereadInstruction ? { rereadInstruction } : {}),
        omittedContentChars: Math.max(0, originalContentChars - maxContentChars),
        view: { llmPreview: previewContent, auditMetadata: { strategy: "truncate" } }
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
        content: previewContent,
        reference
      }
    },
    budget: {
      applied: true,
      originalContentChars,
      notice,
      reference,
      ...(rereadInstruction ? { rereadInstruction } : {}),
      omittedContentChars: Math.max(0, originalContentChars - maxContentChars),
      view: { llmPreview: previewContent, auditMetadata: { strategy: "truncate" } }
    }
  };
}

function referenceResult(
  result: ToolResult,
  reference: ToolResultReference,
  originalContentChars: number,
  previewContent: string,
  previewNotice: string,
  rereadInstruction: string | undefined
): BudgetedToolResult {
  const notice = `Tool output stored as reference: ${reference.id}`;

  if (result.ok) {
    return {
      ...result,
      content: `${previewContent}\n\n[${notice}]`,
      budget: {
        applied: true,
        originalContentChars,
        notice: `${notice}. ${previewNotice}`,
        reference,
        ...(rereadInstruction ? { rereadInstruction } : {}),
        omittedContentChars: originalContentChars,
        view: { llmPreview: previewContent, auditMetadata: { strategy: "reference" } }
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
      notice: `${notice}. ${previewNotice}`,
      reference,
      ...(rereadInstruction ? { rereadInstruction } : {}),
      omittedContentChars: originalContentChars,
      view: { llmPreview: previewContent, auditMetadata: { strategy: "reference" } }
    }
  };
}
