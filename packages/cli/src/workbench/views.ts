import type { InteractionRequest } from "@guga-agent/host-protocol";
import type {
  PendingInteractionProjection,
  PendingPermissionProjection,
  QueueSummary,
  TranscriptBlock,
  WorkbenchDisconnectedReason,
  WorkbenchStartupMetadata,
  WorkbenchState
} from "./state";

type ActiveTaskPlanItem = NonNullable<NonNullable<NonNullable<WorkbenchState["activeTask"]>["plan"]>["ledgerItems"]>[number];
type PlatformCapability = Extract<NonNullable<WorkbenchState["platformPanel"]>, { kind: "capabilities" }>["capabilities"][number];
type PlatformTask = Extract<NonNullable<WorkbenchState["platformPanel"]>, { kind: "tasks" }>["tasks"][number];
type PlatformStatus = Extract<NonNullable<WorkbenchState["platformPanel"]>, { kind: "status" }>["status"];
type PlatformDiagnostic = PlatformStatus["diagnostics"][number];

export type StartupViewModel = {
  projectPath: string;
  sessionLabel: string;
  profileLabel: string;
  modelLabel: string;
  configSourceLabel: string;
  slashCommands: string[];
};

export type StatusBarViewModel = {
  runStatus: WorkbenchState["runStatus"];
  text: string;
  sessionId?: string;
  runId?: string;
  taskLabel?: string;
  queueLabel: string;
  usageLabel: string;
  inputLocked: boolean;
  inputLockHint?: string;
  disconnectedReason?: WorkbenchDisconnectedReason;
};

export type TranscriptViewBlock = TranscriptBlock & {
  title: string;
  detail: string;
};

export type ActiveRunViewModel = {
  sessionId: string;
  runId: string;
  status: WorkbenchState["runStatus"];
  text: string;
};

export type PendingPermissionViewModel = PendingPermissionProjection & {
  title: string;
  detail: string;
  riskLabel: string;
  scopeLabel: string;
  inputPreview?: string;
  responseHint: string;
};

export type PendingInteractionViewModel = PendingInteractionProjection & {
  title: string;
  detail: string;
  scopeLabel: string;
  responseHint: string;
};

export type TaskProgressItemViewModel = {
  id: string;
  title: string;
  status: string;
  detail: string;
  isCurrent: boolean;
  isBlocked: boolean;
};

export type TaskProgressViewModel = {
  title: string;
  objective: string;
  phaseLabel: string;
  progressLabel: string;
  currentItemLabel?: string;
  verificationLabel?: string;
  completionLabel: string;
  blockedReason?: string;
  items: TaskProgressItemViewModel[];
};

export type PlatformPanelRowTone = "normal" | "muted" | "warning" | "danger";

export type PlatformPanelRowViewModel = {
  label: string;
  value: string;
  detail?: string;
  tone: PlatformPanelRowTone;
};

export type PlatformPanelViewModel = {
  title: string;
  subtitle?: string;
  emptyLabel?: string;
  rows: PlatformPanelRowViewModel[];
};

export type ContinuityViewModel = {
  title: string;
  detail: string;
  actionHint?: string;
  facts: string[];
  tone: PlatformPanelRowTone;
};

export type ConnectionViewModel =
  | {
      status: "connected";
      inputLocked: false;
    }
  | {
      status: "disconnected";
      reason: WorkbenchDisconnectedReason;
      message: string;
      inputLocked: true;
      inputLockHint: string;
      expectedSeq?: number;
      actualSeq?: number;
    };

export type WorkbenchViewModel = {
  startup: StartupViewModel;
  welcome: WelcomeViewModel;
  transcript: TranscriptViewBlock[];
  statusBar: StatusBarViewModel;
  activeRun?: ActiveRunViewModel;
	  pendingPermission?: PendingPermissionViewModel;
	  pendingInteraction?: PendingInteractionViewModel;
	  taskProgress?: TaskProgressViewModel;
	  platformPanel?: PlatformPanelViewModel;
	  continuity?: ContinuityViewModel;
	  connection: ConnectionViewModel;
	  queue: QueueSummary;
	};

export type WelcomeViewModel = {
  visible: boolean;
  title: string;
  modelLabel: string;
  contextLabel: string;
  costLabel: string;
  cwdLabel: string;
  tips: readonly string[];
  whatsNew: readonly string[];
  commandLabel: string;
};

