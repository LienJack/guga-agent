import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { realpath, readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import fg from "fast-glob";
import ignore from "ignore";
import type { LocalPlugin } from "../contracts/plugins";
import type { ToolDefinition } from "../contracts/tools";

export type FilesystemBackend = {
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  list(path: string): Promise<string[]>;
  search(root: string, query: string): Promise<string[]>;
};

export type FilesystemPluginOptions = {
  workspaceRoot: string;
  backend?: FilesystemBackend;
  pluginId?: string;
};

export type BuiltInFilesystemOptions = Omit<FilesystemPluginOptions, "pluginId">;

export type WorkspacePathResolution =
  | {
      ok: true;
      path: string;
    }
  | {
      ok: false;
      reason: "outside-workspace" | "not-found";
      message: string;
    };

export function createFilesystemPlugin(options: FilesystemPluginOptions): LocalPlugin {
  const pluginId = options.pluginId ?? "guga-filesystem-tools";
  const backend = options.backend ?? createLocalFilesystemBackend();

  return {
    id: pluginId,
    name: "Guga Filesystem Tools",
    init(context) {
      for (const tool of createBuiltInFilesystemTools({ workspaceRoot: options.workspaceRoot, backend })) {
        context.registerTool(tool);
      }
    }
  };
}

export function createBuiltInFilesystemTools(options: BuiltInFilesystemOptions): ToolDefinition[] {
  return filesystemTools(options.workspaceRoot, options.backend ?? createLocalFilesystemBackend());
}

export function createLocalFilesystemBackend(): FilesystemBackend {
  return {
    async readText(path) {
      return readFile(path, "utf8");
    },
    async writeText(path, content) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf8");
    },
    async list(path) {
      return readdir(path);
    },
    async search(root, query) {
      return searchFiles(root, query);
    }
  };
}

export async function resolveWorkspacePath(workspaceRoot: string, inputPath: string): Promise<WorkspacePathResolution> {
  const root = resolve(workspaceRoot);
  const target = resolve(root, inputPath);
  if (!isWithin(root, target)) {
    return { ok: false, reason: "outside-workspace", message: `Path is outside workspace: ${inputPath}` };
  }

  try {
    const realRoot = await realpath(root);
    const realTarget = await realpath(target);
    if (!isWithin(realRoot, realTarget)) {
      return { ok: false, reason: "outside-workspace", message: `Path resolves outside workspace: ${inputPath}` };
    }
    return { ok: true, path: realTarget };
  } catch {
    const realRoot = await realpath(root);
    const parent = await nearestExistingParent(target);
    if (!isWithin(realRoot, parent)) {
      return { ok: false, reason: "outside-workspace", message: `Path is outside workspace: ${inputPath}` };
    }
    return { ok: true, path: target };
  }
}

async function nearestExistingParent(path: string): Promise<string> {
  let current = dirname(path);
  while (current !== dirname(current)) {
    try {
      return await realpath(current);
    } catch {
      current = dirname(current);
    }
  }
  return realpath(current);
}

