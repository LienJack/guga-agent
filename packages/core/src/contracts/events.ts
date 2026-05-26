import type { CoreMessage, ToolCall } from "./messages";
import type { PreToolGateDecision } from "./hooks";
import type { PluginCapabilityKind, PluginFailureKind } from "./plugins";
import type { ProviderResponse, Usage } from "./provider";
import type { ToolResult } from "./tools";

export const AgentEventType = {
  RunStarted: "run.started",
  RunFinished: "run.finished",
  ModelRequested: "model.requested",
  ModelResponded: "model.responded",
  ToolCalled: "tool.called",
  ToolResult: "tool.result",
  UsageRecorded: "usage.recorded",
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
      type: typeof AgentEventType.ToolCalled;
      runId: string;
      turn: number;
      call: ToolCall;
    }
  | {
      type: typeof AgentEventType.ToolResult;
      runId: string;
      turn: number;
      call: ToolCall;
      result: ToolResult;
    }
  | {
      type: typeof AgentEventType.UsageRecorded;
      runId: string;
      turn: number;
      usage: Usage;
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
      phase: "pre_tool.gate";
      pluginId: string;
      hookId: string;
      call: ToolCall;
      decision: PreToolGateDecision;
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
