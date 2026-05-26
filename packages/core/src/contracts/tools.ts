import type { ToolCall } from "./messages";

export type ToolEffect = "read" | "write" | "execute" | "external";

export type ToolExecutionContext = {
  call: ToolCall;
  signal?: AbortSignal;
};

export type ToolSuccess = {
  ok: true;
  content: string;
  metadata?: Record<string, unknown>;
};

export type ToolFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: Record<string, unknown>;
};

export type ToolResult = ToolSuccess | ToolFailure;

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: unknown;
  effect: ToolEffect;
  execute(input: unknown, context: ToolExecutionContext): Promise<ToolResult> | ToolResult;
};