export function createWorkbenchViewModel(state: WorkbenchState): WorkbenchViewModel {
  const startup = createStartupViewModel(state.startup);
  const transcript = selectVisibleTranscriptBlocks(state).map(createTranscriptViewBlock);
  const statusBar = createStatusBarViewModel(state);
  const view: WorkbenchViewModel = {
    startup,
    welcome: createWelcomeViewModel(state, startup, statusBar, transcript),
    transcript,
    statusBar,
    connection: createConnectionViewModel(state),
    queue: state.queue
  };
  const activeRun = createActiveRunViewModel(state);
  if (activeRun) {
    view.activeRun = activeRun;
  }
  if (state.pendingPermission) {
    view.pendingPermission = createPendingPermissionViewModel(state.pendingPermission);
  }
  if (state.pendingInteraction) {
    view.pendingInteraction = createPendingInteractionViewModel(state.pendingInteraction);
  }
  if (state.activeTask) {
    view.taskProgress = createTaskProgressViewModel(state);
  }
  if (state.platformPanel) {
    view.platformPanel = createPlatformPanelViewModel(state);
  }
  if (state.continuity) {
    view.continuity = createContinuityViewModel(state);
  }
  return view;
}

export function selectVisibleTranscriptBlocks(state: WorkbenchState): TranscriptBlock[] {
  return state.transcriptBlocks.filter((block) => block.lastSeq > state.clearedThroughSeq);
}

function createStartupViewModel(startup: WorkbenchStartupMetadata): StartupViewModel {
  return {
    projectPath: startup.projectPath,
    sessionLabel: startup.sessionId ? `session ${startup.sessionId}` : "new session",
    profileLabel: startup.profileId,
    modelLabel: startup.modelId ?? "default model",
    configSourceLabel: startup.configSource ?? "default config",
    slashCommands: startup.slashCommands
  };
}

function createStatusBarViewModel(state: WorkbenchState): StatusBarViewModel {
  const connection = createConnectionViewModel(state);
  const status: StatusBarViewModel = {
    runStatus: state.runStatus,
    text: state.statusText,
    queueLabel: queueLabel(state.queue),
    usageLabel: usageLabel(state),
    inputLocked: connection.inputLocked
  };
  if (connection.status === "disconnected") {
    status.inputLockHint = connection.inputLockHint;
    status.disconnectedReason = connection.reason;
  }
  if (state.activeSessionId) {
    status.sessionId = state.activeSessionId;
  }
  if (state.activeRunId) {
    status.runId = state.activeRunId;
  }
  if (state.activeTask) {
    const ledger = state.activeTask.ledgerSummary
      ? ` ${state.activeTask.ledgerSummary.done + state.activeTask.ledgerSummary.verified}/${state.activeTask.ledgerSummary.total}`
      : "";
    status.taskLabel = `task ${state.activeTask.phase}${ledger} attempt ${state.activeTask.attempt}`;
  }
  return status;
}

function createWelcomeViewModel(
  state: WorkbenchState,
  startup: StartupViewModel,
  statusBar: StatusBarViewModel,
  transcript: readonly TranscriptViewBlock[]
): WelcomeViewModel {
  return {
    visible: transcript.length === 0 && state.runStatus === "idle" && state.lastSeq === 0,
    title: "Welcome to Guga",
    modelLabel: startup.modelLabel,
    contextLabel: "context unknown",
    costLabel: state.usage.costUsd === undefined ? "cost unknown" : `$${state.usage.costUsd.toFixed(4)}`,
    cwdLabel: startup.projectPath,
    tips: [
      "Use Tab to complete slash commands.",
      "Run /status to inspect model, tools and session facts.",
      "Press Esc to abort an active run."
    ],
    whatsNew: [
      "Ink workbench now separates reasoning, tools and assistant output.",
      `Usage meter: ${statusBar.usageLabel}`
    ],
    commandLabel: startup.slashCommands.length > 0
      ? `Commands ${startup.slashCommands.slice(0, 5).join(" ")}`
      : "Commands unavailable"
  };
}

function createActiveRunViewModel(state: WorkbenchState): ActiveRunViewModel | undefined {
  if (!state.activeSessionId || !state.activeRunId || state.runStatus === "idle") {
    return undefined;
  }
  return {
    sessionId: state.activeSessionId,
    runId: state.activeRunId,
    status: state.runStatus,
    text: state.statusText
  };
}

function createConnectionViewModel(state: WorkbenchState): ConnectionViewModel {
  if (!state.disconnected) {
    return {
      status: "connected",
      inputLocked: false
    };
  }
  return {
    status: "disconnected",
    reason: state.disconnected.reason,
    message: state.disconnected.message,
    inputLocked: true,
    inputLockHint: state.disconnected.lockHint,
    ...(state.disconnected.expectedSeq !== undefined ? { expectedSeq: state.disconnected.expectedSeq } : {}),
    ...(state.disconnected.actualSeq !== undefined ? { actualSeq: state.disconnected.actualSeq } : {})
  };
}

