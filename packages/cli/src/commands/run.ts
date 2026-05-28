import { CliConfigError, initCliConfig, readCliConfig, type CliProviderMode } from "../config";
import {
  CliHostFactoryError,
  createCliHost,
  isCliProfileId,
  type CliHost,
  type CliProfileId
} from "../host-factory";
import { resolveModelRegistry, unavailableReasonText } from "../model-registry";
import { loginProvider } from "../provider-login";
import { renderHostEvent } from "../render/events";
import { createFallbackTerminalAdapter } from "../tui/terminal";

export type CliWriter = {
  isTTY?: boolean;
  write(chunk: string): unknown;
};

export type CliIO = {
  stdout: CliWriter;
  stderr: CliWriter;
  stdin?: NodeJS.ReadableStream & { isTTY?: boolean };
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

type InteractiveArgs = Omit<RunArgs, "prompt" | "headless" | "ops"> & {
  ops: boolean;
};

type InitArgs = {
  scope: "user" | "project";
  force: boolean;
  providerId?: string;
  providerMode?: CliProviderMode;
  modelId?: string;
  baseURL?: string;
  apiKeyEnv?: string;
};

type LoginArgs = {
  providerId: string;
  mode?: CliProviderMode;
  apiKey?: string;
  apiKeyEnv?: string;
  staticSecret: boolean;
  modelId?: string;
};

export async function runCli(argv: string[], io: CliIO): Promise<number> {
  try {
    const [command, ...rest] = argv;
    if (command === "--help" || command === "-h") {
      io.stdout.write(cliUsage());
      return 0;
    }
    if (command === "--list-models") {
      return listModelsCommand(io);
    }
    if (command === "init") {
      const parsed = parseInitArgs(rest);
      if (!parsed.ok) {
        io.stderr.write(`${parsed.error}\n`);
        return 2;
      }
      return initCommand(parsed.args, io);
    }
    if (command === "login") {
      const parsed = parseLoginArgs(rest);
      if (!parsed.ok) {
        io.stderr.write(`${parsed.error}\n`);
        return 2;
      }
      return loginCommand(parsed.args, io);
    }
    if (command === "-p") {
      const parsed = parseRunArgs(rest);
      if (!parsed.ok) {
        io.stderr.write(`${parsed.error}\n`);
        return 2;
      }
      return await runCommand({ ...parsed.args, headless: true }, io);
    }
    if (!command || command.startsWith("--") || command === "chat" || command === "interactive") {
      const parsed = parseInteractiveArgs(command && !command.startsWith("--") ? rest : argv);
      if (!parsed.ok) {
        io.stderr.write(`${parsed.error}\n`);
        return 2;
      }
      return await runInteractiveCommand(parsed.args, io);
    }
    if (command !== "run") {
      io.stderr.write(cliUsage());
      return 2;
    }
    if (rest[0] === "--list-models") {
      return listModelsCommand(io);
    }
    const parsed = parseRunArgs(rest);
    if (!parsed.ok) {
      io.stderr.write(`${parsed.error}\n`);
      return 2;
    }
    return await runCommand(parsed.args, io);
  } catch (error) {
    return handleCliError(error, io);
  }
}

export async function runInteractiveCommand(args: InteractiveArgs, io: CliIO): Promise<number> {
  if (!io.stdin || io.stdin.isTTY !== true || io.stdout.isTTY !== true) {
    io.stderr.write(`${createFallbackTerminalAdapter({ isTTY: false }).nonTtyMessage("guga")}\n`);
    return 2;
  }
  const { launchInkWorkbench } = await import("../ink-workbench/launch");
  return launchInkWorkbench({ args, io });
}

export async function runCommand(args: RunArgs, io: CliIO): Promise<number> {
  const host = await createCliHost({
    mock: args.mock,
    ...(args.profile ? { profileId: args.profile } : {}),
    ...(args.providerId ? { providerId: args.providerId } : {}),
    ...(args.modelId ? { modelSelector: args.modelId } : {}),
    ...(io.env ? { env: io.env } : {})
  });
  try {
    const session = await host.local.client.createSession({ title: "CLI run" });
    const run = await host.local.client.startRun(session.id, {
      input: args.prompt,
      ...(host.providerId ? { providerId: host.providerId } : {}),
      ...(host.modelId ? { modelId: host.modelId } : {})
    });
    let renderedAssistantText = false;
    for await (const event of host.local.client.streamRunEvents(run.id)) {
      if (event.type === "message.delta" && !args.debugEvents) {
        renderedAssistantText = true;
      }
      for (const line of renderHostEvent(event, { debug: args.debugEvents })) {
        io.stdout.write(`${line}\n`);
      }
    }
    const finalRun = await host.local.client.getRun(run.id);
    if (finalRun.status === "completed") {
      if (!renderedAssistantText) {
        io.stdout.write(`${finalRun.finalAnswer ?? ""}\n`);
      }
      if (args.ops) {
        await printOperationalStatus(host, io);
      }
      return 0;
    }
    if (args.ops) {
      await printOperationalStatus(host, io);
    }
    io.stderr.write(`${finalRun.error?.message ?? `Run ended with status ${finalRun.status}`}\n`);
    return 1;
  } finally {
    await host.local.close();
  }
}

function parseRunArgs(argv: string[]): { ok: true; args: RunArgs } | { ok: false; error: string } {
  let providerId: string | undefined;
  let modelId: string | undefined;
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
      const value = argv[index + 1];
      index += 1;
      if (!value) {
        return { ok: false, error: "--provider requires a value" };
      }
      providerId = value;
    } else if (arg === "--model") {
      const value = argv[index + 1];
      index += 1;
      if (!value) {
        return { ok: false, error: "--model requires a value" };
      }
      modelId = value;
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

function parseInteractiveArgs(argv: string[]): { ok: true; args: InteractiveArgs } | { ok: false; error: string } {
  const parsed = parseRunArgs([...argv, "__interactive_placeholder__"]);
  if (!parsed.ok) {
    return parsed;
  }
  const { prompt: _prompt, headless: _headless, ...args } = parsed.args;
  return { ok: true, args };
}

function parseInitArgs(argv: string[]): { ok: true; args: InitArgs } | { ok: false; error: string } {
  let scope: "user" | "project" = "user";
  let force = false;
  let providerId: string | undefined;
  let providerMode: CliProviderMode | undefined;
  let modelId: string | undefined;
  let baseURL: string | undefined;
  let apiKeyEnv: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--user") {
      scope = "user";
    } else if (arg === "--project") {
      scope = "project";
    } else if (arg === "--force") {
      force = true;
    } else if (arg === "--provider") {
      const value = argv[index + 1];
      index += 1;
      if (!value) {
        return { ok: false, error: "--provider requires a value" };
      }
      providerId = value;
    } else if (arg === "--provider-mode") {
      const value = argv[index + 1];
      index += 1;
      if (!isCliProviderMode(value)) {
        return { ok: false, error: `Unknown provider mode: ${value ?? "(missing)"}` };
      }
      providerMode = value;
    } else if (arg === "--model") {
      const value = argv[index + 1];
      index += 1;
      if (!value) {
        return { ok: false, error: "--model requires a value" };
      }
      modelId = value;
    } else if (arg === "--base-url") {
      const value = argv[index + 1];
      index += 1;
      if (!value) {
        return { ok: false, error: "--base-url requires a value" };
      }
      baseURL = value;
    } else if (arg === "--api-key-env") {
      const value = argv[index + 1];
      index += 1;
      if (!value) {
        return { ok: false, error: "--api-key-env requires a value" };
      }
      apiKeyEnv = value;
    } else if (arg?.startsWith("--")) {
      return { ok: false, error: `Unknown option: ${arg}` };
    } else if (arg) {
      return { ok: false, error: `Unknown argument: ${arg}` };
    }
  }

  return {
    ok: true,
    args: {
      scope,
      force,
      ...(providerId ? { providerId } : {}),
      ...(providerMode ? { providerMode } : {}),
      ...(modelId ? { modelId } : {}),
      ...(baseURL ? { baseURL } : {}),
      ...(apiKeyEnv ? { apiKeyEnv } : {})
    }
  };
}

