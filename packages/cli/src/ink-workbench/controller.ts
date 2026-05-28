import type { SessionResource } from "@guga-agent/host-protocol";
import type { HostClient } from "@guga-agent/host-sdk";
import type { CliConfig, SelectedCliModel } from "../config";
import { isCliProfileId, type CliHostStorageDiagnostics, type CliProfileId } from "../host-factory";
import type { ProviderOAuthLoginRunner } from "../provider-login";
import { executeWorkbenchCommand, parseWorkbenchInput } from "../workbench/commands";
import { reduceHostEvent, reduceHostEvents, reduceWorkbenchAction } from "../workbench/event-reducer";
import { formatModelOption, listModelOptions, type ProfileSelection } from "../workbench/model-control";
import {
  createInitialWorkbenchState,
  type WorkbenchState,
  type WorkbenchStartupMetadata
} from "../workbench/state";
import { createCommandSelectorOptions, createSelectorState, type SelectorState } from "./selector-state";

export type WorkbenchControllerOptions = {
  client: HostClient;
  config: CliConfig;
  storage?: CliHostStorageDiagnostics;
  startup: WorkbenchStartupMetadata;
  session: SessionResource;
  providerId?: string;
  modelId?: string;
  profileId: CliProfileId;
  oauthLoginRunner?: ProviderOAuthLoginRunner;
  env?: NodeJS.ProcessEnv;
  onStateChange?: (state: WorkbenchState) => void;
  onExit?: () => void;
};

export type WorkbenchControllerCommandResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

export class WorkbenchController {
  readonly client: HostClient;
  readonly config: CliConfig;
  readonly storage: CliHostStorageDiagnostics | undefined;
  readonly oauthLoginRunner: ProviderOAuthLoginRunner | undefined;
  readonly env: NodeJS.ProcessEnv | undefined;
  readonly onExit: (() => void) | undefined;

  #state: WorkbenchState;
  #session: SessionResource;
  #providerId: string | undefined;
  #modelId: string | undefined;
  #profileId: CliProfileId;
  #inputMode: "steer" | "follow_up" = "steer";
  #streamAbort?: AbortController;
  #onStateChange: ((state: WorkbenchState) => void) | undefined;

  constructor(options: WorkbenchControllerOptions) {
    this.client = options.client;
    this.config = options.config;
    this.storage = options.storage;
    this.oauthLoginRunner = options.oauthLoginRunner;
    this.#providerId = options.providerId;
    this.#modelId = options.modelId;
    this.#profileId = options.profileId;
    this.env = options.env;
    this.onExit = options.onExit;
    this.#session = options.session;
    this.#state = createInitialWorkbenchState(options.startup);
    this.#onStateChange = options.onStateChange;
  }

  get state(): WorkbenchState {
    return this.#state;
  }

  get inputMode(): "steer" | "follow_up" {
    return this.#inputMode;
  }

  get providerId(): string | undefined {
    return this.#providerId;
  }

  get modelId(): string | undefined {
    return this.#modelId;
  }

  get profileId(): CliProfileId {
    return this.#profileId;
  }

