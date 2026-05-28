import type { CapabilityResource } from "@guga-agent/host-protocol";
import type { HostClient } from "@guga-agent/host-sdk";
import type { CliConfig } from "../config";
import type { CliHostStorageDiagnostics } from "../host-factory";
import { formatModelOption, listModelOptions, selectModelOrThrow, selectProfileOrThrow } from "./model-control";
import {
  listProviderAuthStatus,
  loginGuidance,
  loginOAuthProvider,
  logoutProvider,
  type ProviderOAuthLoginRunner
} from "../provider-login";
import {
  createWorkbenchSession,
  forkWorkbenchSession,
  resumeWorkbenchSession,
  summarizeOperationalStatus
} from "./session-control";

export type WorkbenchSlashSelectorKind = "model" | "profile" | "resume" | "provider";

export interface WorkbenchSlashCommandMetadata {
  readonly command: string;
  readonly label: string;
  readonly help: string;
  readonly usage: string;
  readonly aliases?: readonly string[];
  readonly selector?: WorkbenchSlashSelectorKind;
}

export const WORKBENCH_SLASH_COMMAND_METADATA = [
  { command: "/new", label: "New session", usage: "/new [title]", help: "Create a workbench session." },
  { command: "/resume", label: "Resume session", usage: "/resume <session> [branch]", help: "Resume a session branch.", selector: "resume" },
  { command: "/fork", label: "Fork session", usage: "/fork [summary]", help: "Fork the active session." },
  { command: "/tree", label: "Session tree", usage: "/tree", help: "Show session branches." },
  { command: "/status", label: "Status", usage: "/status", help: "Show operational status." },
  { command: "/clear", label: "Clear", usage: "/clear", help: "Clear the visible transcript." },
  { command: "/models", label: "Models", usage: "/models", help: "List configured models." },
  { command: "/model", label: "Switch model", usage: "/model <id>", help: "Switch model.", selector: "model" },
  { command: "/login", label: "Login", usage: "/login <provider>", help: "Login to a provider.", selector: "provider" },
  { command: "/logout", label: "Logout", usage: "/logout <provider>", help: "Remove a local provider credential." },
  { command: "/auth", label: "Auth status", usage: "/auth status [provider]", help: "Show provider auth status." },
  { command: "/profile", label: "Switch profile", usage: "/profile <id>", help: "Switch profile and start a new session.", selector: "profile" },
  { command: "/permissions", label: "Permissions", usage: "/permissions", help: "List permission-relevant capabilities." },
  { command: "/mcp", label: "MCP", usage: "/mcp", help: "List MCP capabilities." },
  { command: "/tools", label: "Tools", usage: "/tools", help: "List tools." },
  { command: "/skills", label: "Skills", usage: "/skills", help: "List skills." },
  { command: "/compact", label: "Compact", usage: "/compact", help: "Reserved compaction command." },
  { command: "/follow", label: "Follow-up", usage: "/follow <text>", help: "Queue a follow-up during an active run." },
  { command: "/respond", label: "Respond", usage: "/respond <request-id> <value>", help: "Respond to an interaction request." },
  { command: "/abort", label: "Abort", usage: "/abort", help: "Abort the active run.", aliases: ["/cancel"] },
  { command: "/help", label: "Help", usage: "/help", help: "Show command help." },
  { command: "/exit", label: "Exit", usage: "/exit", help: "Exit the workbench.", aliases: ["/quit"] }
] as const;

export const WORKBENCH_SLASH_COMMANDS = WORKBENCH_SLASH_COMMAND_METADATA.map((metadata) => metadata.command);

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
  oauthLoginRunner?: ProviderOAuthLoginRunner;
};

