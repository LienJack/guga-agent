import type { ToolDefinition } from "@guga-agent/core";

export const DEFAULT_DELEGATE_TASK_TOOL_NAME = "delegate_task";
export const LEGACY_DELEGATE_TASK_TOOL_NAME = "delegateTask";

export type DelegationStatus = "completed" | "failed" | "cancelled" | "timed_out";

export type DelegationAgentType = "general" | "research" | "code" | "review" | (string & {});

export type DelegateTaskInput = {
  goal: string;
  context?: string;
  agentType?: DelegationAgentType;
  toolAllowlist?: string[];
  maxTurns?: number;
  timeoutMs?: number;
};

export type DelegationEventCount = {
  type: string;
  count: number;
};

export type DelegateTaskOutput = {
  status: DelegationStatus;
  summary: string;
  childRunId: string;
  childSessionId: string;
  events?: DelegationEventCount[];
  metadata?: Record<string, unknown>;
};

export type DelegationToolCatalogItem = Pick<ToolDefinition, "name" | "description" | "effect" | "runtime">;

export type DelegationChildRunRequest = {
  input: string;
  goal: string;
  context?: string;
  agentType: DelegationAgentType;
  tools: string[];
  maxTurns: number;
  timeoutMs: number;
  parentRunId: string;
  parentToolCallId: string;
  childRunId: string;
  childSessionId: string;
  signal?: AbortSignal;
};

export type DelegationChildRunResult = {
  status: DelegationStatus;
  summary: string;
  events?: DelegationEventCount[];
  metadata?: Record<string, unknown>;
};

export type DelegationChildRunner = (
  request: DelegationChildRunRequest
) => Promise<DelegationChildRunResult> | DelegationChildRunResult;

export type DelegationValidationDiagnostic = {
  code: string;
  message: string;
  path?: string;
};

export type DelegationRunRecord = {
  parentRunId: string;
  parentToolCallId: string;
  childRunId: string;
  childSessionId: string;
  agentType: DelegationAgentType;
  goal: string;
  tools: string[];
  status: DelegationStatus;
  summary: string;
  events: DelegationEventCount[];
};

export type DelegationLedger = {
  records: DelegationRunRecord[];
  statusCounts: Record<DelegationStatus, number>;
  eventCounts: DelegationEventCount[];
};

export type DelegateTaskToolOptions = {
  childRunner: DelegationChildRunner;
  parentRunId?: string | (() => string | undefined);
  toolName?: string;
  description?: string;
  toolCatalog?: DelegationToolCatalogItem[];
  defaultAgentType?: DelegationAgentType;
  defaultMaxTurns?: number;
  defaultTimeoutMs?: number;
  defaultToolAllowlist?: string[];
  blockedToolNames?: string[];
  createChildRunId?: (input: {
    parentRunId: string;
    parentToolCallId: string;
    agentType: DelegationAgentType;
  }) => string;
  createChildSessionId?: (input: {
    parentRunId: string;
    childRunId: string;
    agentType: DelegationAgentType;
  }) => string;
};
