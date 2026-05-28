import type { CapabilityResource } from "@guga-agent/host-protocol";
import type { HostClient } from "@guga-agent/host-sdk";
import type { CliConfig } from "../config";
import type { CliHostStorageDiagnostics } from "../host-factory";
import { listModelOptions, selectModelOrThrow, selectProfileOrThrow } from "./model-control";
import {
  createWorkbenchSession,
  forkWorkbenchSession,
  resumeWorkbenchSession,
  summarizeOperationalStatus
} from "./session-control";

export const WORKBENCH_SLASH_COMMANDS = [
  "/new",
  "/resume",
  "/fork",
  "/status",
  "/clear",
  "/models",
  "/model",
  "/profile",
  "/permissions",
  "/mcp",
  "/help",
  "/exit"
] as const;

export type WorkbenchInputIntent =
  | { kind: "prompt"; text: string }
  | { kind: "slash"; command: string; args: string };

export type WorkbenchCommandContext = {
  client: HostClient;
  config: CliConfig;
  storage?: CliHostStorageDiagnostics;
  env?: NodeJS.ProcessEnv;
  activeSessionId?: string;
  activeBranchId?: string;
  activeRunId?: string;
};

export type WorkbenchCommandAction =
  | "clear"
  | "exit"
  | "help"
  | "list-models"
  | "select-model"
  | "select-profile"
  | "new-session"
  | "resume-session"
  | "fork-session"
  | "status"
  | "permissions"
  | "mcp";

export type WorkbenchCommandResult =
  | {
      ok: true;
      action: WorkbenchCommandAction;
      message: string;
      data?: unknown;
    }
  | {
      ok: false;
      error: string;
      suggestions: string[];
    };

export function parseWorkbenchInput(text: string): WorkbenchInputIntent {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return { kind: "prompt", text };
  }
  const [command = "", ...rest] = trimmed.split(/\s+/);
  return {
    kind: "slash",
    command,
    args: rest.join(" ")
  };
}

export async function executeWorkbenchCommand(
  intent: WorkbenchInputIntent,
  context: WorkbenchCommandContext
): Promise<WorkbenchCommandResult> {
  if (intent.kind === "prompt") {
    return commandError("Prompt input should be sent to the agent, not the slash router.", []);
  }

  switch (intent.command) {
    case "/help":
      return commandOk("help", WORKBENCH_SLASH_COMMANDS.join(" "));
    case "/exit":
    case "/quit":
      return commandOk("exit", "exit");
    case "/clear":
      return commandOk("clear", "transcript cleared");
    case "/models": {
      const models = listModelOptions(context.config);
      return commandOk(
        "list-models",
        models.length === 0
          ? "No configured models."
          : models.map((model) => `${model.isDefault ? "*" : " "} ${model.id} -> ${model.modelId ?? model.id}`).join("\n"),
        models
      );
    }
    case "/model": {
      if (intent.args.trim().length === 0) {
        return commandError("/model requires a model id or alias.", ["/models"]);
      }
      try {
        const selected = selectModelOrThrow(context.config, intent.args.trim(), context.env);
        return commandOk("select-model", `model switched to ${selected.id}`, selected);
      } catch (error) {
        return commandError(errorMessage(error), ["/models"]);
      }
    }
    case "/profile": {
      if (intent.args.trim().length === 0) {
        return commandError("/profile requires code, deep-research, or review.", ["/profile code"]);
      }
      try {
        const selected = selectProfileOrThrow(intent.args.trim());
        return commandOk("select-profile", `profile switched to ${selected.profileId}; new session required`, selected);
      } catch (error) {
        return commandError(errorMessage(error), ["/profile code", "/profile deep-research", "/profile review"]);
      }
    }
    case "/new": {
      return executeHostCommand(async () => {
        const summary = await createWorkbenchSession(context.client, { title: intent.args.trim() || "Guga workbench" });
        return commandOk("new-session", `new session ${summary.session.id}`, summary);
      });
    }
    case "/resume": {
      const [sessionId, branchId] = intent.args.trim().split(/\s+/);
      if (!sessionId) {
        return commandError("/resume requires a session id.", []);
      }
      return executeHostCommand(async () => {
        const summary = await resumeWorkbenchSession(context.client, sessionId, branchId ? { branchId } : {});
        return commandOk("resume-session", `resumed session ${summary.session.id}`, summary);
      });
    }
    case "/fork": {
      if (!context.activeSessionId) {
        return commandError("/fork requires an active session.", []);
      }
      const activeSessionId = context.activeSessionId;
      return executeHostCommand(async () => {
        const summary = await forkWorkbenchSession(context.client, activeSessionId, {
          ...(context.activeBranchId ? { parentBranchId: context.activeBranchId } : {}),
          ...(context.activeRunId ? { createdFromRunId: context.activeRunId } : {}),
          ...(intent.args.trim() ? { summary: intent.args.trim() } : {})
        });
        return commandOk("fork-session", `forked branch ${summary.session.activeBranchId ?? "main"}`, summary);
      });
    }
    case "/status": {
      return executeHostCommand(async () => {
        const status = await context.client.getOperationalStatus();
        return commandOk("status", summarizeStatusWithStorage(summarizeOperationalStatus(status), context.storage), status);
      });
    }
    case "/permissions": {
      return executeHostCommand(async () => {
        const capabilities = await context.client.listCapabilities();
        const permissionRelevant = capabilities.filter(isPermissionRelevantCapability);
        return commandOk("permissions", formatCapabilities(permissionRelevant), permissionRelevant);
      });
    }
    case "/mcp": {
      return executeHostCommand(async () => {
        const capabilities = await context.client.listCapabilities();
        const mcp = capabilities.filter((capability) => capability.ownerPluginId?.includes("mcp") || capability.source === "mcp");
        return commandOk("mcp", formatCapabilities(mcp), mcp);
      });
    }
    default:
      return commandError(`Unknown command: ${intent.command}`, suggestCommands(intent.command));
  }
}

function commandOk(
  action: WorkbenchCommandAction,
  message: string,
  data?: unknown
): WorkbenchCommandResult {
  return {
    ok: true,
    action,
    message,
    ...(data !== undefined ? { data } : {})
  };
}

function commandError(error: string, suggestions: string[]): WorkbenchCommandResult {
  return { ok: false, error, suggestions };
}

async function executeHostCommand(
  action: () => Promise<WorkbenchCommandResult>
): Promise<WorkbenchCommandResult> {
  try {
    return await action();
  } catch (error) {
    return commandError(errorMessage(error), []);
  }
}

function suggestCommands(command: string): string[] {
  const normalized = command.toLowerCase();
  return WORKBENCH_SLASH_COMMANDS
    .filter((candidate) => candidate.startsWith(normalized.slice(0, 3)))
    .slice(0, 3);
}

function formatCapabilities(capabilities: CapabilityResource[]): string {
  if (capabilities.length === 0) {
    return "No matching capabilities.";
  }
  return capabilities.map((capability) => `${capability.type}:${capability.name} ${capability.status}`).join("\n");
}

function summarizeStatusWithStorage(summary: string, storage: CliHostStorageDiagnostics | undefined): string {
  if (!storage) {
    return summary;
  }
  return [
    summary,
    `home=${storage.home}`,
    `sessions=${storage.sessionsRoot}`,
    `artifacts=${storage.artifactsRoot}`,
    `memory=${storage.memoryRoot}`
  ].join("\n");
}

function isPermissionRelevantCapability(capability: CapabilityResource): boolean {
  return capability.type === "tool" || capability.name.includes("permission") || capability.trust !== undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Command failed";
}