export type WorkbenchCommandAction =
  | "clear"
  | "exit"
  | "help"
  | "list-models"
  | "select-model"
  | "select-profile"
  | "login-provider"
  | "logout-provider"
  | "auth-status"
  | "new-session"
  | "resume-session"
  | "fork-session"
  | "session-tree"
  | "status"
  | "permissions"
  | "mcp"
  | "tools"
  | "skills"
  | "compact"
  | "follow-up"
  | "respond-interaction"
  | "abort-run";

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
      return commandOk("help", formatCommandHelp());
    case "/exit":
    case "/quit":
      return commandOk("exit", "exit");
    case "/clear":
      return commandOk("clear", "transcript cleared");
    case "/models": {
      const models = listModelOptions(context.config, context.env, context.storage?.home);
      return commandOk(
        "list-models",
        models.length === 0
          ? "No configured models."
          : models.map(formatModelOption).join("\n"),
        models
      );
    }
    case "/login": {
      const providerId = intent.args.trim();
      if (!providerId) {
        return commandError("/login requires a provider id.", ["/login copilot", "/login codex"]);
      }
      if ((providerId === "copilot" || providerId === "codex") && context.oauthLoginRunner) {
        return executeHostCommand(async () => {
          const result = await loginOAuthProvider({
            providerId,
            runner: context.oauthLoginRunner as ProviderOAuthLoginRunner,
            ...(context.env ? { env: context.env } : {})
          });
          return commandOk("login-provider", `logged in provider ${result.providerId}`, result.credential);
        });
      }
      return commandOk("login-provider", loginGuidance(providerId));
    }
    case "/logout": {
      const providerId = intent.args.trim();
      if (!providerId) {
        return commandError("/logout requires a provider id.", ["/logout copilot", "/logout codex"]);
      }
      return executeHostCommand(async () => {
        const result = await logoutProvider({
          providerId,
          ...(context.env ? { env: context.env } : {})
        });
        return commandOk("logout-provider", `logged out provider ${result.providerId}`, result.credential);
      });
    }
    case "/auth": {
      const [subcommand, providerId] = intent.args.trim().split(/\s+/);
      if (subcommand !== "status") {
        return commandError("/auth requires status.", ["/auth status", "/auth status copilot"]);
      }
      const statuses = listProviderAuthStatus({
        ...(providerId ? { providerId } : {}),
        ...(context.env ? { env: context.env } : {})
      });
      return commandOk("auth-status", statuses.map((status) => `${status.providerId}: ${status.status} (${status.source})`).join("\n"), statuses);
    }
    case "/model": {
      if (intent.args.trim().length === 0) {
        return commandError("/model requires a model id or alias.", ["/models"]);
      }
      try {
        const selected = selectModelOrThrow(context.config, intent.args.trim(), context.env, context.storage?.home);
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
    case "/tree": {
      if (!context.activeSessionId) {
        return commandError("/tree requires an active session.", []);
      }
      return executeHostCommand(async () => {
        const tree = await context.client.getSessionTree(context.activeSessionId ?? "");
        return commandOk("session-tree", formatSessionTree(tree), tree);
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
    case "/tools": {
      return executeHostCommand(async () => {
        const capabilities = await context.client.listCapabilities();
        const tools = capabilities.filter((capability) => capability.type === "tool");
        return commandOk("tools", formatCapabilities(tools), tools);
      });
    }
    case "/skills": {
      return executeHostCommand(async () => {
        const capabilities = await context.client.listCapabilities();
        const skills = capabilities.filter((capability) => capability.type === "skill");
        return commandOk("skills", formatCapabilities(skills), skills);
      });
    }
    case "/follow": {
      if (!context.activeRunId) {
        return commandError("/follow requires an active run.", []);
      }
      const text = intent.args.trim();
      if (text.length === 0) {
        return commandError("/follow requires text to queue.", []);
      }
      return executeHostCommand(async () => {
        const run = await context.client.sendRunInput(context.activeRunId ?? "", { mode: "follow_up", text });
        return commandOk("follow-up", "queued follow-up", run);
      });
    }
    case "/respond": {
      const [requestId, ...responseParts] = intent.args.trim().split(/\s+/);
      if (!requestId || responseParts.length === 0) {
        return commandError("/respond requires a request id and response.", []);
      }
      return executeHostCommand(async () => {
        const interaction = await context.client.respondInteraction(requestId, parseInteractionResponse(responseParts.join(" ")));
        return commandOk("respond-interaction", `responded to interaction ${interaction.id}`, interaction);
      });
    }
    case "/abort":
    case "/cancel": {
      if (!context.activeRunId) {
        return commandError("/abort requires an active run.", []);
      }
      return executeHostCommand(async () => {
        const run = await context.client.abortRun(context.activeRunId ?? "");
        return commandOk("abort-run", "abort requested", run);
      });
    }
    case "/compact":
      return commandOk("compact", "compact is not implemented by the host protocol yet");
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

function formatSessionTree(tree: { activeBranchId: string; branches: Array<{ id: string; parentBranchId?: string; summary?: string; lastRunId?: string; lastRunStatus?: string }> }): string {
  if (tree.branches.length === 0) {
    return `active branch: ${tree.activeBranchId}`;
  }
  return tree.branches
    .map((branch) => `${branch.id === tree.activeBranchId ? "*" : " "} ${branch.id}${branch.parentBranchId ? ` <- ${branch.parentBranchId}` : ""}${branch.summary ? ` ${branch.summary}` : ""}${branch.lastRunId ? ` (${branch.lastRunId} ${branch.lastRunStatus ?? "unknown"})` : ""}`)
    .join("\n");
}

export function formatCommandHelp(): string {
  return WORKBENCH_SLASH_COMMAND_METADATA.map((metadata) => `${metadata.usage} - ${metadata.help}`).join("\n");
}

function parseInteractionResponse(text: string): unknown {
  if (text === "true") {
    return true;
  }
  if (text === "false") {
    return false;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
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
