import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("filesystem artifact dependency boundary", () => {
  it("keeps filesystem artifact storage out of core dependencies", async () => {
    const [pluginPackage, corePackage] = await Promise.all([
      readPackage(new URL("../package.json", import.meta.url)),
      readPackage(new URL("../../core/package.json", import.meta.url))
    ]);

    expect(pluginPackage.dependencies).toMatchObject({
      "@guga-agent/core": "workspace:*"
    });
    expect(corePackage.dependencies ?? {}).not.toHaveProperty("@guga-agent/plugin-artifact-filesystem");
  });
});

async function readPackage(url: URL): Promise<{ dependencies?: Record<string, string> }> {
  return JSON.parse(await readFile(url, "utf8")) as { dependencies?: Record<string, string> };
}
