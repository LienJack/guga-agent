import type { CoreMessage, ToolCall } from "./messages";
import type {
  CompactionResult,
  ContextPolicyDecision,
  ContextPressureDecision,
  ModelInputProjection,
  ReinjectionSource
} from "./context";
import type { HookPhase, PreToolGateDecision, ToolHookDecision } from "./hooks";
import type { ModelEvent } from "./model-events";
import type { PermissionDecision, PermissionRequest } from "./permissions";
import type { PluginCapabilityKind, PluginFailureKind } from "./plugins";
import type { ProviderResponse, Usage } from "./provider";
import type { BudgetedToolResult, ToolCallCorrelation, ToolVisibilityDecision } from "./tool-runtime";
import type { ToolResult } from "./tools";

export const AgentEventType = {
  RunStarted: "run.started",
  RunFinished: "run.finished",
  ModelRequested: "model.requested",
  ModelResponded: "model.responded",
  ModelEvent: "model.event",
  ToolQueued: "tool.queued",
  ToolCalled: "tool.called",
  ToolStarted: "tool.started",
  ToolResult: "tool.result",
  ToolCompleted: "tool.completed",
  ToolFailed: "tool.failed",
  ToolDenied: "tool.denied",
  ToolCancelled: "tool.cancelled",
  ToolTimeout: "tool.timeout",
  ToolResultBudgeted: "tool.result.budgeted",
  ToolVisibilityFiltered: "tool.visibility.filtered",
  PermissionRequested: "tool.permission.requested",
  PermissionResolved: "tool.permission.resolved",
  UsageRecorded: "usage.recorded",
  ContextProjectionCreated: "context.projection.created",
  ContextPressure: "context.pressure",
  ContextCompactStarted: "context.compact.started",
  ContextCompactCompleted: "context.compact.completed",
  ContextCompactFailed: "context.compact.failed",
  ContextReinjected: "context.reinjected",
  ContextHookDecision: "context.hook.decision",
  ProviderInputCommitted: "provider.input.committed",
  SessionForked: "session.forked",
  SessionLeafMoved: "session.leaf_moved",
  SessionResumed: "session.resumed",
  ReplayDiagnostic: "replay.diagnostic",
  PluginInitialized: "plugin.initialized",
  PluginShutdown: "plugin.shutdown",
  PluginCapabilityRegistered: "plugin.capability_registered",
  HookDecision: "hook.decision",
  HookFailure: "hook.failure",
  PluginFailure: "plugin.failure",
  Error: "error"
} as const;

