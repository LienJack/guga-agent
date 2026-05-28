import type {
  PermissionDecision,
  PermissionDenyDecision,
  PermissionPolicy,
  PermissionRequest,
  PermissionResolver
} from "@guga-agent/core";

export type CodeAgentPermissionOptions = {
  delegate?: PermissionResolver;
  timeoutMs?: number;
};

const DESTRUCTIVE_COMMAND_PATTERNS = [
  /\brm\s+(-[^\s]*r[^\s]*f|-rf|-fr)\b/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+clean\s+(-[^\s]*f[^\s]*d|-df|-fd)\b/,
  /\bgit\s+push\b/,
  /\bsudo\b/,
  /\bchmod\s+777\b/,
  /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;:/,
  /\bdd\s+.*\bof=/
] as const;

export function createCodeAgentPermissionPolicy(
  options: CodeAgentPermissionOptions = {}
): PermissionPolicy {
  return {
    profile: "ask-on-write",
    timeoutMs: options.timeoutMs ?? 30_000,
    resolver: createCodeAgentPermissionResolver(options.delegate)
  };
}

export function createCodeAgentPermissionResolver(
  delegate?: PermissionResolver
): PermissionResolver {
  return async (request) => {
    if (isDestructiveShellRequest(request)) {
      return deny("Destructive shell command blocked by code-agent profile");
    }
    if (delegate) {
      return delegate(request);
    }
    return denyMissingHostResolver("Code-agent profile requires a host permission resolver for write or execute actions");
  };
}

export function isDestructiveShellCommand(command: string): boolean {
  const normalized = command.replace(/\s+/g, " ").trim();
  return DESTRUCTIVE_COMMAND_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isDestructiveShellRequest(request: PermissionRequest): boolean {
  if (request.subject.toolName !== "shell_exec") {
    return false;
  }
  const command = commandFromInput(request.call.input);
  return command !== undefined && isDestructiveShellCommand(command);
}

function commandFromInput(input: unknown): string | undefined {
  if (!input || typeof input !== "object" || !("command" in input)) {
    return undefined;
  }
  return String((input as Record<string, unknown>).command);
}

function deny(reason: string): PermissionDenyDecision {
  return {
    action: "deny",
    remember: "once",
    source: "profile",
    reason
  };
}

function denyMissingHostResolver(reason: string): PermissionDenyDecision {
  return {
    ...deny(reason),
    metadata: { hostResolverRequired: true }
  };
}

export function isPermissionDecision(value: unknown): value is PermissionDecision {
  return Boolean(value && typeof value === "object" && "action" in value);
}
