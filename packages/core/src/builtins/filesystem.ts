import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
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

type ReadAttempt =
  | {
      ok: true;
      content: string;
    }
  | {
      ok: false;
      code: "not-found" | "ambiguous" | "failed";
      message: string;
      suggestions?: string[];
    };

const IMPLICIT_READ_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".mdx",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".toml"
]);

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
        const requestedPath = pathFrom(input);
        const resolved = await resolveWorkspacePath(workspaceRoot, requestedPath);
        if (!resolved.ok) {
          return { ok: false, error: { code: "FS_PATH_OUTSIDE_WORKSPACE", message: resolved.message } };
        }
        const read = await readWorkspaceText(workspaceRoot, requestedPath, resolved.path, backend);
        if (read.ok) {
          return { ok: true, content: read.content };
        }
        return {
          ok: false,
          error: {
            code: read.code === "ambiguous" ? "FS_READ_AMBIGUOUS" : read.code === "not-found" ? "FS_READ_NOT_FOUND" : "FS_READ_FAILED",
            message: read.message,
            ...(read.suggestions ? { details: { suggestions: read.suggestions } } : {})
          }
        };
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
        const paths = await backend.search(workspaceRoot, queryFrom(input));
        return {
          ok: true,
          content: paths
            .map((path) => workspaceRelativePath(workspaceRoot, path))
            .filter((path) => path.length > 0)
            .join("\n")
        };
      }
    },
    {
      name: "fs_glob",
      description: "Find workspace paths matching a glob pattern",
      inputSchema: {
        type: "object",
        required: ["pattern"],
        properties: {
          pattern: { type: "string" },
          maxResults: { type: "integer" }
        }
      },
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
        const pattern = field(input, "pattern");
        const matches = await globWorkspace(workspaceRoot, pattern, maxResultsFrom(input));
        return { ok: true, content: matches.join("\n") };
      }
    },
    {
      name: "fs_grep",
      description: "Search workspace file contents for a text query",
      inputSchema: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string" },
          path: { type: "string" },
          maxResults: { type: "integer" }
        }
      },
      effect: "read",
      runtime: {
        permission: { defaultAction: "allow", scope: "resource" },
        scheduler: { concurrency: "read-only", resources: { mode: "none" } },
        resultBudget: { maxContentChars: 12_000, strategy: "truncate" },
        renderer: { category: "search" },
        source: { kind: "core", packageName: "@guga-agent/core" },
        backend: { kind: "local-workspace" },
        availability: { status: "available" },
        visibility: "model"
      },
      async execute(input) {
        const query = queryFrom(input);
        if (!query) {
          return { ok: false, error: { code: "FS_GREP_QUERY_REQUIRED", message: "query is required" } };
        }
        const basePath = field(input, "path");
        if (basePath) {
          const resolved = await resolveWorkspacePath(workspaceRoot, basePath);
          if (!resolved.ok) {
            return { ok: false, error: { code: "FS_PATH_OUTSIDE_WORKSPACE", message: resolved.message } };
          }
        }
        const matches = await grepWorkspace(workspaceRoot, backend, {
          query,
          basePath,
          maxResults: maxResultsFrom(input)
        });
        return { ok: true, content: matches.join("\n") };
      }
    }
  ];
}

