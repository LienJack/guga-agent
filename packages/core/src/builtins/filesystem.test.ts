import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ToolDefinition } from "../contracts/tools";
import { createBuiltInFilesystemTools } from "./filesystem";

describe("built-in filesystem tools", () => {
  it("reads common document names through extension and case resolution", async () => {
    const workspaceRoot = await createWorkspace({
      "README.md": "# Project\n"
    });
    const tools = filesystemToolMap(workspaceRoot);

    await expect(execute(tools.fs_read, { path: "readme" })).resolves.toEqual({
      ok: true,
      content: "# Project\n"
    });
  });

  it("returns concise README suggestions when the requested document is ambiguous", async () => {
    const workspaceRoot = await createWorkspace({
      "packages/cli/README.md": "# CLI\n",
      "packages/core/README.md": "# Core\n"
    });
    const tools = filesystemToolMap(workspaceRoot);

    await expect(execute(tools.fs_read, { path: "README.md" })).resolves.toEqual({
      ok: false,
      error: {
        code: "FS_READ_NOT_FOUND",
        message: "File not found: README.md. Did you mean one of: packages/cli/README.md, packages/core/README.md",
        details: {
          suggestions: ["packages/cli/README.md", "packages/core/README.md"]
        }
      }
    });
  });

  it("returns search matches as workspace-relative paths", async () => {
    const workspaceRoot = await createWorkspace({
      "packages/cli/README.md": "# CLI\n",
      "packages/core/README.md": "# Core\n"
    });
    const tools = filesystemToolMap(workspaceRoot);

    await expect(execute(tools.fs_search, { query: "readme" })).resolves.toEqual({
      ok: true,
      content: "packages/cli/README.md\npackages/core/README.md"
    });
  });

  it("returns deterministic glob matches with max result limits", async () => {
    const workspaceRoot = await createWorkspace({
      "packages/cli/src/index.ts": "export {}\n",
      "packages/core/src/index.ts": "export {}\n",
      "packages/core/README.md": "# Core\n"
    });
    const tools = filesystemToolMap(workspaceRoot);

    await expect(execute(tools.fs_glob, { pattern: "packages/**/index.ts", maxResults: 1 })).resolves.toEqual({
      ok: true,
      content: "packages/cli/src/index.ts"
    });
  });

  it("greps file contents inside the workspace", async () => {
    const workspaceRoot = await createWorkspace({
      "packages/cli/src/index.ts": "export const cli = true;\n",
      "packages/core/src/index.ts": "export const core = true;\n"
    });
    const tools = filesystemToolMap(workspaceRoot);

    await expect(execute(tools.fs_grep, { query: "const", path: "packages/core", maxResults: 5 })).resolves.toEqual({
      ok: true,
      content: "packages/core/src/index.ts:1:export const core = true;"
    });
  });
});

function filesystemToolMap(workspaceRoot: string): Record<string, ToolDefinition> {
  return Object.fromEntries(createBuiltInFilesystemTools({ workspaceRoot }).map((tool) => [tool.name, tool]));
}

async function execute(tool: ToolDefinition, input: unknown) {
  return tool.execute(input, {
    call: { id: `call-${tool.name}`, name: tool.name, input }
  });
}

async function createWorkspace(files: Record<string, string>): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "guga-fs-"));
  for (const [path, content] of Object.entries(files)) {
    const absolutePath = join(workspaceRoot, path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, "utf8");
  }
  return workspaceRoot;
}