function parseLoginArgs(argv: string[]): { ok: true; args: LoginArgs } | { ok: false; error: string } {
  const [providerId, ...rest] = argv;
  if (!providerId || providerId.startsWith("--")) {
    return { ok: false, error: "login requires a provider id" };
  }
  let mode: CliProviderMode | undefined;
  let apiKey: string | undefined;
  let apiKeyEnv: string | undefined;
  let modelId: string | undefined;
  let staticSecret = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--mode" || arg === "--provider-mode") {
      const value = rest[index + 1];
      index += 1;
      if (!isCliProviderMode(value)) {
        return { ok: false, error: `Unknown provider mode: ${value ?? "(missing)"}` };
      }
      mode = value;
    } else if (arg === "--api-key") {
      const value = rest[index + 1];
      index += 1;
      if (!value) {
        return { ok: false, error: "--api-key requires a value" };
      }
      apiKey = value;
    } else if (arg === "--api-key-env") {
      const value = rest[index + 1];
      index += 1;
      if (!value) {
        return { ok: false, error: "--api-key-env requires a value" };
      }
      apiKeyEnv = value;
    } else if (arg === "--model") {
      const value = rest[index + 1];
      index += 1;
      if (!value) {
        return { ok: false, error: "--model requires a value" };
      }
      modelId = value;
    } else if (arg === "--static") {
      staticSecret = true;
    } else if (arg?.startsWith("--")) {
      return { ok: false, error: `Unknown option: ${arg}` };
    } else if (arg) {
      return { ok: false, error: `Unknown argument: ${arg}` };
    }
  }

  return {
    ok: true,
    args: {
      providerId,
      staticSecret,
      ...(mode ? { mode } : {}),
      ...(apiKey ? { apiKey } : {}),
      ...(apiKeyEnv ? { apiKeyEnv } : {}),
      ...(modelId ? { modelId } : {})
    }
  };
}

