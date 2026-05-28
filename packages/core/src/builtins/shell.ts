import { spawn } from "node:child_process";
import { resolve } from "node:path";
import type { LocalPlugin } from "../contracts/plugins";
import type { ToolDefinition } from "../contracts/tools";

const DEFAULT_ENV_ALLOWLIST = ["HOME", "PATH", "SHELL", "TMPDIR", "USER"] as const;
const KILL_FALLBACK_MS = 100;

export type ShellExecutionResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  reason?: "timeout" | "cancelled";
};

export type ShellBackend = {
  execute(command: string, options: { cwd: string; env: Record<string, string>; timeoutMs: number; signal?: AbortSignal }): Promise<ShellExecutionResult>;
};

export type ShellPluginOptions = {
  workspaceRoot: string;
  backend?: ShellBackend;
  pluginId?: string;
  timeoutMs?: number;
  env?: Record<string, string | undefined>;
  envAllowlist?: string[];
};

export type BuiltInShellOptions = Omit<ShellPluginOptions, "pluginId">;

export function createShellPlugin(options: ShellPluginOptions): LocalPlugin {
  const pluginId = options.pluginId ?? "guga-shell-tools";
  const backend = options.backend ?? createLocalShellBackend();
  const timeoutMs = options.timeoutMs ?? 30_000;

  return {
    id: pluginId,
    name: "Guga Shell Tools",
    init(context) {
      context.registerTool(createBuiltInShellTool({ ...options, backend, timeoutMs }));
    }
  };
}

export function createBuiltInShellTool(options: BuiltInShellOptions): ToolDefinition {
  return shellTool(options, options.backend ?? createLocalShellBackend(), options.timeoutMs ?? 30_000);
}

export function createLocalShellBackend(): ShellBackend {
  return {
    async execute(command, options) {
      return executeLocalShellCommand(command, options);
    }
  };
}

function executeLocalShellCommand(
  command: string,
  options: { cwd: string; env: Record<string, string>; timeoutMs: number; signal?: AbortSignal }
): Promise<ShellExecutionResult> {
  return new Promise((resolveExecution) => {
    const child = spawn("sh", ["-lc", command], {
      cwd: options.cwd,
      env: options.env,
      detached: true,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    let reason: ShellExecutionResult["reason"];
    let killFallback: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      clearTimeout(timeout);
      if (killFallback) {
        clearTimeout(killFallback);
      }
      options.signal?.removeEventListener("abort", onAbort);
    };
    const finish = (nextReason: ShellExecutionResult["reason"]) => {
      if (reason) {
        return;
      }
      reason = nextReason;
      terminateProcessGroup(child.pid, "SIGTERM");
      killFallback = setTimeout(() => terminateProcessGroup(child.pid, "SIGKILL"), KILL_FALLBACK_MS);
    };
    const onAbort = () => finish("cancelled");
    const timeout = setTimeout(() => finish("timeout"), Math.max(0, options.timeoutMs));

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      cleanup();
      resolveExecution({
        stdout,
        stderr: stderr || error.message,
        exitCode: 1,
        ...(reason ? { reason } : {})
      });
    });
    child.on("close", (code) => {
      cleanup();
      resolveExecution({
        stdout,
        stderr,
        exitCode: typeof code === "number" ? code : 1,
        ...(reason ? { reason } : {})
      });
    });

    if (options.signal?.aborted) {
      finish("cancelled");
    } else {
      options.signal?.addEventListener("abort", onAbort, { once: true });
    }
  });
}

function terminateProcessGroup(pid: number | undefined, signal: NodeJS.Signals): void {
  if (pid === undefined) {
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // Process already exited or the platform does not support this signal.
    }
  }
}

export function summarizeCommand(command: string): string {
  const singleLine = command.replace(/\s+/g, " ").trim();
  return singleLine.length > 120 ? `${singleLine.slice(0, 117)}...` : singleLine;
}

export function filterShellEnvironment(env: Record<string, string | undefined>, allowlist: readonly string[] = DEFAULT_ENV_ALLOWLIST): Record<string, string> {
  const allowed = new Set(allowlist);
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => allowed.has(entry[0]) && typeof entry[1] === "string")
  );
}

function shellTool(options: ShellPluginOptions, backend: ShellBackend, timeoutMs: number): ToolDefinition {
  return {
    name: "shell_exec",
    description: "Execute a shell command inside the workspace",
    inputSchema: { type: "object", required: ["command"] },
    effect: "execute",
    runtime: {
      permission: {
        defaultAction: "ask",
        profileActions: { headless: "deny", background: "deny", "trusted-session": "allow" },
        scope: "command",
        prompt: { title: "Run shell command" }
      },
      executionMode: "interactive",
      scheduler: {
        concurrency: "serial",
        resources: { mode: "static", scopes: [{ kind: "shell", access: "execute", value: resolve(options.workspaceRoot) }] }
      },
      timeoutMs,
      resultBudget: { maxContentChars: 12_000, strategy: "truncate" },
      renderer: { category: "execute" },
      source: { kind: "core", packageName: "@guga-agent/core" },
      backend: { kind: "local-shell" },
      availability: { status: "available" },
      visibility: "model"
    },
    async execute(input, context) {
      const command = commandFrom(input);
      const result = await backend.execute(command, {
        cwd: resolve(options.workspaceRoot),
        env: filterShellEnvironment(options.env ?? process.env, options.envAllowlist),
        timeoutMs,
        ...(context.signal ? { signal: context.signal } : {})
      });
      const content = [result.stdout, result.stderr].filter(Boolean).join("\n");
      if (result.reason === "timeout") {
        return {
          ok: false,
          error: {
            code: "SHELL_COMMAND_TIMEOUT",
            message: "Shell command timed out",
            details: content
          },
          metadata: { commandSummary: summarizeCommand(command), exitCode: result.exitCode }
        };
      }
      if (result.reason === "cancelled") {
        return {
          ok: false,
          error: {
            code: "SHELL_COMMAND_CANCELLED",
            message: "Shell command was cancelled",
            details: content
          },
          metadata: { commandSummary: summarizeCommand(command), exitCode: result.exitCode }
        };
      }
      return result.exitCode === 0
        ? { ok: true, content, metadata: { commandSummary: summarizeCommand(command), exitCode: result.exitCode } }
        : {
            ok: false,
            error: {
              code: "SHELL_COMMAND_FAILED",
              message: `Shell command exited with code ${result.exitCode}`,
              details: content
            },
            metadata: { commandSummary: summarizeCommand(command), exitCode: result.exitCode }
          };
    }
  };
}

function commandFrom(input: unknown): string {
  if (!input || typeof input !== "object" || !("command" in input)) {
    return "";
  }
  return String((input as Record<string, unknown>).command);
}
