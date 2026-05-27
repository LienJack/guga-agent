import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { AgentEventType, createAgentRuntime } from "@guga-agent/core";
import { createFilesystemArtifactPlugin } from "./filesystem-artifact-plugin";

const tempRoots: string[] = [];

describe("filesystem artifact plugin runtime integration", () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("registers an ArtifactStore through the public plugin context", async () => {
    const root = await tempRoot();
    const runtime = createAgentRuntime({
      plugins: [createFilesystemArtifactPlugin({ rootDir: root })]
    });

    const result = await runtime.run({ input: "hello", runId: "artifact-plugin-run" });
    const capabilities = runtime.getPersistenceCapabilities();

    expect(result).toMatchObject({ ok: false, error: { code: "PROVIDER_NOT_FOUND" } });
    expect(capabilities.artifactStore).toBeDefined();
    expect(result.events).toContainEqual(expect.objectContaining({
      type: AgentEventType.PluginCapabilityRegistered,
      capability: "artifact-store",
      pluginId: "guga-artifact-filesystem"
    }));

    await runtime.dispose();
  });
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "guga-artifact-runtime-"));
  tempRoots.push(root);
  return root;
}
