import { mkdtemp, rm, symlink, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { resolveWorkspacePath } from "./filesystem-plugin";

const tempRoots: string[] = [];

describe("filesystem path containment", () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("allows relative paths inside the workspace", async () => {
    const root = await tempWorkspace();
    await writeFile(join(root, "README.md"), "ok");

    await expect(resolveWorkspacePath(root, "README.md")).resolves.toMatchObject({ ok: true });
  });

  it("rejects traversal outside the workspace", async () => {
    const root = await tempWorkspace();

    await expect(resolveWorkspacePath(root, "../outside.txt")).resolves.toMatchObject({
      ok: false,
      reason: "outside-workspace"
    });
  });

  it("rejects absolute paths outside the workspace", async () => {
    const root = await tempWorkspace();

    await expect(resolveWorkspacePath(root, "/tmp/outside.txt")).resolves.toMatchObject({
      ok: false,
      reason: "outside-workspace"
    });
  });

  it("rejects symlinks that resolve outside the workspace", async () => {
    const root = await tempWorkspace();
    const outside = await tempWorkspace();
    await writeFile(join(outside, "secret.txt"), "secret");
    await symlink(join(outside, "secret.txt"), join(root, "link.txt"));

    await expect(resolveWorkspacePath(root, "link.txt")).resolves.toMatchObject({
      ok: false,
      reason: "outside-workspace"
    });
  });

  it("allows writes to new files whose parent stays inside the workspace", async () => {
    const root = await tempWorkspace();
    await mkdir(join(root, "src"));

    await expect(resolveWorkspacePath(root, "src/new.txt")).resolves.toMatchObject({ ok: true });
  });

  it("allows writes to new nested paths inside the workspace", async () => {
    const root = await tempWorkspace();

    await expect(resolveWorkspacePath(root, "new/dir/file.txt")).resolves.toMatchObject({ ok: true });
  });
});

async function tempWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "guga-fs-"));
  tempRoots.push(root);
  return root;
}
