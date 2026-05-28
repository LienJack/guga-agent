import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
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
    expect(result.sourceStack?.map((source) => source.source)).toEqual(["user", "project", "guga_config"]);
    expect(result.sources.modelId).toBe("guga_config");
  });

  it("merges project config over user config", async () => {
    const root = await tempRoot();
    writeConfig(root, ".guga/config.json", { modelId: "project-model" });
    writeConfig(root, "home/.guga/config.json", { providerId: "user-provider", modelId: "user-model" });

    const result = readCliConfigWithSources({
      env: {},
      cwd: root,
      homeDir: join(root, "home")
    });

    expect(result.config.providerId).toBe("user-provider");
    expect(result.config.modelId).toBe("project-model");
    expect(result.fileSource).toBe("project");
    expect(result.sources.modelId).toBe("project");
    expect(result.sources.providerId).toBe("user");
  });

  it("loads TOML before JSON and merges model aliases by id", async () => {
    const root = await tempRoot();
    writeRaw(root, "home/.guga/config.toml", `
defaultModel = "sonnet"
providerId = "user-provider"

[[models]]
id = "sonnet"
label = "User Sonnet"
modelId = "claude-sonnet"
providerMode = "anthropic"

[[models]]
id = "fast"
label = "Fast"
modelId = "gpt-fast"
`);
    writeConfig(root, "home/.guga/config.json", { modelId: "json-should-not-load" });
    writeRaw(root, ".guga/config.toml", `
[[models]]
id = "sonnet"
label = "Project Sonnet"
modelId = "project-sonnet"
baseURL = "http://project.example"
`);

    const result = readCliConfigWithSources({
      env: {},
      cwd: root,
      homeDir: join(root, "home")
    });

    expect(result.config.defaultModel).toBe("sonnet");
    expect(result.config.providerId).toBe("user-provider");
    expect(result.config.models).toEqual([
      {
        id: "sonnet",
        label: "Project Sonnet",
        modelId: "project-sonnet",
        providerMode: "anthropic",
        baseURL: "http://project.example"
      },
      {
        id: "fast",
        label: "Fast",
        modelId: "gpt-fast"
      }
    ]);
    expect(result.sourceStack?.map((source) => `${source.source}:${source.format}`)).toEqual(["user:toml", "project:toml"]);
  });

  it("falls back to legacy JSON when TOML is absent", async () => {
    const root = await tempRoot();
    writeConfig(root, "home/.guga/config.json", { modelId: "legacy-user" });

    const result = readCliConfigWithSources({
      env: {},
      cwd: root,
      homeDir: join(root, "home")
    });

    expect(result.config.modelId).toBe("legacy-user");
    expect(result.sourceStack).toEqual([{
      source: "user",
      path: join(realpathSync.native(root), "home/.guga/config.json"),
      format: "json"
    }]);
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
      .toThrow(`Invalid Guga config at ${realpathSync.native(path)}`);
  });

  it("throws actionable errors for invalid TOML", async () => {
    const root = await tempRoot();
    const path = writeRaw(root, ".guga/config.toml", "defaultModel = ");

    expect(() => readCliConfigWithSources({ env: {}, cwd: root, homeDir: join(root, "home") }))
      .toThrow(CliConfigError);
    expect(() => readCliConfigWithSources({ env: {}, cwd: root, homeDir: join(root, "home") }))
      .toThrow(`Invalid Guga config at ${realpathSync.native(path)}`);
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