export type AgentEvent =
  | {
      type: typeof AgentEventType.RunStarted;
      runId: string;
      input: string;
    }
  | {
      type: typeof AgentEventType.RunFinished;
      runId: string;
      status: "completed" | "failed";
      reason?: string;
    }
  | {
      type: typeof AgentEventType.ModelRequested;
      runId: string;
      turn: number;
      providerId: string;
      messages: CoreMessage[];
      toolNames: string[];
    }
  | {
      type: typeof AgentEventType.ModelResponded;
      runId: string;
      turn: number;
      response: ProviderResponse;
    }
  | {
      type: typeof AgentEventType.ModelEvent;
      runId: string;
      turn: number;
      event: ModelEvent;
    }
  | {
      type: typeof AgentEventType.ToolQueued;
      runId: string;
      turn: number;
      correlation: ToolCallCorrelation;
      call: ToolCall;
    }
  | {
      type: typeof AgentEventType.ToolCalled;
      runId: string;
      turn: number;
      call: ToolCall;
      correlation?: ToolCallCorrelation;
    }
  | {
      type: typeof AgentEventType.ToolStarted;
      runId: string;
      turn: number;
      correlation: ToolCallCorrelation;
      call: ToolCall;
    }
  | {
      type: typeof AgentEventType.ToolResult;
      runId: string;
      turn: number;
      call: ToolCall;
      result: ToolResult;
      correlation?: ToolCallCorrelation;
    }
  | {
      type: typeof AgentEventType.ToolCompleted;
      runId: string;
      turn: number;
      correlation: ToolCallCorrelation;
      call: ToolCall;
      result: ToolResult;
    }
  | {
      type: typeof AgentEventType.ToolFailed;
      runId: string;
      turn: number;
      correlation: ToolCallCorrelation;
      call: ToolCall;
      result: ToolResult;
    }
  | {
      type: typeof AgentEventType.ToolDenied;
      runId: string;
      turn: number;
      correlation: ToolCallCorrelation;
      call: ToolCall;
      result: ToolResult;
    }
  | {
      type: typeof AgentEventType.ToolCancelled;
      runId: string;
      turn: number;
      correlation: ToolCallCorrelation;
      call: ToolCall;
      result: ToolResult;
    }
  | {
      type: typeof AgentEventType.ToolTimeout;
      runId: string;
      turn: number;
      correlation: ToolCallCorrelation;
      call: ToolCall;
      result: ToolResult;
    }
  | {
      type: typeof AgentEventType.ToolResultBudgeted;
      runId: string;
      turn: number;
      correlation: ToolCallCorrelation;
      call: ToolCall;
      result: BudgetedToolResult;
    }
  | {
      type: typeof AgentEventType.ToolVisibilityFiltered;
      runId: string;
      turn: number;
      decision: ToolVisibilityDecision;
    }
  | {
      type: typeof AgentEventType.PermissionRequested;
      runId: string;
      turn: number;
      request: PermissionRequest;
    }
  | {
      type: typeof AgentEventType.PermissionResolved;
      runId: string;
      turn: number;
      request: PermissionRequest;
      decision: PermissionDecision;
    }
  | {
      type: typeof AgentEventType.UsageRecorded;
      runId: string;
      turn: number;
      usage: Usage;
    }
  | {
      type: typeof AgentEventType.ContextProjectionCreated;
      runId: string;
      turn: number;
      projection: ModelInputProjection;
    }
  | {
      type: typeof AgentEventType.ContextPressure;
      runId: string;
      turn: number;
      projectionId: string;
      decision: ContextPressureDecision;
    }
  | {
      type: typeof AgentEventType.ContextCompactStarted;
      runId: string;
      turn: number;
      projectionId: string;
      trigger: CompactionResult["trigger"];
    }
  | {
      type: typeof AgentEventType.ContextCompactCompleted;
      runId: string;
      turn: number;
      projectionId: string;
      result: CompactionResult;
    }
  | {
      type: typeof AgentEventType.ContextCompactFailed;
      runId: string;
      turn: number;
      projectionId: string;
      result: CompactionResult;
    }
  | {
      type: typeof AgentEventType.ContextReinjected;
      runId: string;
      turn: number;
      projectionId: string;
      sources: ReinjectionSource[];
    }
  | {
      type: typeof AgentEventType.ContextHookDecision;
      runId: string;
      turn?: number;
      phase: HookPhase;
      pluginId: string;
      hookId: string;
      decision: ContextPolicyDecision;
    }
  | {
      type: typeof AgentEventType.ProviderInputCommitted;
      runId: string;
      turn: number;
      projectionId: string;
      projectionHash?: ModelInputProjection["hash"];
      artifactIds?: string[];
    }
  | {
      type: typeof AgentEventType.SessionForked;
      runId: string;
      sessionId: string;
      branchId: string;
      fromBranchId: string;
      fromEventId: string;
    }
  | {
      type: typeof AgentEventType.SessionLeafMoved;
      runId: string;
      sessionId: string;
      branchId: string;
      eventId: string | null;
      reason: "session-created" | "host-selected" | "fork-created" | "resume-selected" | "repair-selected";
    }
  | {
      type: typeof AgentEventType.SessionResumed;
      runId: string;
      sessionId: string;
      branchId: string;
      eventId?: string;
      interruptedCount: number;
      corruptionCount: number;
    }
  | {
      type: typeof AgentEventType.ReplayDiagnostic;
      runId: string;
      sessionId: string;
      branchId?: string;
      severity: "info" | "warning" | "error";
      code: string;
      message: string;
      eventId?: string;
    }
  | {
      type: typeof AgentEventType.PluginInitialized;
      runId: string;
      pluginId: string;
      pluginName?: string;
    }
  | {
      type: typeof AgentEventType.PluginShutdown;
      runId: string;
      pluginId: string;
      status: "completed" | "failed";
    }
  | {
      type: typeof AgentEventType.PluginCapabilityRegistered;
      runId: string;
      pluginId: string;
      capability: PluginCapabilityKind;
      name: string;
    }
  | {
      type: typeof AgentEventType.HookDecision;
      runId: string;
      phase: HookPhase;
      pluginId: string;
      hookId: string;
      call: ToolCall;
      correlation?: ToolCallCorrelation;
      decision: PreToolGateDecision | ToolHookDecision;
    }
  | {
      type: typeof AgentEventType.HookFailure;
      runId: string;
      phase: string;
      pluginId: string;
      hookId: string;
      message: string;
      details?: unknown;
    }
  | {
      type: typeof AgentEventType.PluginFailure;
      runId: string;
      pluginId: string;
      failure: PluginFailureKind;
      code: string;
      message: string;
      details?: unknown;
    }
  | {
      type: typeof AgentEventType.Error;
      runId: string;
      code: string;
      message: string;
      details?: unknown;
    };
