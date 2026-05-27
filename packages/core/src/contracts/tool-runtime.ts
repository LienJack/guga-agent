import type { ArtifactReference } from "./persistence";

import type { ToolCall } from "./messages";
import type { PermissionProfile } from "./permissions";
import type { ToolEffect, ToolResult } from "./tools";

export type ToolSourceKind = "core" | "first-party" | "plugin" | "host" | "test";

export type ToolSourceMetadata = {
  kind: ToolSourceKind;
  pluginId?: string;
  packageName?: string;
  debugName?: string;
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
      status: "disabled" | "missing-backend" | "denied-by-policy" | "outside-workspace";
      reason: string;
      metadata?: Record<string, unknown>;
    };

export type ToolVisibility = "model" | "runtime-only" | "hidden";

export type ToolVisibilityDecision = {
  visible: boolean;
  toolName: string;
  reason?: "available" | "hidden" | "disabled" | "missing-backend" | "policy-denied" | "outside-workspace";
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
};

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
  reason?: ToolRuntimeFailureReason;
};

export type ToolAvailabilityContext = {
  profile?: PermissionProfile;
  hostPolicy?: Record<string, unknown>;
  workspaceRoot?: string;
  backendKinds?: string[];
};

export type ToolAvailabilityResolver = (context: ToolAvailabilityContext) => ToolAvailability;

export type ToolProjection = {
  toolName: string;
  description: string;
  inputSchema: unknown;
  effect: ToolEffect;
  visibility: ToolVisibilityDecision;
};