async function readWorkspaceText(
  workspaceRoot: string,
  requestedPath: string,
  resolvedPath: string,
  backend: FilesystemBackend
): Promise<ReadAttempt> {
  const direct = await tryReadText(backend, resolvedPath);
  if (direct.ok) {
    return { ok: true, content: direct.content };
  }
  if (!direct.notFound) {
    return { ok: false, code: "failed", message: `Unable to read ${requestedPath}: ${direct.message}` };
  }

  const implicit = await resolveImplicitReadPath(workspaceRoot, requestedPath, backend);
  if (implicit.ok) {
    const fallback = await tryReadText(backend, implicit.path);
    if (fallback.ok) {
      return { ok: true, content: fallback.content };
    }
    if (!fallback.notFound) {
      return { ok: false, code: "failed", message: `Unable to read ${implicit.displayPath}: ${fallback.message}` };
    }
  } else if (implicit.code === "ambiguous") {
    return {
      ok: false,
      code: "ambiguous",
      message: `Multiple files match ${requestedPath}. Read one of: ${implicit.suggestions.join(", ")}`,
      suggestions: implicit.suggestions
    };
  }

  const suggestions = await suggestWorkspaceReadPaths(workspaceRoot, requestedPath, backend);
  return {
    ok: false,
    code: "not-found",
    message: suggestions.length > 0
      ? `File not found: ${requestedPath}. Did you mean one of: ${suggestions.join(", ")}`
      : `File not found: ${requestedPath}`,
    ...(suggestions.length > 0 ? { suggestions } : {})
  };
}

async function tryReadText(backend: FilesystemBackend, path: string): Promise<
  | {
      ok: true;
      content: string;
    }
  | {
      ok: false;
      notFound: boolean;
      message: string;
    }
