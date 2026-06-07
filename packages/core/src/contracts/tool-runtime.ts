import type { ArtifactReference } from "./persistence";

import type { ToolCall } from "./messages";
import type { TrustDescriptor } from "./operations";
import type { PermissionProfile } from "./permissions";
import type { ToolEffect, ToolResult } from "./tools";

export type ToolSourceKind = "core" | "first-party" | "plugin" | "mcp" | "host" | "test";

export type ToolSourceMetadata = {
  kind: ToolSourceKind;
  pluginId?: string;
  packageName?: string;
  namespace?: string;
  trust?: TrustDescriptor;
  upstreamId?: string;
  debugName?: string;
};

export type ToolActionCategory =
  | "read"
  | "search"
  | "write"
  | "execute"
  | "external"
  | "delegate"
  | "communicate"
  | "transform"
  | "inspect"
  | "custom";

export type ToolActionRisk = "low" | "medium" | "high" | "critical";

export type ToolActionEffectKind =
  | "filesystem"
  | "process"
  | "network"
  | "git"
  | "credential"
  | "model"
  | "context"
  | "memory"
  | "delegation"
  | "custom";

export type ToolActionEffect = {
  kind: ToolActionEffectKind;
  access?: ToolResourceAccess;
  target?: string;
  external?: boolean;
  irreversible?: boolean;
  metadata?: Record<string, unknown>;
};

export type ToolActionMetadata = {
  category: ToolActionCategory;
  risk?: ToolActionRisk;
  label?: string;
  summary?: string;
  effects?: readonly ToolActionEffect[];
  tags?: readonly string[];
  metadata?: Record<string, unknown>;
};

export type ToolPrincipalKind = "user" | "workspace" | "service" | "agent" | "host" | "unknown";

export type ToolPrincipalSummary = {
  kind: ToolPrincipalKind;
  id?: string;
  label?: string;
  scopes?: readonly string[];
  metadata?: Record<string, unknown>;
};

export type ToolCredentialBinding = {
  credentialRef: string;
  providerId?: string;
  principal?: ToolPrincipalSummary;
  scopes?: readonly string[];
  required?: boolean;
  modelVisible?: false;
  metadata?: Record<string, unknown>;
};

export type ToolSandboxNetworkPolicy = "none" | "restricted" | "workspace" | "unrestricted";

export type ToolSandboxRequirement = {
  isolation: "none" | "workspace" | "process" | "container" | "remote";
  workspace?: {
    required?: boolean;
    writeAccess?: "none" | "scoped" | "workspace";
    allowedPaths?: readonly string[];
  };
  network?: ToolSandboxNetworkPolicy;
  backendKinds?: readonly string[];
  timeoutMs?: number;
  output?: {
    maxBytes?: number;
    allowArtifacts?: boolean;
  };
  metadata?: Record<string, unknown>;
};

export type ToolEnvironmentRequirement = {
  credentials?: readonly ToolCredentialBinding[];
  sandbox?: ToolSandboxRequirement;
  backendKinds?: readonly string[];
  metadata?: Record<string, unknown>;
};

export type ToolEnvironmentStatus = "satisfied" | "missing-credential" | "missing-sandbox" | "missing-backend" | "denied-by-policy";

export type ToolEnvironmentAssessment = {
  status: ToolEnvironmentStatus;
  reason?: string;
  credentials?: readonly ToolCredentialBinding[];
  sandbox?: ToolSandboxRequirement;
  backendKinds?: readonly string[];
  metadata?: Record<string, unknown>;
};

export type ToolMetadataEvalHints = {
  categories?: readonly string[];
  coveredRisks?: readonly ToolActionRisk[];
  expectedUseCases?: readonly string[];
  unsafeUseCases?: readonly string[];
  selectionTags?: readonly string[];
  auditRequirements?: readonly string[];
  metadata?: Record<string, unknown>;
};

export type ToolRendererCategory =
  | "read"
  | "edit"
  | "search"
  | "execute"
  | "git"
  | "custom";

export type ToolRendererMetadata = {
  category: ToolRendererCategory;
  label?: string;
  icon?: string;
  metadata?: Record<string, unknown>;
};

export type ToolBackendRequirement = {
  kind: "local-workspace" | "local-shell" | "local-git" | "custom";
  optional?: boolean;
  description?: string;
};

export type ToolAvailability =
  | {
      status: "available";
    }
  | {
      status:
        | "disabled"
        | "missing-backend"
        | "missing-credential"
        | "missing-sandbox"
        | "denied-by-policy"
        | "outside-workspace";
      reason: string;
      metadata?: Record<string, unknown>;
    };

export type ToolVisibility = "model" | "runtime-only" | "hidden";

