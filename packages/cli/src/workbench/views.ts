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
};

export type PendingInteractionViewModel = PendingInteractionProjection & {
  title: string;
  detail: string;
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
  return {
    ...permission,
    title: `Permission pending: ${permission.toolName}`,
    detail: permission.reason ?? previewUnknown(permission.input)
  };
}

function createPendingInteractionViewModel(interaction: PendingInteractionProjection): PendingInteractionViewModel {
  return {
    ...interaction,
    title: `Interaction pending: ${interaction.request.kind}`,
    detail: previewUnknown(requestDetail(interaction.request))
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

function assertNever(value: never): never {
  throw new Error(`Unhandled transcript block: ${JSON.stringify(value)}`);
}
