import { createMockProvider, type AgentRuntimeOptions, type LocalPlugin } from "@guga-agent/core";
import { createAiSdkProviderPlugin } from "@guga-agent/core/builtins";
import { HostRuntime } from "@guga-agent/host-runtime";
import { createLocalGugaHost, type LocalGugaHost } from "@guga-agent/host-sdk";
import { createAuditExportPlugin } from "@guga-agent/plugin-audit-export";
import { FilesystemArtifactStore } from "@guga-agent/plugin-artifact-filesystem";
import { createEvalRunnerPlugin } from "@guga-agent/plugin-eval-runner";
import { createMemoryJsonlPlugin } from "@guga-agent/plugin-memory-jsonl";
import { createOpsHealthPlugin } from "@guga-agent/plugin-ops-health";
import { JsonlEventStore, JsonlSessionStore } from "@guga-agent/plugin-session-jsonl";
import {
  CODE_AGENT_PROFILE_ID,
  createCodeAgentRuntimeOptions
} from "@guga-agent/profile-code-agent";
import { DEEP_RESEARCH_PROFILE_ID } from "@guga-agent/profile-deep-research-agent";
import { REVIEW_AGENT_PROFILE_ID } from "@guga-agent/profile-review-agent";
import {
  CliConfigError,
  CliConfigPathError,
  type CliConfigWithSources,
  readCliConfigWithSources,
  selectCliModel,
  type SelectedCliModel
} from "./config";
import { GugaHomeError, type GugaHomePaths, resolveGugaHome } from "./guga-home";

export type CliProfileId = typeof CODE_AGENT_PROFILE_ID | typeof DEEP_RESEARCH_PROFILE_ID | typeof REVIEW_AGENT_PROFILE_ID;

export const DEFAULT_CLI_PROFILE_ID: CliProfileId = CODE_AGENT_PROFILE_ID;

export type CliHostFactoryOptions = {
  mock?: boolean;
  profileId?: CliProfileId;
  providerId?: string;
  modelSelector?: string;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  homeDir?: string;
  workspaceRoot?: string;
  stores?: AgentRuntimeOptions["stores"];
};

export type CliHostStorageDiagnostics = {
  home: string;
  homeSource: GugaHomePaths["homeSource"];
  projectRoot: string;
  projectKey: string;
  sessionsRoot: string;
  eventsRoot: string;
  sessionFactsRoot: string;
  artifactsRoot: string;
  memoryRoot: string;
};

export type CliHost = {
  local: LocalGugaHost;
  profileId: CliProfileId;
  config: CliConfigWithSources;
  storage: CliHostStorageDiagnostics;
  selectedModel?: SelectedCliModel;
  providerId?: string;
  modelId?: string;
};

export class CliHostFactoryError extends Error {
  readonly code: "CONFIG_ERROR" | "MODEL_NOT_FOUND" | "MODEL_REQUIRED";

  constructor(code: CliHostFactoryError["code"], message: string) {
    super(message);
    this.name = "CliHostFactoryError";
    this.code = code;
  }
}