function printConfiguredModels(io: CliIO): void {
  const config = readCliConfig(io.env);
  const models = resolveModelRegistry({
    config,
    ...(io.env ? { env: io.env } : {})
  });
  if (models.length === 0) {
    io.stdout.write("configured model: (none)\n");
    return;
  }
  for (const model of models) {
    const marker = model.isDefault ? "*" : " ";
    const availability = model.available ? "" : ` [unavailable: ${unavailableReasonText(model.unavailableReasons)}]`;
    io.stdout.write(`${marker} ${model.id} -> ${model.modelId}${model.label ? ` (${model.label})` : ""}${availability}\n`);
  }
}

async function printOperationalStatus(host: CliHost, io: CliIO): Promise<void> {
  const status = await host.local.client.getOperationalStatus();
  const operationCount = status.capabilities.filter((capability) => capability.type === "operation").length;
  const providerCount = status.health.length;
  const runCount = status.audit.length;
  const totalTokens = status.metrics.counters["usage.total_tokens"] ?? 0;
  io.stdout.write(`operations: providers=${providerCount} operations=${operationCount} runs=${runCount} totalTokens=${totalTokens}\n`);
  io.stdout.write(`model: provider=${host.providerId ?? "(unknown)"} model=${host.modelId ?? "(unknown)"}\n`);
  io.stdout.write(`guga-home: ${host.storage.home}\n`);
  io.stdout.write(`storage: sessions=${host.storage.sessionsRoot} artifacts=${host.storage.artifactsRoot} memory=${host.storage.memoryRoot}\n`);
  for (const diagnostic of status.diagnostics.filter((candidate) => candidate.severity !== "info")) {
    io.stdout.write(`operation diagnostic: ${diagnostic.code}: ${diagnostic.message}\n`);
  }
}

function listModelsCommand(io: CliIO): number {
  printConfiguredModels(io);
  return 0;
}

function initCommand(args: InitArgs, io: CliIO): number {
  const result = initCliConfig({
    scope: args.scope,
    force: args.force,
    ...(io.env ? { env: io.env } : {}),
    ...(args.providerId ? { providerId: args.providerId } : {}),
    ...(args.providerMode ? { providerMode: args.providerMode } : {}),
    ...(args.modelId ? { modelId: args.modelId } : {}),
    ...(args.baseURL ? { baseURL: args.baseURL } : {}),
    ...(args.apiKeyEnv ? { apiKeyEnv: args.apiKeyEnv } : {})
  });
  const model = result.config.models?.[0]?.modelId ?? result.config.modelId ?? "(none)";
  io.stdout.write(`${result.created ? "Created" : "Existing"} Guga config: ${result.path}\n`);
  io.stdout.write(`model: ${model}\n`);
  if (result.config.apiKeyEnv) {
    io.stdout.write(`api key env: ${result.config.apiKeyEnv}\n`);
  }
  if (!result.created) {
    io.stdout.write("Use --force to overwrite it.\n");
  }
  return 0;
}

function loginCommand(args: LoginArgs, io: CliIO): number {
  if (!args.apiKey && !args.apiKeyEnv) {
    io.stderr.write("login requires --api-key or --api-key-env; interactive secret prompts are not available in this environment\n");
    return 2;
  }
  const result = loginProvider({
    providerId: args.providerId,
    staticSecret: args.staticSecret,
    ...(args.mode ? { mode: args.mode } : {}),
    ...(args.apiKey ? { apiKey: args.apiKey } : {}),
    ...(args.apiKeyEnv ? { apiKeyEnv: args.apiKeyEnv } : {}),
    ...(args.modelId ? { modelId: args.modelId } : {}),
    ...(io.env ? { env: io.env } : {})
  });
  io.stdout.write(`configured provider ${result.providerId}: ${result.configPath}\n`);
  if (result.credentialPath) {
    io.stdout.write(`credential: ${result.credentialPath}\n`);
  }
  for (const warning of result.warnings) {
    io.stderr.write(`${warning}\n`);
  }
  return 0;
}

function handleCliError(error: unknown, io: CliIO): number {
  if (error instanceof CliHostFactoryError || error instanceof CliConfigError) {
    io.stderr.write(`${error.message}\n`);
    return 2;
  }
  throw error;
}

function isCliProviderMode(value: string | undefined): value is CliProviderMode {
  return value === "gateway"
    || value === "openai-compatible"
    || value === "openai"
    || value === "anthropic";
}

function cliUsage(): string {
  return [
    "usage: guga [--model id] [--profile code|deep-research|review] [--mock]",
    "       guga init [--user|--project] [--model id] [--provider-mode openai|anthropic|openai-compatible|gateway] [--force]",
    "       guga login <provider> [--api-key key|--api-key-env VAR] [--mode openai|anthropic|openai-compatible|gateway] [--model id] [--static]",
    "       guga run <prompt> [--provider id] [--model id] [--profile code|deep-research|review] [--mock] [--debug-events] [--ops]",
    "       guga -p <prompt> [--provider id] [--model id] [--profile code|deep-research|review] [--mock]",
    "       guga --list-models",
    ""
  ].join("\n");
}
