import type { InteractionRequest } from "@guga-agent/host-protocol";
import type { QueueSummary, TranscriptBlock, WorkbenchStartupMetadata, WorkbenchState } from "./state";

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
};

export type TranscriptViewBlock = TranscriptBlock & {
  title: string;
  detail: string;
};

export type WorkbenchViewModel = {
  startup: StartupViewModel;
  transcript: TranscriptViewBlock[];
  statusBar: StatusBarViewModel;
  queue: QueueSummary;
};

export function createWorkbenchViewModel(state: WorkbenchState): WorkbenchViewModel {
  return {
    startup: createStartupViewModel(state.startup),
    transcript: selectVisibleTranscriptBlocks(state).map(createTranscriptViewBlock),
    statusBar: createStatusBarViewModel(state),
    queue: state.queue
  };
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
  const status: StatusBarViewModel = {
    runStatus: state.runStatus,
    text: state.statusText,
    queueLabel: queueLabel(state.queue),
    usageLabel: usageLabel(state)
  };
  if (state.activeSessionId) {
    status.sessionId = state.activeSessionId;
  }
  if (state.activeRunId) {
    status.runId = state.activeRunId;
  }
  return status;
}

function createTranscriptViewBlock(block: TranscriptBlock): TranscriptViewBlock {
  switch (block.kind) {
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
        detail: block.error?.message ?? previewUnknown(block.output ?? block.input)
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
        title: `Queue updated: ${block.pending.length} pending`,
        detail: block.pending.map((input) => `${input.mode}: ${input.textPreview}`).join("\n")
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
    default:
      return assertNever(block);
  }
}

function queueLabel(queue: QueueSummary): string {
  if (queue.pending.length === 0) {
    return "queue empty";
  }
  return `queue ${queue.pending.length} pending (${queue.followUpCount} follow-up, ${queue.steerCount} steer)`;
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

function assertNever(value: never): never {
  throw new Error(`Unhandled transcript block: ${JSON.stringify(value)}`);
}