function createPendingPermissionViewModel(permission: PendingPermissionProjection): PendingPermissionViewModel {
  const inputPreview = previewUnknown(permission.input);
  return {
    ...permission,
    title: `Permission pending: ${permission.toolName}`,
    detail: permission.reason ?? inputPreview,
    riskLabel: permissionRiskLabel(permission),
    scopeLabel: `run ${permission.runId} | call ${permission.callId} | once`,
    ...(inputPreview ? { inputPreview } : {}),
    responseHint: "type allow or deny; unknown input is denied"
  };
}

function createPendingInteractionViewModel(interaction: PendingInteractionProjection): PendingInteractionViewModel {
  return {
    ...interaction,
    title: `Interaction pending: ${interaction.request.kind}`,
    detail: previewUnknown(requestDetail(interaction.request)),
    scopeLabel: `run ${interaction.runId} | request ${interaction.requestId}`,
    responseHint: "enter response text or JSON"
  };
}

function createTaskProgressViewModel(state: WorkbenchState): TaskProgressViewModel {
  const task = state.activeTask;
  if (!task) {
    throw new Error("Task progress requires an active task");
  }
  const ledger = task.ledgerSummary;
  const doneCount = ledger ? ledger.done + ledger.verified : 0;
  const totalCount = ledger?.total ?? task.plan?.ledgerItems?.length ?? 0;
  const currentItemId = ledger?.currentItemId;
  const blockedItemId = ledger?.blockedItemId;
  const items = (task.plan?.ledgerItems ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    status: item.status,
    detail: taskItemDetail(item),
    isCurrent: item.id === currentItemId,
    isBlocked: item.id === blockedItemId || item.status === "blocked"
  }));
  const verification = task.lastVerification
    ? `${task.lastVerification.status}: ${task.lastVerification.command}`
    : undefined;
  const requiredChecks = task.plan?.checks.filter((check) => check.required) ?? [];
  const completionLabel = task.completionEvidence
    ? `completed with ${task.completionEvidence.passingVerificationAttemptIds.length} passing verification`
    : requiredChecks.length > 0
      ? `${requiredChecks.length} required verification${requiredChecks.length === 1 ? "" : "s"} before completion`
      : "completion evidence required";
  return {
    title: `Task ${task.phase}`,
    objective: task.objective,
    phaseLabel: `phase ${task.phase} attempt ${task.attempt}`,
    progressLabel: totalCount > 0 ? `${doneCount}/${totalCount} settled` : "no plan ledger",
    ...(currentItemId ? { currentItemLabel: `current ${currentItemId}` } : {}),
    ...(verification ? { verificationLabel: verification } : {}),
    completionLabel,
    ...(task.terminalReason ? { blockedReason: task.terminalReason.message } : {}),
    items
  };
}

function createPlatformPanelViewModel(state: WorkbenchState): PlatformPanelViewModel {
  const panel = state.platformPanel;
  if (!panel) {
    throw new Error("Platform panel requires panel state");
  }
  if (panel.kind === "capabilities") {
    return {
      title: panel.title,
      subtitle: panel.command,
      ...(panel.capabilities.length === 0 ? { emptyLabel: panel.emptyReason } : {}),
      rows: panel.capabilities.map((capability) => platformPanelRow({
        label: capability.name,
        value: `${capability.type} ${capability.status}`,
        detail: capabilityDetail(capability),
        tone: capabilityTone(capability.status)
      }))
    };
  }
  if (panel.kind === "tasks") {
    return {
      title: panel.title,
      subtitle: panel.command,
      ...(panel.tasks.length === 0 ? { emptyLabel: panel.emptyReason } : {}),
      rows: panel.tasks.map((task) => platformPanelRow({
        label: task.objective,
        value: `${task.state} attempt ${task.attempt}/${task.maxRepairAttempts}`,
        detail: taskDetail(task),
        tone: task.state === "failed" ? "danger" : task.state === "blocked" ? "warning" : "normal"
      }))
    };
  }
  const status = panel.status;
  return {
    title: panel.title,
    subtitle: panel.summary,
    rows: [
      platformPanelRow({
        label: "updated",
        value: status.updatedAt,
        tone: "muted"
      }),
      platformPanelRow({
        label: "providers",
        value: String(status.health.length),
        detail: status.health.map((health) => `${health.providerId} ${health.status}`).join("; "),
        tone: status.health.some((health) => health.status === "unavailable") ? "danger" : status.health.some((health) => health.status === "degraded") ? "warning" : "normal"
      }),
      platformPanelRow({
        label: "tokens",
        value: String(status.metrics.counters["usage.total_tokens"] ?? 0),
        detail: `metrics ${status.metrics.updatedAt}`,
        tone: "normal"
      }),
      platformPanelRow({
        label: "diagnostics",
        value: diagnosticSummary(status.diagnostics),
        detail: status.diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join("; "),
        tone: status.diagnostics.some((diagnostic) => diagnostic.severity === "error")
          ? "danger"
          : status.diagnostics.some((diagnostic) => diagnostic.severity === "warning")
            ? "warning"
            : "normal"
      }),
      ...status.platform.surfaces.map((surface) => platformPanelRow({
        label: surface.name,
        value: `${surface.status} ${surface.source}`,
        detail: surfaceDetail(surface.actions, surface.reason, surface.capabilityNames),
        tone: surface.status === "unavailable" ? "warning" : surface.status === "degraded" || surface.status === "restricted" ? "warning" : "normal"
      }))
    ]
  };
}