> {
  try {
    return { ok: true, content: await backend.readText(path) };
  } catch (error) {
    return {
      ok: false,
      notFound: errorCode(error) === "ENOENT",
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

async function resolveImplicitReadPath(
  workspaceRoot: string,
  requestedPath: string,
  backend: FilesystemBackend
): Promise<
  | {
      ok: true;
      path: string;
      displayPath: string;
    }
  | {
      ok: false;
      code: "none" | "ambiguous";
      suggestions: string[];
    }
> {
  const requestedName = basename(requestedPath);
  const requestedDir = dirname(requestedPath);
  const requestedExt = extname(requestedName).toLowerCase();
  const parent = await resolveWorkspacePath(workspaceRoot, requestedDir === "." ? "" : requestedDir);
  if (!parent.ok) {
    return { ok: false, code: "none", suggestions: [] };
  }

  let entries: string[];
  try {
    entries = await backend.list(parent.path);
  } catch {
    return { ok: false, code: "none", suggestions: [] };
  }

  const requestedLower = requestedName.toLowerCase();
  const requestedStemLower = stripExtension(requestedName).toLowerCase();
  const matches = entries.filter((entry) => {
    const entryLower = entry.toLowerCase();
    if (requestedExt) {
      return entryLower === requestedLower;
    }
    return stripExtension(entry).toLowerCase() === requestedStemLower && IMPLICIT_READ_EXTENSIONS.has(extname(entry).toLowerCase());
  });

  if (matches.length === 0) {
    return { ok: false, code: "none", suggestions: [] };
  }
  const suggestions = matches
    .map((entry) => requestedDir === "." ? entry : join(requestedDir, entry))
    .map((path) => workspaceRelativePath(workspaceRoot, path))
    .sort(compareWorkspacePaths);
  if (matches.length > 1) {
    return { ok: false, code: "ambiguous", suggestions };
  }

  const match = matches[0];
  if (!match) {
    return { ok: false, code: "none", suggestions: [] };
  }
  const implicitPath = requestedDir === "." ? match : join(requestedDir, match);
  const resolved = await resolveWorkspacePath(workspaceRoot, implicitPath);
  if (!resolved.ok) {
    return { ok: false, code: "none", suggestions: [] };
  }
  return { ok: true, path: resolved.path, displayPath: workspaceRelativePath(workspaceRoot, implicitPath) };
}

async function suggestWorkspaceReadPaths(
  workspaceRoot: string,
  requestedPath: string,
  backend: FilesystemBackend
): Promise<string[]> {
  const requestedName = basename(requestedPath);
  const requestedExt = extname(requestedName).toLowerCase();
  const requestedStem = stripExtension(requestedName).toLowerCase();
  const matches = await backend.search(workspaceRoot, requestedName);
  return [...new Set(matches
    .map((path) => workspaceRelativePath(workspaceRoot, path))
    .filter((path) => {
      const candidateName = basename(path);
      if (requestedExt) {
        return candidateName.toLowerCase() === requestedName.toLowerCase();
      }
      return stripExtension(candidateName).toLowerCase() === requestedStem;
    }))]
    .sort(compareWorkspacePaths)
    .slice(0, 5);
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

function maxResultsFrom(input: unknown): number {
  if (!input || typeof input !== "object" || !("maxResults" in input)) {
    return 100;
  }
  const value = Number((input as Record<string, unknown>).maxResults);
  return Number.isFinite(value) ? Math.max(1, Math.min(500, Math.trunc(value))) : 100;
}

function field(input: unknown, name: string): string {
  if (!input || typeof input !== "object" || !(name in input)) {
    return "";
  }
  return String((input as Record<string, unknown>)[name]);
}

async function searchFiles(root: string, query: string): Promise<string[]> {
  const normalizedQuery = query.toLowerCase();
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
    .filter((entry) => entry.toLowerCase().includes(normalizedQuery))
    .map((entry) => normalizeWorkspacePath(entry))
    .sort(compareWorkspacePaths);
}

async function globWorkspace(root: string, pattern: string, maxResults: number): Promise<string[]> {
  const entries = await fg(pattern || "**/*", {
    cwd: root,
    dot: true,
    onlyFiles: false,
    followSymbolicLinks: false,
    suppressErrors: true,
    ignore: [".git/**", "node_modules/**"]
  });
  const ignored = await workspaceIgnore(root);
  return entries
    .map((entry) => normalizeWorkspacePath(entry))
    .filter((entry) => entry !== ".." && !entry.startsWith("../"))
    .filter((entry) => !ignored.ignores(entry))
    .sort(compareWorkspacePaths)
    .slice(0, maxResults);
}

async function grepWorkspace(
  root: string,
  backend: FilesystemBackend,
  options: {
    query: string;
    basePath: string;
    maxResults: number;
  }
): Promise<string[]> {
  const base = options.basePath ? normalizeWorkspacePath(options.basePath) : "";
  const pattern = base ? grepPatternForBasePath(base) : "**/*";
  const candidates = await globWorkspace(root, pattern, options.maxResults * 20);
  const lowerQuery = options.query.toLowerCase();
  const matches: string[] = [];

  for (const candidate of candidates) {
    if (matches.length >= options.maxResults) {
      break;
    }
    const resolved = await resolveWorkspacePath(root, candidate);
    if (!resolved.ok) {
      continue;
    }
    const content = await tryReadText(backend, resolved.path);
    if (!content.ok) {
      continue;
    }
    const lines = content.content.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      if (!line.toLowerCase().includes(lowerQuery)) {
        continue;
      }
      matches.push(`${candidate}:${index + 1}:${line.trim()}`);
      if (matches.length >= options.maxResults) {
        break;
      }
    }
  }

  return matches;
}

function grepPatternForBasePath(basePath: string): string {
  const normalized = basePath.replace(/\/$/, "");
  return extname(normalized) ? normalized : `${normalized}/**/*`;
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

function workspaceRelativePath(workspaceRoot: string, path: string): string {
  if (!path) {
    return "";
  }
  const root = resolve(workspaceRoot);
  const absolute = isAbsolute(path) ? resolve(path) : resolve(root, path);
  if (!isWithin(root, absolute)) {
    return "";
  }
  return normalizeWorkspacePath(relative(root, absolute));
}

function normalizeWorkspacePath(path: string): string {
  return path.split(sep).join("/");
}

function stripExtension(path: string): string {
  const extension = extname(path);
  return extension ? path.slice(0, -extension.length) : path;
}

function compareWorkspacePaths(left: string, right: string): number {
  const depth = pathDepth(left) - pathDepth(right);
  if (depth !== 0) {
    return depth;
  }
  return left < right ? -1 : left > right ? 1 : 0;
}

function pathDepth(path: string): number {
  return path.split("/").filter(Boolean).length;
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}
