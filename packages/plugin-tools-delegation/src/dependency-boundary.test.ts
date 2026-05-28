import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("delegation tool dependency boundary", () => {
  it("keeps delegation execution out of core package dependencies", async () => {
    const [pluginPackage, corePackage] = await Promise.all([
      readPackage(new URL("../package.json", import.meta.url)),
      readPackage(new URL("../../core/package.json", import.meta.url))
    ]);

    expect(pluginPackage.dependencies).toMatchObject({
      "@guga-agent/core": "workspace:*"
    });
    for (const dependencies of dependencySections(corePackage)) {
      expect(dependencies).not.toHaveProperty("@guga-agent/plugin-tools-delegation");
      expect(dependencies).not.toHaveProperty("langgraph");
      expect(dependencies).not.toHaveProperty("crewai");
    }
  });

  it("does not import the delegation plugin from core source", async () => {
    const files = await listTypeScriptFiles(new URL("../../core/src/", import.meta.url));
    const imports = await Promise.all(files.map(async (file) => ({
      file,
      content: await readFile(file, "utf8")
    })));

    expect(imports.filter(({ content }) =>
      content.includes("plugin-tools-delegation") ||
      content.includes("@guga-agent/plugin-tools-delegation")
    )).toEqual([]);
  });
});

type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

async function readPackage(url: URL): Promise<PackageManifest> {
  return JSON.parse(await readFile(url, "utf8")) as PackageManifest;
}

function dependencySections(manifest: PackageManifest): Array<Record<string, string>> {
  return [
    manifest.dependencies ?? {},
    manifest.devDependencies ?? {},
    manifest.peerDependencies ?? {},
    manifest.optionalDependencies ?? {}
  ];
}

async function listTypeScriptFiles(root: URL): Promise<string[]> {
  const rootPath = root.pathname;
  const entries = await readdir(rootPath, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(rootPath, entry.name);
    if (entry.isDirectory()) {
      return listTypeScriptFiles(new URL(`${path}/`, "file://"));
    }
    return entry.isFile() && path.endsWith(".ts") ? [path] : [];
  }));
  return nested.flat();
}