function createContinuityViewModel(state: WorkbenchState): ContinuityViewModel {
  const continuity = state.continuity;
  if (!continuity) {
    throw new Error("Continuity view requires continuity state");
  }
  return {
    title: continuity.title,
    detail: continuity.detail,
    ...(continuity.actionHint ? { actionHint: continuity.actionHint } : {}),
    facts: continuity.retainedFacts,
    tone: continuity.status === "stream-disconnected" || continuity.status === "replay-unavailable"
      ? "warning"
      : "normal"
  };
}

function createTranscriptViewBlock(block: TranscriptBlock): TranscriptViewBlock {
  switch (block.kind) {
    case "user":
      return {
        ...block,
        title: "User",
        detail: block.text
      };
    case "reasoning":
      return {
        ...block,
        title: block.status === "streaming" ? "Reasoning is streaming" : "Reasoning",
        detail: block.text
      };
    case "assistant":
      return {
        ...block,
        title: block.status === "streaming" ? "Assistant is writing" : "Assistant",
        detail: block.text
      };
    case "tool":
      return {
        ...block,
        title: `Tool ${block.status}: ${block.name}`,
        detail: toolDetail(block)
      };
    case "permission":
      return {
        ...block,
        title: `Permission ${block.status}: ${block.toolName}`,
        detail: block.resolutionReason ?? block.reason ?? previewUnknown(block.input)
      };
    case "interaction":
      return {
        ...block,
        title: `Interaction ${block.status}: ${block.request.kind}`,
        detail: previewUnknown(block.response ?? requestDetail(block.request))
      };
    case "queue":
      return {
        ...block,
        title: `Queue updated: ${block.pending.length} inputs`,
        detail: block.pending.map((input) => `${input.mode} ${input.status}: ${input.textPreview}`).join("\n")
      };
    case "abort":
      return {
        ...block,
        title: "Run aborted",
        detail: block.error.message
      };
    case "error":
      return {
        ...block,
        title: `Run failed: ${block.error.code}`,
        detail: block.error.message
      };
    case "artifact":
      return {
        ...block,
        title: `Artifact: ${block.name}`,
        detail: block.mimeType ?? `${block.sizeBytes ?? 0} bytes`
      };
    case "context":
      return {
        ...block,
        title: `Context compacted: ${block.trigger}`,
        detail: block.summary ?? block.boundaryId
      };
    case "retry":
      return {
        ...block,
        title: `Retry ${block.status}: attempt ${block.attempt}`,
        detail: block.reason ?? ""
      };
    default:
      return assertNever(block);
  }
}

function queueLabel(queue: QueueSummary): string {
  if (queue.pending.length === 0) {
    return "queue empty";
  }
  return `queue ${queue.pending.length} inputs (${queue.pendingCount} pending, ${queue.deferredCount} deferred, ${queue.followUpCount} follow-up, ${queue.steerCount} steer)`;
}

function usageLabel(state: WorkbenchState): string {
  const cost = state.usage.costUsd === undefined ? "" : ` $${state.usage.costUsd.toFixed(4)}`;
  return `tokens ${state.usage.totalTokens} in ${state.usage.inputTokens} out ${state.usage.outputTokens}${cost}`;
}

function requestDetail(request: InteractionRequest): unknown {
  if (typeof request !== "object" || request === null) {
    return request;
  }
  if ("title" in request && typeof request.title === "string") {
    return request.title;
  }
  if ("message" in request && typeof request.message === "string") {
    return request.message;
  }
  return request;
}

