import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("workbench dependency boundary", () => {
  it("does not import terminal renderer packages", async () => {
    const workbenchDir = dirname(fileURLToPath(import.meta.url));
    const files = (await readdir(workbenchDir)).filter((file) => file.endsWith(".ts"));
    const forbiddenPackages = ["@open" + "tui", "ink", "react"];

    for (const file of files) {
      const source = await readFile(join(workbenchDir, file), "utf8");

      for (const packageName of forbiddenPackages) {
        expect(source).not.toContain(`from "${packageName}`);
        expect(source).not.toContain(`from '${packageName}`);
      }
    }
  });

  it("keeps Ink behind the interactive dynamic import boundary", async () => {
    const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..");
    const files = (await listSourceFiles(srcDir))
      .filter((file) => !file.includes("/ink-workbench/"));
    const forbiddenPackages = ["@open" + "tui", "ink", "react"];

    for (const file of files) {
      const source = await readFile(file, "utf8");
      for (const packageName of forbiddenPackages) {
        expect(source).not.toContain(`from "${packageName}`);
        expect(source).not.toContain(`from '${packageName}`);
      }
    }

    const runSource = await readFile(join(srcDir, "commands/run.ts"), "utf8");
    expect(runSource).toContain('await import("../ink-workbench/launch")');
    expect(runSource).not.toMatch(/import\s+[^;]+from\s+["']\.\.\/ink-workbench/);
  });
});

async function listSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return listSourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}
