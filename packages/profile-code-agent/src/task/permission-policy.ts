import type { PermissionDenyDecision, PermissionRequest } from "@guga-agent/core";
import { isDestructiveShellCommand } from "../permissions";

export type CodeTaskPermissionPosture = "manual" | "auto-safe-verification";

export type CodeTaskPermissionDecision =
  | {
      action: "allow";
      reason: string;
    }
  | {
      action: "ask";
      reason: string;
    }
  | {
      action: "deny";
      reason: string;
    };

const READ_ONLY_TOOLS = new Set(["fs_read", "fs_list", "fs_search", "fs_grep", "fs_glob", "git_status", "git_diff"]);
const SAFE_VERIFICATION_COMMANDS = [
  /^pnpm\b(?=.*\b(test|typecheck|lint|build)\b)/,
  /^npm\b(?=.*\b(test|typecheck|lint|build)\b)/,
  /^yarn\b(?=.*\b(test|typecheck|lint|build)\b)/,
  /^bun\b(?=.*\b(test|typecheck|lint|build)\b)/
] as const;

export function decideCodeTaskPermission(
  request: Pick<PermissionRequest, "subject" | "call">,
  posture: CodeTaskPermissionPosture = "manual"
): CodeTaskPermissionDecision {
  if (request.subject.toolName === "shell_exec") {
    const command = commandFromInput(request.call.input);
    if (command && isDestructiveShellCommand(command)) {
      return { action: "deny", reason: "Destructive shell command blocked during autonomous code task" };
    }
    if (posture === "auto-safe-verification" && command && isSafeVerificationCommand(command)) {
      return { action: "allow", reason: "Safe verification command allowed by code task posture" };
    }
    return { action: "ask", reason: "Shell command requires host approval" };
  }

  if (request.subject.effect === "read" || READ_ONLY_TOOLS.has(request.subject.toolName)) {
    return { action: "allow", reason: "Read-only task discovery tool" };
  }

  return { action: "ask", reason: "Write or external action requires host approval" };
}

export function isSafeVerificationCommand(command: string): boolean {
  const normalized = command.replace(/\s+/g, " ").trim();
  if (isDestructiveShellCommand(normalized)) {
    return false;
  }
  return SAFE_VERIFICATION_COMMANDS.some((pattern) => pattern.test(normalized));
}

export function denyCodeTaskPermission(reason: string): PermissionDenyDecision {
  return {
    action: "deny",
    remember: "once",
    source: "profile",
    reason
  };
}

function commandFromInput(input: unknown): string | undefined {
  if (!input || typeof input !== "object" || !("command" in input)) {
    return undefined;
  }
  return String((input as Record<string, unknown>).command);
}
