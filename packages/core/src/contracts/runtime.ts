import type { AgentEvent } from "./events";
import type { PermissionPolicy } from "./permissions";
import type {
  ArtifactStore,
  EventStore,
  ForkBranchOptions,
  ForkBranchResult,
  ReplayAuditResult,
  ReplayCapability,
  ReplayConversationResult,
  ReplayFailureResult,
  ReplayModelInputResult,
  ReplayRequest,
  SessionStore
} from "./persistence";
import type { LocalModelPlugin, LocalPlugin } from "./plugins";
import type { CapabilityDescriptor } from "./plugins";
import type { ModelMetadata, Provider } from "./provider";
import type { ModelPurpose } from "./provider";
import type { ProviderRouterPolicy } from "./provider-router";
import type { ResumeReportResult } from "../persistence/resume-report";
import type { ToolDefinition } from "./tools";

export type AgentSessionIdentity = {
  sessionId?: string;
  branchId?: string;
  parentEventId?: string | null;
  leafEventId?: string | null;
};

export type AgentRunOptions = {
  input: string;
  providerId?: string;
  modelId?: string;
  purpose?: ModelPurpose;
  maxTurns?: number;
  signal?: AbortSignal;
  runId?: string;
  session?: AgentSessionIdentity;
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
  session?: AgentSessionIdentity;
  stores?: {
    events?: EventStore;
    sessions?: SessionStore;
    artifacts?: ArtifactStore;
  };
  replay?: ReplayCapability;
};

export type AgentRuntimeShutdownResult = {
  ok: boolean;
  runId: string;
  failures: AgentRunFailure["error"][];
  events: AgentEvent[];
};

export type AgentPersistenceCapabilities = {
  eventStore: EventStore | undefined;
  sessionStore: SessionStore | undefined;
  artifactStore: ArtifactStore | undefined;
  replay: ReplayCapability | undefined;
};

export type AgentResumeSessionOptions = {
  sessionId: string;
  branchId?: string;
  throughEventId?: string;
};

export type AgentRuntime = {
  registerProvider(provider: Provider): void;
  registerModel?(model: ModelMetadata): void;
  listModels?(): ModelMetadata[];
  listCapabilityDescriptors?(): CapabilityDescriptor[];
  registerTool(tool: ToolDefinition): void;
  onEvent(listener: (event: AgentEvent) => void): () => void;
  getPersistenceCapabilities(): AgentPersistenceCapabilities;
  resumeSession(options: AgentResumeSessionOptions): Promise<ResumeReportResult>;
  forkSession(options: ForkBranchOptions): Promise<ForkBranchResult>;
  replayConversation(request: ReplayRequest): Promise<ReplayConversationResult | ReplayFailureResult>;
  replayModelInput(request: ReplayRequest): Promise<ReplayModelInputResult | ReplayFailureResult>;
  replayAudit(request: ReplayRequest): Promise<ReplayAuditResult | ReplayFailureResult>;
  run(options: AgentRunOptions): Promise<AgentRunResult>;
  dispose(): Promise<AgentRuntimeShutdownResult>;
};
