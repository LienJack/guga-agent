import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { CODE_AGENT_PROFILE_ID } from "@guga-agent/profile-code-agent";
import { DEEP_RESEARCH_PROFILE_ID } from "@guga-agent/profile-deep-research-agent";
import { CliHostFactoryError, createCliHost } from "./host-factory";

describe("CLI host factory", () => {
  it("defaults to the code profile with mock provider", async () => {
    const host = await createCliHost({ mock: true, env: {} });
    try {
      expect(host.profileId).toBe(CODE_AGENT_PROFILE_ID);
      await runNoop(host);
      await expect(host.local.client.listCapabilities()).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "tool", name: "fs_read" }),
          expect.objectContaining({ type: "operation", name: "provider.health" })
        ])
      );
    } finally {
      await host.local.close();
    }
  });

  it("switches profiles from flags", async () => {
    const host = await createCliHost({
      mock: true,
      profileId: DEEP_RESEARCH_PROFILE_ID,
      env: {}
    });
    try {
      expect(host.profileId).toBe(DEEP_RESEARCH_PROFILE_ID);
      await runNoop(host);
      await expect(host.local.client.listCapabilities()).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "operation", name: "provider.health" })
        ])
      );
    } finally {
      await host.local.close();
    }
  });

  it("uses file configured model aliases for real provider setup", async () => {
    const tempConfig = await writeTempConfig({
      providerId: "ai-sdk",
      providerMode: "openai-compatible",
      defaultModel: "fast",
      models: [{
        id: "fast",
        modelId: "gpt-fast"
      }]
    });
    const host = await createCliHost({
      env: {
        GUGA_CONFIG: tempConfig.configPath,
        GUGA_HOME: tempConfig.gugaHome,
        GUGA_API_KEY: "test-key"
      }
    });
    try {
      expect(host.selectedModel).toMatchObject({
        id: "fast",
        modelId: "gpt-fast"
      });
      expect(host.providerId).toBe("ai-sdk");
    } finally {
      await host.local.close();
    }
  });

  it("does not require api key for mock provider", async () => {
    const host = await createCliHost({
      mock: true,
      modelSelector: "missing-real-model",
      env: {}
    });
    try {
      const session = await host.local.client.createSession({});
      const run = await host.local.client.startRun(session.id, {
        input: "hello",
        providerId: "mock"
      });
      await expect(drainRun(host, run.id)).resolves.toContain("run.completed");
    } finally {
      await host.local.close();
    }
  });

  it("resolves default stores under Guga Home project partitions", async () => {
    const root = await mkdtemp(join(tmpdir(), "guga-host-home-"));
    const cwd = join(root, "project");
    mkdirSync(join(cwd, ".git"), { recursive: true });
    const homeDir = join(root, "home");
    const host = await createCliHost({
      mock: true,
      env: {},
      cwd,
      homeDir,
      workspaceRoot: cwd
    });
    try {
      expect(host.storage.home).toBe(join(homeDir, ".guga"));
      expect(host.storage.sessionsRoot).toContain(join(homeDir, ".guga/sessions/projects"));
      expect(host.storage.artifactsRoot).toContain(join(homeDir, ".guga/artifacts/projects"));
      expect(host.storage.memoryRoot).toBe(join(homeDir, ".guga/memory"));
      await runNoop(host);
      await expect(host.local.client.listCapabilities()).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "operation", name: "memory.jsonl.health" })
        ])
      );
    } finally {
      await host.local.close();
    }
  });

  it("honors GUGA_HOME for store diagnostics", async () => {
    const root = await mkdtemp(join(tmpdir(), "guga-host-home-"));
    const cwd = join(root, "project");
    const gugaHome = join(root, "override");
    mkdirSync(join(cwd, ".git"), { recursive: true });
    const host = await createCliHost({
      mock: true,
      env: { GUGA_HOME: gugaHome },
      cwd,
      workspaceRoot: cwd
    });
    try {
      expect(host.storage.home).toBe(gugaHome);
      expect(host.storage.sessionsRoot.startsWith(gugaHome)).toBe(true);
      expect(host.storage.artifactsRoot.startsWith(gugaHome)).toBe(true);
      expect(host.storage.memoryRoot).toBe(join(gugaHome, "memory"));
    } finally {
      await host.local.close();
    }
  });

  it("fails clearly when no model is configured", async () => {
    await expect(createCliHost({ env: {} })).rejects.toMatchObject({
      code: "MODEL_REQUIRED"
    } satisfies Partial<CliHostFactoryError>);
  });
});

async function drainRun(host: Awaited<ReturnType<typeof createCliHost>>, runId: string): Promise<string[]> {
  const types: string[] = [];
  for await (const event of host.local.client.streamRunEvents(runId)) {
    types.push(event.type);
  }
  return types;
}

async function runNoop(host: Awaited<ReturnType<typeof createCliHost>>): Promise<void> {
  const session = await host.local.client.createSession({});
  const run = await host.local.client.startRun(session.id, {
    input: "hello",
    providerId: "mock"
  });
  await drainRun(host, run.id);
}

async function writeTempConfig(value: unknown): Promise<{ configPath: string; gugaHome: string }> {
  const root = await mkdtemp(join(tmpdir(), "guga-host-factory-"));
  const configPath = join(root, ".guga/config.json");
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(value));
  return { configPath, gugaHome: join(root, "home") };
}
