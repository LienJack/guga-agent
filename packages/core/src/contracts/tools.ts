import type { ToolCall } from "./messages";
import type { ToolPermissionMetadata } from "./permissions";
import type {
  ToolActionMetadata,
  ToolAvailability,
  ToolAvailabilityResolver,
  ToolBackendRequirement,
  ToolCredentialBinding,
  ToolEnvironmentRequirement,
  ToolExecutionMode,
  ToolMetadataEvalHints,
  ToolPrincipalSummary,
  ToolRendererMetadata,
  ToolResultBudget,
  ToolSandboxRequirement,
  ToolSchedulerMetadata,
  ToolSourceMetadata,
  ToolVisibility
} from "./tool-runtime";

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

export type ToolRuntimeMetadata = {
  permission?: ToolPermissionMetadata;
  action?: ToolActionMetadata;
  principal?: ToolPrincipalSummary;
  credentials?: readonly ToolCredentialBinding[];
  sandbox?: ToolSandboxRequirement;
  environment?: ToolEnvironmentRequirement;
  executionMode?: ToolExecutionMode;
  timeoutMs?: number;
  backend?: ToolBackendRequirement;
  availability?: ToolAvailability | ToolAvailabilityResolver;
  visibility?: ToolVisibility;
  scheduler?: ToolSchedulerMetadata;
  resultBudget?: ToolResultBudget;
  renderer?: ToolRendererMetadata;
  source?: ToolSourceMetadata;
  eval?: ToolMetadataEvalHints;
  debug?: Record<string, unknown>;
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: unknown;
  effect: ToolEffect;
  runtime?: ToolRuntimeMetadata;
  execute(input: unknown, context: ToolExecutionContext): Promise<ToolResult> | ToolResult;
};
