import type { CoreMessage, ToolCall } from "./messages";
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
      type: typeof AgentEventType.Error;
      runId: string;
      code: string;
      message: string;
      details?: unknown;
    };
