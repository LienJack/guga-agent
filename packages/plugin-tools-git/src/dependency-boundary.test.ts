import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("git tool dependency boundary", () => {
  it("keeps git backend choices out of core dependencies", async () => {
    const [pluginPackage, corePackage] = await Promise.all([
      readPackage(new URL("../package.json", import.meta.url)),
      readPackage(new URL("../../core/package.json", import.meta.url))
    ]);

    expect(pluginPackage.dependencies).toMatchObject({
      "@guga-agent/core": "workspace:*"
    });
    expect(corePackage.dependencies ?? {}).not.toHaveProperty("simple-git");
    expect(corePackage.dependencies ?? {}).not.toHaveProperty("diff");
  });
});

async function readPackage(url: URL): Promise<{ dependencies?: Record<string, string> }> {
  return JSON.parse(await readFile(url, "utf8")) as { dependencies?: Record<string, string> };
}
