import {
  type AgentRuntimeOptions,
  type LocalPlugin,
  type ModelMetadata,
  type Provider,
  type ProviderRouterPolicy
} from "@guga-agent/core";
import { createAiSdkProvider } from "@guga-agent/core/builtins";
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
  createCodeTaskHostRuntime,
  createCodeAgentRuntimeOptions
} from "@guga-agent/profile-code-agent";
import { DEEP_RESEARCH_PROFILE_ID } from "@guga-agent/profile-deep-research-agent";
import { REVIEW_AGENT_PROFILE_ID } from "@guga-agent/profile-review-agent";
import {
  CliConfigError,
  CliConfigPathError,
  type CliConfigWithSources,
  readCliConfigWithSources,
  type SelectedCliModel
} from "./config";
import { GugaHomeError, type GugaHomePaths, resolveGugaHome } from "./guga-home";
import { resolveModelRegistry, selectResolvedModel, type ResolvedModelView } from "./model-registry";
import { providerRuntimeAuthForSelection } from "./provider-runtime-auth";

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
  credentialsRoot: string;
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
  const workspaceRoot = options.workspaceRoot ?? cwd;
  const runtimeOptions = createRuntimeOptions(profileId, {
    workspaceRoot,
    gugaHome,
    stores: options.stores
  });
  const modelView = resolveModelRegistry({
    config: config.config,
    env,
    credentialRoot: gugaHome.home,
    ...(options.providerId ? { providerId: options.providerId } : {}),
    ...(options.modelSelector ? { selector: options.modelSelector } : {})
  });
  const selectedModel = selectResolvedModel({
    config: config.config,
    env,
    credentialRoot: gugaHome.home,
    ...(options.providerId ? { providerId: options.providerId } : {}),
    ...(options.modelSelector ? { selector: options.modelSelector } : {})
  });
  if (!options.mock && options.modelSelector && modelView.length > 0 && !selectedModel) {
    throw new CliHostFactoryError("MODEL_NOT_FOUND", `Unknown model: ${options.modelSelector}`);
  }

  if (options.mock) {
    const hostRuntime = new HostRuntime({
      runtimeOptions,
      profileId,
      cwd: workspaceRoot,
      ...(profileId === CODE_AGENT_PROFILE_ID
        ? { codeTasks: createCodeTaskHostRuntime({ profileId, cwd: workspaceRoot }) }
        : {})
    });
    hostRuntime.registerProvider(createRepeatingMockProvider());
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
      "No model configured. Run `guga init --model <id>`, set GUGA_MODEL, add .guga/config.toml, or pass --mock for a deterministic local smoke."
    );
  }

  const providerId = options.providerId ?? selectedModel.providerId;
  const providerPlugins = createProviderPlugins(modelView, config, env, gugaHome.home);
  const routerPolicy = createRouterPolicy(selectedModel.availability, modelView, config.config.fallbackModels);
  const hostRuntime = new HostRuntime({
    profileId,
    cwd: workspaceRoot,
    ...(profileId === CODE_AGENT_PROFILE_ID
      ? { codeTasks: createCodeTaskHostRuntime({ profileId, cwd: workspaceRoot }) }
      : {}),
    runtimeOptions: {
      ...runtimeOptions,
      plugins: [...(runtimeOptions.plugins ?? []), ...providerPlugins],
      routerPolicy
    }
  });

  return {
    local: await createLocalGugaHost({ hostRuntime }),
    profileId,
    config,
    storage: diagnosticsForHome(gugaHome),
    selectedModel,
    ...(providerId ? { providerId } : {}),
    modelId: selectedModel.modelId ?? selectedModel.id
  };
}

function createRepeatingMockProvider(): Provider {
  return {
    id: "mock",
    generate({ messages }) {
      const last = messages.at(-1)?.content ?? "";
      return {
        type: "final",
        content: last.includes("code_task_plan")
          ? `mock: planner\n\n\`\`\`code_task_plan\n${JSON.stringify({
            summary: "Mock implementation plan",
            files: [],
            checks: [{ command: "pnpm test", required: true, reason: "mock package test" }],
            assumptions: [],
            risks: [],
            ledgerItems: [{ id: "item-1", title: "Complete mock code task", changedFiles: [], risks: [] }]
          }, null, 2)}\n\`\`\``
          : `mock: ${last}`,
        usage: { totalTokens: 3 }
      };
    }
  }
}

function createProviderPlugins(
  modelView: ResolvedModelView[],
  config: CliConfigWithSources,
  env: NodeJS.ProcessEnv,
  credentialRoot: string
): LocalPlugin[] {
  const availableModels = modelView.filter((model) => model.available);
  const byProvider = new Map<string, ResolvedModelView[]>();
  for (const model of availableModels) {
    byProvider.set(model.providerId, [...(byProvider.get(model.providerId) ?? []), model]);
  }
  return [...byProvider.entries()].map(([providerId, models]) => {
    const firstModel = models[0] as ResolvedModelView;
    const selected = selectResolvedModel({
      config: config.config,
      selector: firstModel.id,
      env,
      credentialRoot
    });
    const provider = createAiSdkProvider({
      id: providerId,
      mode: selected?.providerMode ?? firstModel.providerMode ?? "openai",
      modelId: selected?.modelId ?? firstModel.modelId,
      ...providerRuntimeAuthForSelection(selected),
      ...(selected?.baseURL ? { baseURL: selected.baseURL } : {})
    });
    const metadata = models.map(modelMetadataForView);
    return {
      id: providerId,
      name: `AI SDK Provider Bridge (${providerId})`,
      init(context) {
        context.registerProvider(provider);
        for (const model of metadata) {
          context.registerModel?.(model);
        }
      }
    };
  });
}

function createRouterPolicy(
  selected: ResolvedModelView,
  modelView: ResolvedModelView[],
  fallbackAliases: string[] | undefined
): ProviderRouterPolicy {
  const primary = modelIdentifier(selected);
  const fallbackCandidates = (fallbackAliases ?? [])
    .map((alias) => modelView.find((model) => model.available && (model.id === alias || model.modelId === alias)))
    .filter((model): model is ResolvedModelView => Boolean(model))
    .map(modelIdentifier);
  const primaryCandidates = [primary, ...fallbackCandidates.filter((candidate) =>
    candidate.providerId !== primary.providerId || candidate.modelId !== primary.modelId
  )];
  const purposePolicies = new Map<string, ResolvedModelView[]>();
  for (const model of modelView.filter((candidate) => candidate.available && candidate.purpose && candidate.purpose !== "primary")) {
    purposePolicies.set(model.purpose as string, [...(purposePolicies.get(model.purpose as string) ?? []), model]);
  }
  return {
    primary,
    purposes: [
      { purpose: "primary", candidates: primaryCandidates },
      ...[...purposePolicies.entries()].map(([purpose, models]) => ({
        purpose,
        candidates: models.map(modelIdentifier)
      }))
    ]
  };
}

function modelIdentifier(model: ResolvedModelView): { providerId: string; modelId: string } {
  return {
    providerId: model.providerId,
    modelId: model.modelId
  };
}

function modelMetadataForView(model: ResolvedModelView): ModelMetadata {
  return {
    providerId: model.providerId,
    modelId: model.modelId,
    ...(model.displayName ? { displayName: model.displayName } : {}),
    ...(model.capabilities ? { capabilities: model.capabilities } : {}),
    ...(model.purpose ? { purposes: [model.purpose] } : {})
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
    credentialsRoot: gugaHome.credentialsRoot,
    memoryRoot: gugaHome.memoryRoot
  };
}
