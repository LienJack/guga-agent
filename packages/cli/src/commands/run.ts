import { createAgentRuntime, createMockProvider } from "@guga-agent/core";
import { HostRuntime } from "@guga-agent/host-runtime";
import { createLocalGugaHost, type LocalGugaHost } from "@guga-agent/host-sdk";
import { createAuditExportPlugin } from "@guga-agent/plugin-audit-export";
import { createEvalRunnerPlugin } from "@guga-agent/plugin-eval-runner";
import { createOpsHealthPlugin } from "@guga-agent/plugin-ops-health";
import { CODE_AGENT_PROFILE_ID, createCodeAgentPlugins, createCodeAgentPermissionPolicy } from "@guga-agent/profile-code-agent";
import { DEEP_RESEARCH_PROFILE_ID } from "@guga-agent/profile-deep-research-agent";
import { REVIEW_AGENT_PROFILE_ID } from "@guga-agent/profile-review-agent";
import { createAiSdkProviderPlugin } from "@guga-agent/provider-ai-sdk";
import { readCliConfig } from "../config";
import { renderHostEvent } from "../render/events";

export type CliWriter = {
  write(chunk: string): unknown;
};

export type CliIO = {
  stdout: CliWriter;
  stderr: CliWriter;
  env?: NodeJS.ProcessEnv;
};

type RunArgs = {
  prompt: string;
  headless: boolean;
  debugEvents: boolean;
  mock: boolean;
  ops: boolean;
  profile?: CliProfileId;
  providerId?: string;
  modelId?: string;
};

type CliProfileId = typeof CODE_AGENT_PROFILE_ID | typeof DEEP_RESEARCH_PROFILE_ID | typeof REVIEW_AGENT_PROFILE_ID;

export async function runCli(argv: string[], io: CliIO): Promise<number> {
  const [command, ...rest] = argv;
  if (command !== "run") {
    io.stderr.write("usage: guga run <prompt> [--provider id] [--model id] [--profile code|deep-research|review] [--mock] [--debug-events] [--ops]\n");
    return 2;
  }
  const parsed = parseRunArgs(rest, io.env);
  if (!parsed.ok) {
    io.stderr.write(`${parsed.error}\n`);
    return 2;
  }
  return runCommand(parsed.args, io);
}

export async function runCommand(args: RunArgs, io: CliIO): Promise<number> {
  const host = await createCliHost(args, io.env);
  try {
    const session = await host.client.createSession({ title: "CLI run" });
    const run = await host.client.startRun(session.id, {
      input: args.prompt,
      ...(args.providerId || args.mock ? { providerId: args.providerId ?? "mock" } : {}),
      ...(args.modelId ? { modelId: args.modelId } : {})
    });
    const events = await host.client.listRunEvents(run.id);
    for (const event of events) {
      for (const line of renderHostEvent(event, { debug: args.debugEvents })) {
        io.stdout.write(`${line}\n`);
      }
    }
    if (run.status === "completed") {
      io.stdout.write(`${run.finalAnswer ?? ""}\n`);
      if (args.ops) {
        await printOperationalStatus(host, io);
      }
      return 0;
    }
    if (args.ops) {
      await printOperationalStatus(host, io);
    }
    io.stderr.write(`${run.error?.message ?? `Run ended with status ${run.status}`}\n`);
    return 1;
  } finally {
    await host.close();
  }
}

function parseRunArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): { ok: true; args: RunArgs } | { ok: false; error: string } {
  const config = readCliConfig(env);
  let providerId = config.providerId;
  let modelId = config.modelId;
  let headless = false;
  let debugEvents = false;
  let mock = false;
  let ops = false;
  let profile: CliProfileId | undefined;
  const promptParts: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--headless") {
      headless = true;
    } else if (arg === "--debug-events") {
      debugEvents = true;
    } else if (arg === "--mock") {
      mock = true;
    } else if (arg === "--ops") {
      ops = true;
    } else if (arg === "--profile") {
      const value = argv[index + 1];
      index += 1;
      if (!isCliProfileId(value)) {
        return { ok: false, error: `Unknown profile: ${value ?? "(missing)"}` };
      }
      profile = value;
    } else if (arg === "--provider") {
      providerId = argv[index + 1];
      index += 1;
    } else if (arg === "--model") {
      modelId = argv[index + 1];
      index += 1;
    } else if (arg?.startsWith("--")) {
      return { ok: false, error: `Unknown option: ${arg}` };
    } else if (arg) {
      promptParts.push(arg);
    }
  }

  const prompt = promptParts.join(" ").trim();
  if (prompt.length === 0) {
    return { ok: false, error: "Prompt is required" };
  }
  return {
    ok: true,
    args: {
      prompt,
      headless,
      debugEvents,
      mock,
      ops,
      ...(profile ? { profile } : {}),
      ...(providerId ? { providerId } : {}),
      ...(modelId ? { modelId } : {})
    }
  };
}

function isCliProfileId(value: string | undefined): value is CliProfileId {
  return value === CODE_AGENT_PROFILE_ID || value === DEEP_RESEARCH_PROFILE_ID || value === REVIEW_AGENT_PROFILE_ID;
}

async function createCliHost(args: RunArgs, env: NodeJS.ProcessEnv = process.env): Promise<LocalGugaHost> {
  const operationalPlugins = [
    createOpsHealthPlugin(),
    createAuditExportPlugin(),
    createEvalRunnerPlugin()
  ];
  const profilePlugins = args.profile === CODE_AGENT_PROFILE_ID
    ? createCodeAgentPlugins({ workspaceRoot: process.cwd(), includeOperations: true })
    : operationalPlugins;
  const permissions = args.profile === CODE_AGENT_PROFILE_ID
    ? createCodeAgentPermissionPolicy()
    : undefined;

  if (!args.mock) {
    const config = readCliConfig(env);
    const modelId = args.modelId ?? config.modelId;
    if (!modelId) {
      return createLocalGugaHost();
    }
    const providerPlugin = createAiSdkProviderPlugin({
      id: args.providerId ?? config.providerId ?? "ai-sdk",
      mode: config.providerMode ?? "openai",
      modelId,
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
      ...(config.baseURL ? { baseURL: config.baseURL } : {})
    });
    return createLocalGugaHost({
      hostRuntime: new HostRuntime({
        runtime: createAgentRuntime({
          model: providerPlugin,
          plugins: profilePlugins,
          ...(permissions ? { permissions } : {})
        })
      })
    });
  }

  const runtime = createAgentRuntime({
    plugins: profilePlugins,
    ...(permissions ? { permissions } : {})
  });
  runtime.registerProvider(createMockProvider([
    ({ messages }) => ({
      type: "final",
      content: `mock: ${messages.at(-1)?.content ?? ""}`,
      usage: { totalTokens: 3 }
    })
  ]));
  return createLocalGugaHost({
    hostRuntime: new HostRuntime({ runtime })
  });
}

async function printOperationalStatus(host: LocalGugaHost, io: CliIO): Promise<void> {
  const status = await host.client.getOperationalStatus();
  const operationCount = status.capabilities.filter((capability) => capability.type === "operation").length;
  const providerCount = status.health.length;
  const runCount = status.audit.length;
  const totalTokens = status.metrics.counters["usage.total_tokens"] ?? 0;
  io.stdout.write(`operations: providers=${providerCount} operations=${operationCount} runs=${runCount} totalTokens=${totalTokens}\n`);
  for (const diagnostic of status.diagnostics.filter((candidate) => candidate.severity !== "info")) {
    io.stdout.write(`operation diagnostic: ${diagnostic.code}: ${diagnostic.message}\n`);
  }
}
