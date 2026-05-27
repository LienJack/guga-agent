import type { AgentEvent } from "./events";
import type { PermissionPolicy } from "./permissions";
import type { LocalModelPlugin, LocalPlugin } from "./plugins";
import type { ModelMetadata, Provider } from "./provider";
import type { ModelPurpose } from "./provider";
import type { ProviderRouterPolicy } from "./provider-router";
import type { ToolDefinition } from "./tools";

export type AgentRunOptions = {
  input: string;
  providerId?: string;
  modelId?: string;
  purpose?: ModelPurpose;
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
  model?: LocalModelPlugin;
  plugins?: LocalPlugin[];
  permissions?: PermissionPolicy;
  routerPolicy?: ProviderRouterPolicy;
};

export type AgentRuntimeShutdownResult = {
  ok: boolean;
  runId: string;
  failures: AgentRunFailure["error"][];
  events: AgentEvent[];
};

export type AgentRuntime = {
  registerProvider(provider: Provider): void;
  registerModel?(model: ModelMetadata): void;
  listModels?(): ModelMetadata[];
  registerTool(tool: ToolDefinition): void;
  onEvent(listener: (event: AgentEvent) => void): () => void;
  run(options: AgentRunOptions): Promise<AgentRunResult>;
  dispose(): Promise<AgentRuntimeShutdownResult>;
};
