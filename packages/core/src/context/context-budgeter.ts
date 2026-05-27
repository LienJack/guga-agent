import type {
  ContextBudget,
  ContextPressureDecision,
  ContextPressureLevel,
  ContextSourceDescriptor
} from "../contracts/context";
import { ContextSourceKind as SourceKind } from "../contracts/context";
import type { CoreMessage } from "../contracts/messages";
import type { ModelMetadata } from "../contracts/provider";
import type { ToolDefinition } from "../contracts/tools";

export type ContextBudgeterOptions = {
  defaultReservedOutputTokens?: number;
  warningThreshold?: number;
  compactThreshold?: number;
};

export type EstimateProjectionBudgetOptions = {
  messages: readonly CoreMessage[];
  tools: readonly ToolDefinition[];
  sources: readonly ContextSourceDescriptor[];
  modelMetadata?: ModelMetadata;
  reservedOutputTokens?: number;
};

const DEFAULT_RESERVED_OUTPUT_TOKENS = 1024;
const DEFAULT_WARNING_THRESHOLD = 0.7;
const DEFAULT_COMPACT_THRESHOLD = 0.85;

export class ContextBudgeter {
  private readonly defaultReservedOutputTokens: number;
  private readonly warningThreshold: number;
  private readonly compactThreshold: number;

  constructor(options: ContextBudgeterOptions = {}) {
    this.defaultReservedOutputTokens = options.defaultReservedOutputTokens ?? DEFAULT_RESERVED_OUTPUT_TOKENS;
    this.warningThreshold = options.warningThreshold ?? DEFAULT_WARNING_THRESHOLD;
    this.compactThreshold = options.compactThreshold ?? DEFAULT_COMPACT_THRESHOLD;
  }

  estimate(options: EstimateProjectionBudgetOptions): ContextBudget {
    const reservedOutputTokens = Math.min(
      options.reservedOutputTokens ?? options.modelMetadata?.maxOutputTokens ?? this.defaultReservedOutputTokens,
      options.modelMetadata?.contextWindow ?? Number.POSITIVE_INFINITY
    );
    const estimatedInputTokens =
      estimateMessages(options.messages) +
      estimateTools(options.tools) +
      estimateAdditionalSources(options.sources);
    const contextWindow = options.modelMetadata?.contextWindow;
    const usableInputTokens = contextWindow === undefined
      ? undefined
      : Math.max(0, contextWindow - reservedOutputTokens);
    const sourceEstimateUnknown = options.sources.some((source) => source.tokenEstimate.status === "unknown");

    return {
      ...(contextWindow !== undefined ? { contextWindow } : {}),
      reservedOutputTokens,
      ...(usableInputTokens !== undefined ? { usableInputTokens } : {}),
      estimatedInputTokens,
      estimateStatus: contextWindow === undefined || sourceEstimateUnknown ? "partial" : "complete",
      warningThreshold: this.warningThreshold,
      compactThreshold: this.compactThreshold
    };
  }

  pressureFor(id: string, budget: ContextBudget, sourceIds: string[]): ContextPressureDecision {
    const level = pressureLevel(budget);
    return {
      id,
      level,
      reason: pressureReason(level, budget),
      budget,
      sourceIds
    };
  }
}

export function estimateTextTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateMessageTokens(message: CoreMessage): number {
  const baseTokens = estimateTextTokens(message.role);
  if (message.role === "assistant" && "toolCalls" in message) {
    return baseTokens + estimateTextTokens(message.content ?? "") + estimateTextTokens(JSON.stringify(message.toolCalls));
  }
  if (message.role === "tool") {
    return baseTokens + estimateTextTokens(message.name) + estimateTextTokens(message.toolCallId) + estimateTextTokens(message.content);
  }
  return baseTokens + estimateTextTokens(message.content);
}

function estimateMessages(messages: readonly CoreMessage[]): number {
  return messages.reduce((total, message) => total + estimateMessageTokens(message), 0);
}

function estimateTools(tools: readonly ToolDefinition[]): number {
  return tools.reduce(
    (total, tool) =>
      total +
      estimateTextTokens(tool.name) +
      estimateTextTokens(tool.description) +
      estimateTextTokens(JSON.stringify(tool.inputSchema)),
    0
  );
}

function estimateAdditionalSources(sources: readonly ContextSourceDescriptor[]): number {
  return sources
    .filter((source) => source.messageIndexes === undefined && source.kind !== SourceKind.ActiveTool)
    .reduce((total, source) => total + (source.tokenEstimate.tokens ?? 0), 0);
}

function pressureLevel(budget: ContextBudget): ContextPressureLevel {
  if (budget.usableInputTokens === undefined || budget.usableInputTokens === 0) {
    return "none";
  }

  const ratio = budget.estimatedInputTokens / budget.usableInputTokens;
  if (ratio >= budget.compactThreshold) {
    return "compact";
  }
  if (ratio >= budget.warningThreshold) {
    return "warning";
  }
  return "none";
}

function pressureReason(level: ContextPressureLevel, budget: ContextBudget): string {
  if (level === "none") {
    return budget.usableInputTokens === undefined
      ? "model context window is unknown"
      : "projection is within budget";
  }
  return `projection estimate ${budget.estimatedInputTokens} tokens reached ${level} threshold`;
}