function permissionRiskLabel(permission: PendingPermissionProjection): string {
  const searchable = `${permission.toolName} ${permission.reason ?? ""} ${previewUnknown(permission.input)}`.toLowerCase();
  if (
    /\b(rm|sudo|delete|write|chmod|chown|mv|shell|bash|exec)\b/.test(searchable)
    || searchable.includes("filesystem.write")
    || searchable.includes("_write")
  ) {
    return "high risk";
  }
  if (/\b(read|list|status|inspect)\b/.test(searchable)) {
    return "low risk";
  }
  return "review required";
}

function previewUnknown(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function toolDetail(block: Extract<TranscriptBlock, { kind: "tool" }>): string {
  if (block.error) {
    return block.error.message;
  }
  const parts = [
    block.progressMessage,
    block.progress !== undefined ? `progress ${Math.round(block.progress * 100)}%` : undefined,
    block.input !== undefined ? `input ${previewUnknown(block.input)}` : undefined,
    block.output !== undefined ? `output ${previewUnknown(block.output)}` : undefined
  ].filter((part): part is string => Boolean(part));
  return parts.join("\n");
}

function platformPanelRow(input: {
  label: string;
  value: string;
  detail?: string;
  tone: PlatformPanelRowTone;
}): PlatformPanelRowViewModel {
  const detail = input.detail?.trim();
  return {
    label: input.label,
    value: input.value,
    tone: input.tone,
    ...(detail ? { detail } : {})
  };
}

function capabilityDetail(capability: PlatformCapability): string {
  return [
    `source ${capability.source}`,
    capability.namespace ? `namespace ${capability.namespace}` : undefined,
    capability.ownerPluginId ? `owner ${capability.ownerPluginId}` : undefined,
    capability.trust ? `trust ${capability.trust.level}` : undefined,
    capability.trust?.reason ? `trust reason ${capability.trust.reason}` : undefined,
    capability.reason ? `reason ${capability.reason}` : undefined
  ].filter((part): part is string => Boolean(part)).join(" | ");
}

function capabilityTone(status: string): PlatformPanelRowTone {
  const normalized = status.toLowerCase();
  if (normalized.includes("fail") || normalized.includes("error") || normalized.includes("unavailable")) {
    return "danger";
  }
  if (normalized.includes("disabled") || normalized.includes("skipped") || normalized.includes("degraded")) {
    return "warning";
  }
  return "normal";
}

function taskDetail(task: PlatformTask): string {
  const ledger = task.ledgerSummary
    ? `ledger ${task.ledgerSummary.done + task.ledgerSummary.verified}/${task.ledgerSummary.total}`
    : undefined;
  const verification = task.verificationAttempts.at(-1);
  return [
    `task ${task.id}`,
    task.activeRunId ? `active run ${task.activeRunId}` : `root run ${task.rootRunId}`,
    ledger,
    verification ? `verify ${verification.status}: ${verification.command}` : undefined,
    task.terminalReason ? `reason ${task.terminalReason.message}` : undefined
  ].filter((part): part is string => Boolean(part)).join(" | ");
}

function diagnosticSummary(diagnostics: PlatformDiagnostic[]): string {
  if (diagnostics.length === 0) {
    return "none";
  }
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;
  return `${errors} error ${warnings} warning`;
}

function surfaceDetail(actions: readonly string[], reason: string | undefined, capabilityNames: readonly string[] | undefined): string {
  return [
    actions.length > 0 ? `actions ${actions.join(", ")}` : undefined,
    capabilityNames && capabilityNames.length > 0 ? `capabilities ${capabilityNames.join(", ")}` : undefined,
    reason ? `reason ${reason}` : undefined
  ].filter((part): part is string => Boolean(part)).join(" | ");
}

function taskItemDetail(item: ActiveTaskPlanItem): string {
  const parts = [
    item.changedFiles.length > 0 ? `files ${item.changedFiles.join(", ")}` : undefined,
    item.verificationAttemptIds.length > 0 ? `verification ${item.verificationAttemptIds.join(", ")}` : undefined,
    item.evidence.length > 0 ? `evidence ${item.evidence.map((evidence) => evidence.summary).join("; ")}` : undefined,
    item.blocker ? `blocked ${item.blocker.message}` : undefined
  ].filter((part): part is string => Boolean(part));
  return parts.join("\n");
}

function assertNever(value: never): never {
  throw new Error(`Unhandled transcript block: ${JSON.stringify(value)}`);
}
