import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type { LocalPlugin, ToolDefinition, ToolRuntimeMetadata } from "@guga-agent/core";

const execFileAsync = promisify(execFile);

export type GitBackend = {
  status(workspaceRoot: string): Promise<string>;
  diff(workspaceRoot: string, path?: string): Promise<string>;
};

export type GitPluginOptions = {
  workspaceRoot: string;
  backend?: GitBackend;
  pluginId?: string;
};

export function createGitPlugin(options: GitPluginOptions): LocalPlugin {
  const pluginId = options.pluginId ?? "guga-git-tools";
  const backend = options.backend ?? createLocalGitBackend();

  return {
    id: pluginId,
    name: "Guga Git Tools",
    init(context) {
      for (const tool of gitTools(options.workspaceRoot, backend)) {
        context.registerTool(tool);
      }
    }
  };
}

export function createLocalGitBackend(): GitBackend {
  return {
    async status(workspaceRoot) {
      return runGit(workspaceRoot, ["status", "--short"]);
    },
    async diff(workspaceRoot, path) {
      return runGit(workspaceRoot, path ? ["diff", "--", path] : ["diff"]);
    }
  };
}

export function isDangerousGitOperation(command: string): boolean {
  return /\b(push|reset|rebase|cherry-pick|filter-branch|clean|remote|credential)\b/.test(command);
}

function gitTools(workspaceRoot: string, backend: GitBackend): ToolDefinition[] {
  const root = resolve(workspaceRoot);
  return [
    {
      name: "git_status",
      description: "Show short git status for the workspace",
      inputSchema: { type: "object" },
      effect: "read",
      runtime: gitRuntime("read"),
      async execute() {
        return { ok: true, content: await backend.status(root) };
      }
    },
    {
      name: "git_diff",
      description: "Show git diff for the workspace or one path",
      inputSchema: { type: "object" },
      effect: "read",
      runtime: gitRuntime("read"),
      async execute(input) {
        return { ok: true, content: await backend.diff(root, pathFrom(input)) };
      }
    },
    {
      name: "git_commit_message",
      description: "Prepare a conventional commit message from a summary; does not run git commit",
      inputSchema: { type: "object", required: ["summary"] },
      effect: "read",
      runtime: {
        ...gitRuntime("read"),
        renderer: { category: "git", label: "Commit assistance" }
      },
      execute(input) {
        const summary = summaryFrom(input);
        if (isDangerousGitOperation(summary)) {
          return {
            ok: false,
            error: {
              code: "GIT_DANGEROUS_OPERATION_BLOCKED",
              message: "Dangerous git operations are outside this tool's scope"
            }
          };
        }
        return { ok: true, content: `feat: ${summary}` };
      }
    }
  ];
}

function gitRuntime(access: "read" | "write"): ToolRuntimeMetadata {
  return {
    permission: { defaultAction: access === "read" ? "allow" : "ask", scope: "resource" },
    scheduler: {
      concurrency: access === "read" ? "read-only" : "resource-scoped",
      resources: { mode: "static", scopes: [{ kind: "git", access, value: "workspace" }] }
    },
    resultBudget: { maxContentChars: 12_000, strategy: "truncate" },
    renderer: { category: "git" },
    source: { kind: "first-party", packageName: "@guga-agent/plugin-tools-git" },
    backend: { kind: "local-git" },
    availability: { status: "available" },
    visibility: "model"
  };
}

async function runGit(workspaceRoot: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd: workspaceRoot });
  return result.stdout;
}

function pathFrom(input: unknown): string | undefined {
  if (!input || typeof input !== "object" || !("path" in input)) {
    return undefined;
  }
  const path = String((input as Record<string, unknown>).path);
  return path.length > 0 ? path : undefined;
}

function summaryFrom(input: unknown): string {
  if (!input || typeof input !== "object" || !("summary" in input)) {
    return "";
  }
  return String((input as Record<string, unknown>).summary).trim();
}