function filesystemTools(workspaceRoot: string, backend: FilesystemBackend): ToolDefinition[] {
  return [
    {
      name: "fs_read",
      description: "Read a UTF-8 file inside the workspace",
      inputSchema: { type: "object", required: ["path"] },
      effect: "read",
      runtime: {
        permission: { defaultAction: "allow", scope: "resource" },
        scheduler: {
          concurrency: "read-only",
          resources: { mode: "extractor", extract: (input) => [{ kind: "path", access: "read", value: pathFrom(input) }] }
        },
        resultBudget: { maxContentChars: 8_000, strategy: "truncate" },
        renderer: { category: "read" },
        source: { kind: "core", packageName: "@guga-agent/core" },
        backend: { kind: "local-workspace" },
        availability: { status: "available" },
        visibility: "model"
      },
      async execute(input) {
        const resolved = await resolveWorkspacePath(workspaceRoot, pathFrom(input));
        if (!resolved.ok) {
          return { ok: false, error: { code: "FS_PATH_OUTSIDE_WORKSPACE", message: resolved.message } };
        }
        return { ok: true, content: await backend.readText(resolved.path) };
      }
    },
    {
      name: "fs_write",
      description: "Write a UTF-8 file inside the workspace",
      inputSchema: { type: "object", required: ["path", "content"] },
      effect: "write",
      runtime: {
        permission: { defaultAction: "ask", scope: "resource" },
        scheduler: {
          concurrency: "serial",
          resources: { mode: "extractor", extract: (input) => [{ kind: "path", access: "write", value: pathFrom(input) }] }
        },
        renderer: { category: "edit" },
        source: { kind: "core", packageName: "@guga-agent/core" },
        backend: { kind: "local-workspace" },
        availability: { status: "available" },
        visibility: "model"
      },
      async execute(input) {
        const resolved = await resolveWorkspacePath(workspaceRoot, pathFrom(input));
        if (!resolved.ok) {
          return { ok: false, error: { code: "FS_PATH_OUTSIDE_WORKSPACE", message: resolved.message } };
        }
        await backend.writeText(resolved.path, contentFrom(input));
        return { ok: true, content: `Wrote ${pathFrom(input)}` };
      }
    },
    {
      name: "fs_edit",
      description: "Replace exactly one UTF-8 text occurrence inside a workspace file",
      inputSchema: { type: "object", required: ["path", "oldText", "newText"] },
      effect: "write",
      runtime: {
        permission: { defaultAction: "ask", scope: "resource" },
        scheduler: {
          concurrency: "serial",
          resources: { mode: "extractor", extract: (input) => [{ kind: "path", access: "write", value: pathFrom(input) }] }
        },
        renderer: { category: "edit" },
        source: { kind: "core", packageName: "@guga-agent/core" },
        backend: { kind: "local-workspace" },
        availability: { status: "available" },
        visibility: "model"
      },
      async execute(input) {
        const resolved = await resolveWorkspacePath(workspaceRoot, pathFrom(input));
        if (!resolved.ok) {
          return { ok: false, error: { code: "FS_PATH_OUTSIDE_WORKSPACE", message: resolved.message } };
        }

        const oldText = field(input, "oldText");
        const newText = field(input, "newText");
        const content = await backend.readText(resolved.path);
        const occurrences = content.split(oldText).length - 1;
        if (!oldText || occurrences === 0) {
          return { ok: false, error: { code: "FS_EDIT_NOT_FOUND", message: "Text to replace was not found" } };
        }
        if (occurrences > 1) {
          return { ok: false, error: { code: "FS_EDIT_AMBIGUOUS", message: "Text to replace appears more than once" } };
        }

        await backend.writeText(resolved.path, content.replace(oldText, newText));
        return { ok: true, content: `Edited ${pathFrom(input)}` };
      }
    },
    {
      name: "fs_list",
      description: "List files inside a workspace directory",
      inputSchema: { type: "object", required: ["path"] },
      effect: "read",
      runtime: {
        permission: { defaultAction: "allow", scope: "resource" },
        scheduler: { concurrency: "read-only", resources: { mode: "none" } },
        resultBudget: { maxContentChars: 8_000, strategy: "truncate" },
        renderer: { category: "search" },
        source: { kind: "core", packageName: "@guga-agent/core" },
        backend: { kind: "local-workspace" },
        availability: { status: "available" },
        visibility: "model"
      },
      async execute(input) {
        const resolved = await resolveWorkspacePath(workspaceRoot, pathFrom(input));
        if (!resolved.ok) {
          return { ok: false, error: { code: "FS_PATH_OUTSIDE_WORKSPACE", message: resolved.message } };
        }
        return { ok: true, content: (await backend.list(resolved.path)).join("\n") };
      }
    },
    {
      name: "fs_search",
      description: "Search workspace file paths by substring",
      inputSchema: { type: "object", required: ["query"] },
      effect: "read",
      runtime: {
        permission: { defaultAction: "allow", scope: "resource" },
        scheduler: { concurrency: "read-only", resources: { mode: "none" } },
        resultBudget: { maxContentChars: 8_000, strategy: "truncate" },
        renderer: { category: "search" },
        source: { kind: "core", packageName: "@guga-agent/core" },
        backend: { kind: "local-workspace" },
        availability: { status: "available" },
        visibility: "model"
      },
      async execute(input) {
        return { ok: true, content: (await backend.search(workspaceRoot, queryFrom(input))).join("\n") };
      }
    }
  ];
}

function isWithin(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !rel.includes(`..${sep}`) && !isAbsolute(rel));
}

function pathFrom(input: unknown): string {
  return field(input, "path");
}

function contentFrom(input: unknown): string {
  return field(input, "content");
}

function queryFrom(input: unknown): string {
  return field(input, "query");
}

function field(input: unknown, name: string): string {
  if (!input || typeof input !== "object" || !(name in input)) {
    return "";
  }
  return String((input as Record<string, unknown>)[name]);
}

async function searchFiles(root: string, query: string): Promise<string[]> {
  const entries = await fg("**/*", {
    cwd: root,
    dot: true,
    onlyFiles: false,
    followSymbolicLinks: false,
    suppressErrors: true,
    ignore: [".git/**", "node_modules/**"]
  });
  const ignored = await workspaceIgnore(root);

  return entries
    .filter((entry) => !ignored.ignores(entry))
    .filter((entry) => entry.includes(query))
    .map((entry) => join(root, entry));
}

async function workspaceIgnore(root: string): Promise<ReturnType<typeof ignore>> {
  const ignored = ignore();
  try {
    ignored.add(await readFile(join(root, ".gitignore"), "utf8"));
  } catch {
    // No workspace ignore file is a valid first-run state.
  }
  return ignored;
}