export async function createCliHost(options: CliHostFactoryOptions = {}): Promise<CliHost> {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? options.workspaceRoot ?? process.cwd();
  let gugaHome: GugaHomePaths;
  let config: CliConfigWithSources;
  try {
    const readOptions = { env, cwd, ...(options.homeDir ? { homeDir: options.homeDir } : {}) };
    gugaHome = resolveGugaHome(readOptions);
    config = readCliConfigWithSources(readOptions);
  } catch (error) {
    if (error instanceof CliConfigError || error instanceof CliConfigPathError || error instanceof GugaHomeError) {
      throw new CliHostFactoryError("CONFIG_ERROR", error.message);
    }
    throw error;
  }

  const profileId = options.profileId ?? profileFromConfig(config.config.defaultProfile) ?? DEFAULT_CLI_PROFILE_ID;
  const runtimeOptions = createRuntimeOptions(profileId, {
    workspaceRoot: options.workspaceRoot ?? cwd,
    gugaHome,
    stores: options.stores
  });
  const selectedModel = selectCliModel(config.config, options.modelSelector, env);
  if (options.modelSelector && config.config.models?.length && !selectedModel) {
    throw new CliHostFactoryError("MODEL_NOT_FOUND", `Unknown model: ${options.modelSelector}`);
  }

  if (options.mock) {
    const hostRuntime = new HostRuntime({ runtimeOptions });
    hostRuntime.registerProvider(createMockProvider([
      ({ messages }) => ({
        type: "final",
        content: `mock: ${messages.at(-1)?.content ?? ""}`,
        usage: { totalTokens: 3 }
      })
    ]));
    const mockModelId = selectedModel?.modelId ?? options.modelSelector;
    return {
      local: await createLocalGugaHost({ hostRuntime }),
      profileId,
      config,
      storage: diagnosticsForHome(gugaHome),
      ...(selectedModel ? { selectedModel } : {}),
      providerId: options.providerId ?? "mock",
      ...(mockModelId ? { modelId: mockModelId } : {})
    };
  }

  if (!selectedModel) {
    if (options.modelSelector) {
      throw new CliHostFactoryError("MODEL_NOT_FOUND", `Unknown model: ${options.modelSelector}`);
    }
    throw new CliHostFactoryError(
    "MODEL_REQUIRED",
      "No model configured. Set GUGA_MODEL, add .guga/config.toml, or pass --mock for a deterministic local smoke."
    );
  }

  const providerId = options.providerId ?? selectedModel.providerId ?? config.config.providerId ?? "ai-sdk";
  const providerPlugin = createAiSdkProviderPlugin({
    id: providerId,
    mode: selectedModel.providerMode ?? config.config.providerMode ?? "openai",
    modelId: selectedModel.modelId ?? selectedModel.id,
    ...(selectedModel.apiKey ? { apiKey: selectedModel.apiKey } : {}),
    ...(selectedModel.baseURL ? { baseURL: selectedModel.baseURL } : {})
  });
  const hostRuntime = new HostRuntime({
    runtimeOptions: {
      ...runtimeOptions,
      model: providerPlugin
    }
  });

  return {
    local: await createLocalGugaHost({ hostRuntime }),
    profileId,
    config,
    storage: diagnosticsForHome(gugaHome),
    selectedModel,
    providerId,
    modelId: selectedModel.modelId ?? selectedModel.id
  };
}

export function isCliProfileId(value: string | undefined): value is CliProfileId {
  return value === CODE_AGENT_PROFILE_ID || value === DEEP_RESEARCH_PROFILE_ID || value === REVIEW_AGENT_PROFILE_ID;
}

function profileFromConfig(value: string | undefined): CliProfileId | undefined {
  return isCliProfileId(value) ? value : undefined;
}

function createRuntimeOptions(
  profileId: CliProfileId,
  options: { workspaceRoot: string; gugaHome: GugaHomePaths; stores?: AgentRuntimeOptions["stores"] }
): AgentRuntimeOptions {
  const stores = options.stores ?? createDefaultStores(options.gugaHome);
  if (profileId === CODE_AGENT_PROFILE_ID) {
    const runtimeOptions = createCodeAgentRuntimeOptions({
      workspaceRoot: options.workspaceRoot,
      includeOperations: true
    });
    return {
      ...runtimeOptions,
      stores,
      plugins: [...(runtimeOptions.plugins ?? []), createMemoryJsonlPlugin()]
    };
  }
  return {
    stores,
    plugins: [...createOperationalPlugins(), createMemoryJsonlPlugin()]
  };
}

function createDefaultStores(gugaHome: GugaHomePaths): NonNullable<AgentRuntimeOptions["stores"]> {
  return {
    events: new JsonlEventStore({ rootDir: gugaHome.eventsRoot }),
    sessions: new JsonlSessionStore({ rootDir: gugaHome.sessionFactsRoot }),
    artifacts: new FilesystemArtifactStore({ rootDir: gugaHome.artifactsRoot })
  };
}

function createOperationalPlugins(): LocalPlugin[] {
  return [
    createOpsHealthPlugin(),
    createAuditExportPlugin(),
    createEvalRunnerPlugin()
  ];
}

function diagnosticsForHome(gugaHome: GugaHomePaths): CliHostStorageDiagnostics {
  return {
    home: gugaHome.home,
    homeSource: gugaHome.homeSource,
    projectRoot: gugaHome.projectRoot,
    projectKey: gugaHome.projectKey,
    sessionsRoot: gugaHome.sessionsRoot,
    eventsRoot: gugaHome.eventsRoot,
    sessionFactsRoot: gugaHome.sessionFactsRoot,
    artifactsRoot: gugaHome.artifactsRoot,
    memoryRoot: gugaHome.memoryRoot
  };
}
