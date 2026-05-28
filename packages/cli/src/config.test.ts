import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CliConfigError,
  readCliConfigWithSources,
  selectCliModel
} from "./config";

describe("CLI config", () => {
  it("loads GUGA_CONFIG before project and user config", async () => {
    const root = await tempRoot();
    const explicit = writeConfig(root, "explicit.json", { modelId: "explicit-model" });
    writeConfig(root, ".guga/config.json", { modelId: "project-model" });
    const userConfig = writeConfig(root, "home/.guga/config.json", { modelId: "user-model" });

    const result = readCliConfigWithSources({
      env: { GUGA_CONFIG: explicit },
      cwd: root,
      homeDir: join(root, "home")
    });

    expect(userConfig).toContain("home/.guga/config.json");
    expect(result.config.modelId).toBe("explicit-model");
    expect(result.fileSource).toBe("guga_config");
    expect(result.sources.modelId).toBe("guga_config");
  });

  it("loads project config before user config", async () => {
    const root = await tempRoot();
    writeConfig(root, ".guga/config.json", { modelId: "project-model" });
    writeConfig(root, "home/.guga/config.json", { modelId: "user-model" });

    const result = readCliConfigWithSources({
      env: {},
      cwd: root,
      homeDir: join(root, "home")
    });

    expect(result.config.modelId).toBe("project-model");
    expect(result.fileSource).toBe("project");
    expect(result.sources.modelId).toBe("project");
  });

  it("fails when explicit GUGA_CONFIG does not exist", async () => {
    const root = await tempRoot();

    expect(() => readCliConfigWithSources({
      env: { GUGA_CONFIG: join(root, "missing.json") },
      cwd: root,
      homeDir: join(root, "home")
    })).toThrow("file does not exist");
  });

  it("applies env overrides over file config", async () => {
    const root = await tempRoot();
    writeConfig(root, ".guga/config.json", {
      providerId: "file-provider",
      modelId: "file-model",
      providerMode: "anthropic",
      baseURL: "http://file.example"
    });

    const result = readCliConfigWithSources({
      env: {
        GUGA_PROVIDER: "env-provider",
        GUGA_MODEL: "env-model",
        GUGA_PROVIDER_MODE: "openai-compatible",
        GUGA_BASE_URL: "http://env.example",
        GUGA_API_KEY: "env-key"
      },
      cwd: root,
      homeDir: join(root, "home")
    });

    expect(result.config).toMatchObject({
      providerId: "env-provider",
      modelId: "env-model",
      defaultModel: "env-model",
      providerMode: "openai-compatible",
      baseURL: "http://env.example",
      apiKey: "env-key"
    });
    expect(result.sources.modelId).toBe("env");
    expect(result.sources.providerId).toBe("env");
  });

  it("selects model aliases and resolves model-specific api key env", () => {
    const selected = selectCliModel({
      providerId: "ai-sdk",
      providerMode: "openai",
      defaultModel: "fast",
      models: [{
        id: "fast",
        modelId: "gpt-fast",
        label: "Fast",
        apiKeyEnv: "FAST_KEY",
        baseURL: "http://fast.example"
      }]
    }, undefined, { FAST_KEY: "secret" });

    expect(selected).toEqual({
      id: "fast",
      label: "Fast",
      providerId: "ai-sdk",
      providerMode: "openai",
      modelId: "gpt-fast",
      apiKey: "secret",
      baseURL: "http://fast.example"
    });
  });

  it("throws actionable errors for invalid JSON", async () => {
    const root = await tempRoot();
    const path = writeRaw(root, ".guga/config.json", "{not-json");

    expect(() => readCliConfigWithSources({ env: {}, cwd: root, homeDir: join(root, "home") }))
      .toThrow(CliConfigError);
    expect(() => readCliConfigWithSources({ env: {}, cwd: root, homeDir: join(root, "home") }))
      .toThrow(`Invalid Guga config at ${path}`);
  });
});

async function tempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "guga-cli-config-"));
}

function writeConfig(root: string, path: string, value: unknown): string {
  return writeRaw(root, path, JSON.stringify(value));
}

function writeRaw(root: string, path: string, value: string): string {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, value);
  return fullPath;
}
