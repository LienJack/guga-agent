import type { CoreMessage, ToolCall } from "./messages";
import type { ProviderResponse, Usage } from "./provider";
import type { ToolResult } from "./tools";

export type AgentEvent =
  | {
      type: "run.started";
      runId: string;
      input: string;
    }
  | {
      type: "run.finished";
      runId: string;
      status: "completed" | "failed";
      reason?: string;
    }
  | {
      type: "model.requested";
      runId: string;
      turn: number;
      providerId: string;
      messages: CoreMessage[];
      toolNames: string[];
    }
  | {
      type: "model.responded";
      runId: string;
      turn: number;
      response: ProviderResponse;
    }
  | {
      type: "tool.called";
      runId: string;
      turn: number;
      call: ToolCall;
    }
  | {
      type: "tool.result";
      runId: string;
      turn: number;
      call: ToolCall;
      result: ToolResult;
    }
  | {
      type: "usage.recorded";
      runId: string;
      turn: number;
      usage: Usage;
    }
  | {
      type: "error";
      runId: string;
      code: string;
      message: string;
      details?: unknown;
    };