export type ToolVisibilityDecision = {
  visible: boolean;
  toolName: string;
  reason?:
    | "available"
    | "hidden"
    | "disabled"
    | "missing-backend"
    | "missing-credential"
    | "missing-sandbox"
    | "policy-denied"
    | "outside-workspace";
  metadata?: Record<string, unknown>;
};

export type ToolCapabilityLease = {
  leaseId: string;
  runId?: string;
  turn?: number;
  issuedAt?: string;
  visibleToolNames: readonly string[];
  decisions: readonly ToolVisibilityDecision[];
  metadata?: Record<string, unknown>;
};

export type ToolExecutionMode = "automatic" | "interactive" | "background";

export type ToolConcurrencyMode = "read-only" | "serial" | "resource-scoped";

export type ToolResourceAccess = "read" | "write" | "execute";

export type ToolResourceScope = {
  kind: "path" | "workspace" | "shell" | "git" | "custom";
  access: ToolResourceAccess;
  value: string;
  metadata?: Record<string, unknown>;
};

export type ToolResourceScopeExtractor = (
  input: unknown,
  call: ToolCall
) => readonly ToolResourceScope[] | ToolResourceScope[];

export type ToolResourceMetadata =
  | {
      mode: "none";
    }
  | {
      mode: "static";
      scopes: readonly ToolResourceScope[];
    }
  | {
      mode: "extractor";
      extract: ToolResourceScopeExtractor;
    };

export type ToolSchedulerMetadata = {
  concurrency?: ToolConcurrencyMode;
  resources?: ToolResourceMetadata;
};

export type ToolResultBudget = {
  maxContentChars?: number;
  strategy?: "truncate" | "reference";
};

export type ToolResultReference = {
  type: "artifact" | "buffer" | "host-reference";
  id: string;
  label?: string;
  artifact?: ArtifactReference;
  metadata?: Record<string, unknown>;
};

export type BudgetedToolResult = ToolResult & {
  budget?: {
    applied: boolean;
    originalContentChars?: number;
    notice?: string;
    reference?: ToolResultReference;
    rereadInstruction?: string;
    omittedContentChars?: number;
    view?: {
      llmPreview: string;
      uiProjection?: string;
      auditMetadata?: Record<string, unknown>;
    };
  };
};

export type ToolCallCorrelation = {
  runId: string;
  turn: number;
  toolCallId: string;
  attempt: number;
  batchId?: string;
  source?: RuntimeToolInvocationSource;
  taskId?: string;
};

export type ToolIntent = {
  id: string;
  toolName: string;
  toolCallId: string;
  action?: ToolActionMetadata;
  summary?: string;
  inputSummary?: string;
  resourceScopes?: readonly ToolResourceScope[];
  principal?: ToolPrincipalSummary;
  credentials?: readonly ToolCredentialBinding[];
  environment?: ToolEnvironmentRequirement;
  leaseId?: string;
  correlation?: Partial<ToolCallCorrelation>;
  metadata?: Record<string, unknown>;
};

export type RuntimeToolInvocationSource = "controller" | "verification" | "host";

export type ToolRuntimeFailureReason =
  | "schema_invalid"
  | "hook_blocked"
  | "permission_denied"
  | "permission_timeout"
  | "cancelled"
  | "timeout"
  | "exception"
  | "missing_tool"
  | "unavailable";

export type ToolRuntimeResult = {
  call: ToolCall;
  result: ToolResult;
  correlation: ToolCallCorrelation;
  intent?: ToolIntent;
  reason?: ToolRuntimeFailureReason;
};

export type RuntimeToolInvokeOptions = {
  runId: string;
  call: ToolCall;
  turn?: number;
  attempt?: number;
  batchId?: string;
  source: RuntimeToolInvocationSource;
  taskId?: string;
  signal?: AbortSignal;
  availabilityContext?: ToolAvailabilityContext;
};

export type ToolAvailabilityContext = {
  profile?: PermissionProfile;
  hostPolicy?: Record<string, unknown>;
  workspaceRoot?: string;
  backendKinds?: string[];
  credentials?: readonly ToolCredentialBinding[];
  sandbox?: ToolSandboxRequirement;
  environment?: ToolEnvironmentAssessment;
};

export type ToolAvailabilityResolver = (context: ToolAvailabilityContext) => ToolAvailability;

export type ToolProjection = {
  toolName: string;
  description: string;
  inputSchema: unknown;
  effect: ToolEffect;
  visibility: ToolVisibilityDecision;
  action?: ToolActionMetadata;
  source?: ToolSourceMetadata;
  lease?: ToolCapabilityLease;
};

export type ToolView = {
  lease: ToolCapabilityLease;
  tools: readonly ToolProjection[];
  filtered: readonly ToolVisibilityDecision[];
};
