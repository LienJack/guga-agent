import type { AgentEvent } from "./events";
import type { LocalPlugin } from "./plugins";
import type { ModelMetadata, Provider } from "./provider";
import type { ToolDefinition } from "./tools";

export type AgentRunOptions = {
  input: string;
  providerId: string;
  maxTurns?: number;
  signal?: AbortSignal;
  runId?: string;
};

export type AgentRunSuccess = {
  ok: true;
  runId: string;
  finalAnswer: string;
  events: AgentEvent[];
};

export type AgentRunFailure = {
  ok: false;
  runId: string;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  events: AgentEvent[];
};

export type AgentRunResult = AgentRunSuccess | AgentRunFailure;

export type AgentRuntimeOptions = {
  plugins?: LocalPlugin[];
};

export type AgentRuntimeShutdownResult = {
  ok: boolean;
  runId: string;
  failures: AgentRunFailure["error"][];
  events: AgentEvent[];
};

export type AgentRuntime = {
  registerProvider(provider: Provider): void;
  registerModel(model: ModelMetadata): void;
  listModels(): ModelMetadata[];
  registerTool(tool: ToolDefinition): void;
  onEvent(listener: (event: AgentEvent) => void): () => void;
  run(options: AgentRunOptions): Promise<AgentRunResult>;
  dispose(): Promise<AgentRuntimeShutdownResult>;
};
