import type { CoreMessage } from "./messages";
import type { ModelIdentifier, ModelMetadata, ModelPurpose } from "./provider";
import type { ToolCallCorrelation, ToolResultReference } from "./tool-runtime";
import type { ToolDefinition } from "./tools";

export const ContextSourceKind = {
  SystemPrompt: "system_prompt",
  DeveloperPrompt: "developer_prompt",
  History: "history",
  PendingTurn: "pending_turn",
  ToolResultPreview: "tool_result_preview",
  ArtifactReference: "artifact_reference",
  ResourceFile: "resource_file",
  SkillBody: "skill_body",
  PlanTodo: "plan_todo",
  CompactionSummary: "compaction_summary",
  HostContext: "host_context",
  ActiveTool: "active_tool",
  PermissionMode: "permission_mode"
} as const;

export type ContextSourceKind = (typeof ContextSourceKind)[keyof typeof ContextSourceKind];

export const ContextSourcePriority = {
  Critical: "critical",
  High: "high",
  Medium: "medium",
  Low: "low"
} as const;

export type ContextSourcePriority = (typeof ContextSourcePriority)[keyof typeof ContextSourcePriority];

export type ContextSourceProvenance = {
  origin: "core" | "plugin" | "host" | "tool" | "summary";
  pluginId?: string;
  toolCallId?: string;
  resourceUri?: string;
  metadata?: Record<string, unknown>;
};

export type ContextSourceTokenEstimate = {
  status: "known" | "estimated" | "unknown";
  tokens?: number;
  reason?: string;
};

export type ContextSourceReference = {
  type: "artifact" | "tool-result" | "resource" | "host-reference";
  id: string;
  label?: string;
  rereadInstruction?: string;
  metadata?: Record<string, unknown>;
};

export type ContextSourceDescriptor = {
  id: string;
  kind: ContextSourceKind;
  priority: ContextSourcePriority;
  provenance: ContextSourceProvenance;
  tokenEstimate: ContextSourceTokenEstimate;
  contentHash?: string;
  messageIndexes?: number[];
  references?: ContextSourceReference[];
  modelVisible: boolean;
  protected?: boolean;
  metadata?: Record<string, unknown>;
};

export type ContextBudget = {
  contextWindow?: number;
  reservedOutputTokens: number;
  usableInputTokens?: number;
  estimatedInputTokens: number;
  estimateStatus: "complete" | "partial" | "unknown";
  warningThreshold: number;
  compactThreshold: number;
};

export type ContextPressureLevel = "none" | "warning" | "compact";

export type ContextPressureDecision = {
  id: string;
  level: ContextPressureLevel;
  reason: string;
  budget: ContextBudget;
  sourceIds: string[];
};

export type ContextPolicyDecision =
  | {
      id: string;
      kind: "source-contribution" | "source-patch" | "annotation";
      phase: string;
      pluginId?: string;
      sourceIds: string[];
      reason?: string;
      metadata?: Record<string, unknown>;
    }
  | {
      id: string;
      kind: "gate";
      phase: string;
      pluginId?: string;
      allowed: boolean;
      reason: string;
      metadata?: Record<string, unknown>;
    }
  | {
      id: string;
      kind: "truncate" | "pairing-repair" | "pairing-retain" | "pairing-refuse" | "reinjection";
      phase: string;
      sourceIds: string[];
      reason: string;
      metadata?: Record<string, unknown>;
    };

export type ProjectionHashDescriptor = {
  algorithm: "sha256";
  value: string;
  inputVersion: string;
};

export type ModelInputProjection = {
  id: string;
  runId: string;
  turn: number;
  messages: CoreMessage[];
  tools: ToolDefinition[];
  sourceDescriptors: ContextSourceDescriptor[];
  budget: ContextBudget;
  pressure: ContextPressureDecision;
  policyDecisions: ContextPolicyDecision[];
  provider?: Partial<ModelIdentifier> & {
    purpose?: ModelPurpose;
    metadata?: ModelMetadata;
  };
  hash?: ProjectionHashDescriptor;
  metadata?: Record<string, unknown>;
};

export type ContextCompactionTrigger =
  | "provider-overflow"
  | "proactive-threshold"
  | "manual"
  | "local-preprocessing";

export type CompactionBoundary = {
  id: string;
  parentSummaryRef?: string;
  cutoffSourceId?: string;
  retainedSourceIds: string[];
  compactedSourceIds: string[];
};

export type CompactionSummaryFields = {
  objective: string;
  completedWork: string[];
  currentBlockers: string[];
  nextSteps: string[];
  keyFilesAndSymbols: string[];
  toolResultReferences: ContextSourceReference[];
  unresolvedQuestions: string[];
  userConstraints: string[];
};

export type CompactionResult = {
  id: string;
  trigger: ContextCompactionTrigger;
  summary: CompactionSummaryFields;
  boundary: CompactionBoundary;
  preTokenEstimate: number;
  postTokenEstimate: number;
  iterationNo: number;
  parentSummaryRef?: string;
  preprocessingApplied: {
    dedup: boolean;
    smartCollapse: boolean;
    parameterTruncation: boolean;
  };
  strippedRoundIds: string[];
  degradedTo: "llm" | "local-skeleton" | "none";
  failed?: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ReinjectionSource = {
  id: string;
  kind:
    | typeof ContextSourceKind.ResourceFile
    | typeof ContextSourceKind.PlanTodo
    | typeof ContextSourceKind.SkillBody
    | typeof ContextSourceKind.ActiveTool
    | typeof ContextSourceKind.PermissionMode
    | typeof ContextSourceKind.HostContext;
  priority: Exclude<ContextSourcePriority, typeof ContextSourcePriority.Critical>;
  content?: string;
  references?: ContextSourceReference[];
  runtimeContextId?: string;
  metadata?: Record<string, unknown>;
};

export type ProjectionLedgerEntry = {
  id: string;
  runId: string;
  turn: number;
  projectionId: string;
  sourceRefs: ContextSourceReference[];
  sourceDescriptors: Omit<ContextSourceDescriptor, "metadata">[];
  policyDecisions: ContextPolicyDecision[];
  compactionBoundary?: CompactionBoundary;
  projectionHash?: ProjectionHashDescriptor;
};

export type ToolResultView = {
  toolCallId: string;
  correlation?: ToolCallCorrelation;
  llmPreview: string;
  uiProjection?: string;
  auditMetadata: {
    originalContentChars?: number;
    omitted?: boolean;
    omissionReason?: string;
    reference?: ToolResultReference;
    rereadInstruction?: string;
    metadata?: Record<string, unknown>;
  };
};

export type ContextPolicyHookPhase =
  | "resources.discover"
  | "context.assemble"
  | "context.budget"
  | "context.truncate"
  | "context.compact.before"
  | "context.compact.after"
  | "context.reinject";

export type ContextPolicy = {
  id: string;
  name?: string;
  phases: ContextPolicyHookPhase[];
  priority?: number;
  timeoutMs?: number;
  permissionScope?: "read-only" | "context-write" | "compaction-gate";
  auditIdentity: {
    pluginId?: string;
    packageName?: string;
    label: string;
  };
  metadata?: Record<string, unknown>;
};
