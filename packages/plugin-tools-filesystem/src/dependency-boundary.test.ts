import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("filesystem tool dependency boundary", () => {
  it("keeps glob and ignore helpers local to the filesystem plugin package", async () => {
    const [pluginPackage, corePackage] = await Promise.all([
      readPackage(new URL("../package.json", import.meta.url)),
      readPackage(new URL("../../core/package.json", import.meta.url))
    ]);

    expect(pluginPackage.dependencies).toMatchObject({
      "fast-glob": expect.any(String),
      ignore: expect.any(String)
    });
    expect(corePackage.dependencies ?? {}).not.toHaveProperty("fast-glob");
    expect(corePackage.dependencies ?? {}).not.toHaveProperty("ignore");
  });
});

async function readPackage(url: URL): Promise<{ dependencies?: Record<string, string> }> {
  return JSON.parse(await readFile(url, "utf8")) as { dependencies?: Record<string, string> };
}