  subscribe(listener: (state: WorkbenchState) => void): () => void {
    this.#onStateChange = listener;
    listener(this.#state);
    return () => {
      if (this.#onStateChange === listener) {
        this.#onStateChange = undefined;
      }
    };
  }

  setInputMode(mode: "steer" | "follow_up"): void {
    this.#inputMode = mode;
  }

  dispose(): void {
    this.#streamAbort?.abort();
  }

  async submitText(text: string): Promise<WorkbenchControllerCommandResult> {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return { ok: true };
    }

    if (trimmed === "/exit" || trimmed === "/quit") {
      this.onExit?.();
      return { ok: true, message: "exit" };
    }

    if (this.#state.disconnected && trimmed !== "/reload") {
      return {
        ok: false,
        error: this.#state.disconnected.lockHint
      };
    }

    if (trimmed === "/reload") {
      return this.reload();
    }

    if (this.#state.pendingPermission) {
      return this.respondPermission(this.#state.pendingPermission.requestId, trimmed);
    }

    if (this.#state.pendingInteraction) {
      return this.respondInteraction(this.#state.pendingInteraction.requestId, parseInteractionResponse(trimmed));
    }

    if (trimmed.startsWith("/")) {
      return this.executeSlash(trimmed);
    }

    if (this.#state.activeRunId && this.#state.runStatus === "running") {
      return this.submitRunInput(this.#inputMode, text);
    }

    return this.startPromptRun(text);
  }

  async startPromptRun(text: string): Promise<WorkbenchControllerCommandResult> {
    const run = await this.client.startRun(this.#session.id, {
      input: text,
      ...(this.#providerId ? { providerId: this.#providerId } : {}),
      ...(this.#modelId ? { modelId: this.#modelId } : {})
    });
    this.attachRunStream(run.id);
    return { ok: true, message: `started ${run.id}` };
  }

  async submitRunInput(mode: "steer" | "follow_up", text: string): Promise<WorkbenchControllerCommandResult> {
    if (!this.#state.activeRunId || this.#state.runStatus !== "running") {
      return { ok: false, error: "No active run for queued input." };
    }
    await this.client.sendRunInput(this.#state.activeRunId, { mode, text });
    return { ok: true, message: `queued ${mode}` };
  }

  async abortActiveRun(): Promise<WorkbenchControllerCommandResult> {
    if (!this.#state.activeRunId) {
      return { ok: false, error: "No active run to abort." };
    }
    await this.client.abortRun(this.#state.activeRunId);
    return { ok: true, message: "abort requested" };
  }

  applyEvent(event: Parameters<typeof reduceHostEvent>[1]): void {
    this.setState(reduceHostEvent(this.#state, event));
  }

  async executeSlash(text: string): Promise<WorkbenchControllerCommandResult> {
    const result = await executeWorkbenchCommand(parseWorkbenchInput(text), {
      client: this.client,
      config: this.config,
      ...(this.storage ? { storage: this.storage } : {}),
      ...(this.oauthLoginRunner ? { oauthLoginRunner: this.oauthLoginRunner } : {}),
      ...(this.env ? { env: this.env } : {}),
      activeSessionId: this.#session.id,
      ...(this.#session.activeBranchId ? { activeBranchId: this.#session.activeBranchId } : {}),
      ...(this.#state.activeRunId ? { activeRunId: this.#state.activeRunId } : {})
    });

    if (!result.ok) {
      return {
        ok: false,
        error: result.suggestions.length > 0
          ? `${result.error}\ntry: ${result.suggestions.join(", ")}`
          : result.error
      };
    }

    if (result.action === "exit") {
      this.onExit?.();
      return { ok: true, message: "exit" };
    }
    if (result.action === "clear") {
      this.setState(reduceWorkbenchAction(this.#state, { type: "ui.clear" }));
    }
    if (result.action === "select-model" && isSelectedCliModel(result.data)) {
      this.#providerId = result.data.providerId;
      this.#modelId = result.data.modelId ?? result.data.id;
    }
    if (result.action === "select-profile" && isProfileSelection(result.data)) {
      this.#profileId = result.data.profileId;
      return {
        ok: false,
        error: `Profile changes require restarting the workbench with --profile ${result.data.profileId}.`
      };
    }
    if (
      (result.action === "new-session" || result.action === "resume-session" || result.action === "fork-session")
      && isSessionSummary(result.data)
    ) {
      this.#session = result.data.session;
    }
    return { ok: true, message: result.message };
  }

  async respondPermission(requestId: string, text: string): Promise<WorkbenchControllerCommandResult> {
    const resolution = parsePermissionResponse(text);
    if (!resolution) {
      return { ok: false, error: "Permission response must be allow or deny." };
    }
    await this.client.respondPermission(requestId, resolution);
    return { ok: true, message: `permission ${resolution.decision} sent` };
  }

  async respondInteraction(requestId: string, response: unknown): Promise<WorkbenchControllerCommandResult> {
    await this.client.respondInteraction(requestId, response);
    return { ok: true, message: "interaction response sent" };
  }

  async selectorForCommand(command: string): Promise<SelectorState> {
    if ((command === "/model" || command === "/profile") && this.#state.activeRunId && this.#state.runStatus === "running") {
      return createSelectorState({
        source: "custom",
        title: "Abort active run first",
        options: [{
          id: "abort-active-run",
          label: "Abort active run",
          value: "abort",
          detail: "Model/profile changes are available after the host confirms cancellation.",
          commandText: "/abort"
        }]
      });
    }
    if (command === "/model") {
      return createSelectorState({
        source: "model",
        title: "Select model",
        options: createCommandSelectorOptions("/model", listModelOptions(this.config, this.env, this.storage?.home).map((model) => ({
          id: model.id,
          label: `${model.isDefault ? "* " : ""}${model.displayName}`,
          value: model.id,
          detail: formatModelOption(model),
          disabled: !model.available,
          keywords: [model.modelId, model.providerId]
        })))
      });
    }
    if (command === "/profile") {
      return createSelectorState({
        source: "profile",
        title: "Select profile",
        options: createCommandSelectorOptions("/profile", ["code", "deep-research", "review"].filter(isCliProfileId).map((profileId) => ({
          id: profileId,
          label: profileId,
          value: profileId,
          detail: "restart required"
        })))
      });
    }
    if (command === "/login") {
      return createSelectorState({
        source: "provider",
        title: "Login provider",
        options: createCommandSelectorOptions("/login", [
          { id: "copilot", label: "GitHub Copilot", value: "copilot", detail: "OAuth device flow" },
          { id: "codex", label: "OpenAI Codex", value: "codex", detail: "ChatGPT/Codex OAuth flow" }
        ])
      });
    }
    const sessions = await this.client.listSessions();
    return createSelectorState({
      source: "resume",
      title: "Resume session",
      options: createCommandSelectorOptions("/resume", sessions.map((session) => ({
        id: `${session.id}:${session.activeBranchId ?? "main"}`,
        label: session.title ?? session.id,
        value: `${session.id}${session.activeBranchId ? ` ${session.activeBranchId}` : ""}`,
        detail: session.lastRunStatus ?? session.updatedAt,
        keywords: [session.id, session.activeBranchId ?? ""]
      })))
    });
  }

  private async reload(): Promise<WorkbenchControllerCommandResult> {
    const runId = this.#state.activeRunId;
    if (!runId) {
      return { ok: false, error: "No active run to reload." };
    }
    const events = await this.client.listRunEvents(runId);
    this.setState(reduceWorkbenchAction(reduceHostEvents(this.#state, events), { type: "stream.reconnected" }));
    this.attachRunStream(runId, this.#state.lastSeq);
    return { ok: true, message: "reload requested" };
  }

  private attachRunStream(runId: string, afterSeq?: number): void {
    this.#streamAbort?.abort();
    const streamAbort = new AbortController();
    this.#streamAbort = streamAbort;
    void (async () => {
      try {
        for await (const event of this.client.streamRunEvents(runId, { ...(afterSeq !== undefined ? { afterSeq } : {}), signal: streamAbort.signal })) {
          this.applyEvent(event);
          if (event.type === "run.completed" || event.type === "run.failed" || event.type === "run.cancelled") {
            return;
          }
        }
        if (!streamAbort.signal.aborted && this.#state.activeRunId === runId && this.#state.runStatus === "running") {
          this.setState(reduceWorkbenchAction(this.#state, {
            type: "stream.replay_unavailable",
            afterSeq: this.#state.lastSeq
          }));
        }
      } catch (error) {
        if (!streamAbort.signal.aborted) {
          this.setState(reduceWorkbenchAction(this.#state, {
            type: "stream.error",
            message: errorMessage(error)
          }));
        }
      }
    })();
  }

  private setState(state: WorkbenchState): void {
    this.#state = state;
    this.#onStateChange?.(state);
  }
}

export function parsePermissionResponse(text: string): { decision: "allow" | "deny"; remember: "once" } | undefined {
  const normalized = text.trim().toLowerCase();
  if (normalized === "allow" || normalized === "yes" || normalized === "y") {
    return { decision: "allow", remember: "once" };
  }
  if (normalized === "deny" || normalized === "no" || normalized === "n") {
    return { decision: "deny", remember: "once" };
  }
  return undefined;
}

export function parseInteractionResponse(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return text;
  }
}

function isSessionSummary(value: unknown): value is { session: SessionResource } {
  return !!value && typeof value === "object" && "session" in value;
}

function isSelectedCliModel(value: unknown): value is SelectedCliModel {
  return !!value && typeof value === "object" && "id" in value;
}

function isProfileSelection(value: unknown): value is ProfileSelection {
  return !!value && typeof value === "object" && "profileId" in value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
