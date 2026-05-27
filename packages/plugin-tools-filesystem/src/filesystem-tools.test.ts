import { mkdir, mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { ToolDefinition } from "@guga-agent/core";
import type { FilesystemBackend } from "./filesystem-plugin";
import { createFilesystemPlugin } from "./filesystem-plugin";

const tempRoots: string[] = [];

describe("filesystem tools", () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("registers read, write, list, and search tools with runtime metadata", () => {
    const registered = registeredTools("/workspace");

    expect(registered.map((tool) => tool.name)).toEqual(["fs_read", "fs_write", "fs_edit", "fs_list", "fs_search"]);
    expect(registered.find((tool) => tool.name === "fs_write")?.runtime).toMatchObject({
      permission: { defaultAction: "ask" },
      scheduler: { concurrency: "serial" },
      renderer: { category: "edit" }
    });
  });

  it("reads and writes inside the workspace", async () => {
    const root = await tempWorkspace();
    const [readTool, writeTool] = registeredTools(root);
    await writeFile(join(root, "a.txt"), "before");

    await expect(readTool!.execute({ path: "a.txt" }, { call: { id: "read", name: "fs_read", input: {} } })).resolves.toEqual({
      ok: true,
      content: "before"
    });
    await expect(writeTool!.execute({ path: "b.txt", content: "after" }, { call: { id: "write", name: "fs_write", input: {} } })).resolves.toMatchObject({
      ok: true
    });
    await expect(readFile(join(root, "b.txt"), "utf8")).resolves.toBe("after");
  });

  it("uses replaceable backends", async () => {
    const root = await tempWorkspace();
    await writeFile(join(root, "a.txt"), "placeholder");
    const rootTools = registeredTools(root, {
      readText: async () => "backend read",
      writeText: async () => undefined,
      list: async () => ["a.txt"],
      search: async () => ["a.txt"]
    });
    await expect(rootTools[0]!.execute({ path: "a.txt" }, { call: { id: "read", name: "fs_read", input: {} } })).resolves.toEqual({
      ok: true,
      content: "backend read"
    });
  });

  it("edits exactly one occurrence inside the workspace", async () => {
    const root = await tempWorkspace();
    const editTool = registeredTools(root).find((tool) => tool.name === "fs_edit")!;
    await writeFile(join(root, "a.txt"), "hello old world");

    await expect(
      editTool.execute(
        { path: "a.txt", oldText: "old", newText: "new" },
        { call: { id: "edit", name: "fs_edit", input: {} } }
      )
    ).resolves.toMatchObject({ ok: true });
    await expect(readFile(join(root, "a.txt"), "utf8")).resolves.toBe("hello new world");
  });

  it("rejects ambiguous edits", async () => {
    const root = await tempWorkspace();
    const editTool = registeredTools(root).find((tool) => tool.name === "fs_edit")!;
    await writeFile(join(root, "a.txt"), "old old");

    await expect(
      editTool.execute(
        { path: "a.txt", oldText: "old", newText: "new" },
        { call: { id: "edit", name: "fs_edit", input: {} } }
      )
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "FS_EDIT_AMBIGUOUS" }
    });
  });

  it("rejects missing or empty edit search text", async () => {
    const root = await tempWorkspace();
    const editTool = registeredTools(root).find((tool) => tool.name === "fs_edit")!;
    await writeFile(join(root, "a.txt"), "hello world");

    await expect(
      editTool.execute(
        { path: "a.txt", oldText: "missing", newText: "new" },
        { call: { id: "edit", name: "fs_edit", input: {} } }
      )
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "FS_EDIT_NOT_FOUND" }
    });
    await expect(
      editTool.execute(
        { path: "a.txt", oldText: "", newText: "new" },
        { call: { id: "edit", name: "fs_edit", input: {} } }
      )
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "FS_EDIT_NOT_FOUND" }
    });
  });

  it("searches with plugin-local glob and ignore handling inside the workspace", async () => {
    const root = await tempWorkspace();
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "ignored"), { recursive: true });
    await writeFile(join(root, ".gitignore"), "ignored/\n");
    await writeFile(join(root, "src", "needle.txt"), "ok");
    await writeFile(join(root, "ignored", "needle.txt"), "hidden");
    const searchTool = registeredTools(root).find((tool) => tool.name === "fs_search")!;

    await expect(searchTool.execute({ query: "needle" }, { call: { id: "search", name: "fs_search", input: {} } })).resolves.toEqual({
      ok: true,
      content: join(root, "src", "needle.txt")
    });
  });
});

function registeredTools(workspaceRoot: string, backend?: FilesystemBackend): ToolDefinition[] {
  const tools: ToolDefinition[] = [];
  createFilesystemPlugin({ workspaceRoot, ...(backend ? { backend } : {}) }).init({
    pluginId: "test",
    registerProvider() {},
    registerModel() {},
    registerTool(tool) {
      tools.push(tool);
    },
    registerHook() {}
  });
  return tools;
}

async function tempWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "guga-fs-tools-"));
  tempRoots.push(root);
  return root;
}
