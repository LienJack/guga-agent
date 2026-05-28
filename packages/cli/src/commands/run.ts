import type { HostEvent } from "@guga-agent/host-protocol";
import { CliConfigError, listCliModels, readCliConfig, selectCliModel } from "../config";
import {
  CliHostFactoryError,
  createCliHost,
  isCliProfileId,
  type CliHost,
  type CliProfileId
} from "../host-factory";
import { renderHostEvent } from "../render/events";
import { createFallbackTerminalAdapter } from "../tui/terminal";
import { executeWorkbenchCommand, parseWorkbenchInput } from "../workbench/commands";

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
  let selectedModel = args.modelId;
  let selectedProfile = args.profile;
  const sessionTitle = "CLI interactive";
  let host = await createWorkbenchHost(args, selectedModel, selectedProfile, io.env);
  let session = await host.local.client.createSession({ title: sessionTitle });
  const lineQueue = createLineQueue(io.stdin);

  io.stdout.write("Guga CLI interactive mode\n");
  io.stdout.write("Type a task and press Enter. Commands: /help, /models, /model <id>, /profile <id>, /exit\n");
  io.stdout.write(`model: ${host.selectedModel?.id ?? host.modelId ?? currentConfigModelLabel(io.env)} profile: ${host.profileId}\n`);
  io.stdout.write(`config: ${describeConfigSource(host)}\n`);
  io.stdout.write(`home: ${host.storage.home} project: ${host.storage.projectKey}\n`);
  io.stdout.write("> ");

  try {
    while (true) {
      const nextLine = await lineQueue.take().promise;
      if (nextLine.done) {
        return 0;
      }
      const rawLine = nextLine.value;
      const line = rawLine.trim();
      if (line.length === 0) {
        io.stdout.write("> ");
        continue;
      }
      const intent = parseWorkbenchInput(line);
      if (intent.kind === "slash") {
        const commandResult = await executeWorkbenchCommand(intent, {
          client: host.local.client,
          config: host.config.config,
          storage: host.storage,
          ...(io.env ? { env: io.env } : {}),
          activeSessionId: session.id,
          ...(session.activeBranchId ? { activeBranchId: session.activeBranchId } : {})
        });
        if (!commandResult.ok) {
          io.stderr.write(`${commandResult.error}\n`);
          if (commandResult.suggestions.length > 0) {
            io.stderr.write(`try: ${commandResult.suggestions.join(", ")}\n`);
          }
          io.stdout.write("> ");
          continue;
        }
        if (commandResult.action === "exit") {
          return 0;
        }
        if (commandResult.action === "help") {
          printInteractiveHelp(io);
        } else if (commandResult.action === "select-model") {
          selectedModel = intent.args.trim();
          await host.local.close();
          host = await createWorkbenchHost(args, selectedModel, selectedProfile, io.env);
          session = await host.local.client.createSession({ title: sessionTitle });
          io.stdout.write(`${commandResult.message}\n`);
        } else if (commandResult.action === "select-profile") {
          const nextProfile = intent.args.trim();
          selectedProfile = isCliProfileId(nextProfile) ? nextProfile : undefined;
          await host.local.close();
          host = await createWorkbenchHost(args, selectedModel, selectedProfile, io.env);
          session = await host.local.client.createSession({ title: sessionTitle });
          io.stdout.write(`profile switched to ${host.profileId}\n`);
        } else if (
          commandResult.action === "new-session"
          || commandResult.action === "resume-session"
          || commandResult.action === "fork-session"
        ) {
          session = "data" in commandResult && isSessionSummary(commandResult.data)
            ? commandResult.data.session
            : session;
          io.stdout.write(`${commandResult.message}\n`);
        } else if (commandResult.message.length > 0) {
          io.stdout.write(`${commandResult.message}\n`);
        }
        io.stdout.write("> ");
        continue;
      }

      const run = await host.local.client.startRun(session.id, {
        input: line,
        ...(host.providerId ? { providerId: host.providerId } : {}),
        ...(host.modelId ? { modelId: host.modelId } : {})
      });
      await streamRunWithInteractiveInput(host, run.id, lineQueue, args, io);
      if (args.ops) {
        await printOperationalStatus(host, io);
      }
      io.stdout.write("> ");
    }
    return 0;
  } finally {
    await host.local.close();
  }
}

async function streamRunWithInteractiveInput(
  host: CliHost,
  runId: string,
  lineQueue: LineQueue,
  args: InteractiveArgs,
  io: CliIO
): Promise<void> {
  const eventIterator = host.local.client.streamRunEvents(runId)[Symbol.asyncIterator]();
  let eventNext = eventIterator.next();
  let lineTake: LineTake | undefined = lineQueue.take();
  let pendingPermissionId: string | undefined;
  try {
    while (true) {
      type StreamRace =
        | { kind: "event"; value: IteratorResult<HostEvent> }
        | { kind: "line"; value: IteratorResult<string> };
      const waits: Array<Promise<StreamRace>> = [
        eventNext.then((value) => ({ kind: "event", value }))
      ];
      if (lineTake) {
        waits.push(lineTake.promise.then((value) => ({ kind: "line" as const, value })));
      }
      const result = await Promise.race(waits);
      if (result.kind === "event") {
        if (result.value.done) {
          lineTake?.cancel();
          return;
        }
        const event = result.value.value;
        if (event.type === "permission.requested") {
          pendingPermissionId = event.requestId;
        }
        for (const rendered of renderHostEvent(event, { debug: args.debugEvents })) {
          io.stdout.write(`${rendered}\n`);
        }
        if (event.type === "run.completed" || event.type === "run.failed" || event.type === "run.cancelled") {
          lineTake?.cancel();
          return;
        }
        eventNext = eventIterator.next();
        continue;
      }

      if (result.value.done) {
        lineTake = undefined;
        continue;
      }
      await handleActiveRunInput(host, runId, pendingPermissionId, result.value.value.trim(), io);
      lineTake = lineQueue.take();
    }
  } finally {
    await eventIterator.return?.();
    lineTake?.cancel();
  }
}

async function handleActiveRunInput(
  host: CliHost,
  runId: string,
  pendingPermissionId: string | undefined,
  line: string,
  io: CliIO
): Promise<void> {
  if (line.length === 0) {
    return;
  }
  if (line === "/abort" || line === "/cancel") {
    await host.local.client.abortRun(runId);
    io.stdout.write("abort requested\n");
    return;
  }
  const permission = line.match(/^\/?(allow|deny)(?:\s+(\S+))?$/);
  if (permission) {
    const decision = permission[1] as "allow" | "deny";
    const permissionId = permission[2] ?? pendingPermissionId;
    if (!permissionId) {
      io.stderr.write("No pending permission to resolve\n");
      return;
    }
    await host.local.client.respondPermission(permissionId, { decision, remember: "once" });
    io.stdout.write(`permission ${decision} sent\n`);
    return;
  }
  if (line.startsWith("/")) {
    const result = await executeWorkbenchCommand(parseWorkbenchInput(line), {
      client: host.local.client,
      config: host.config.config,
      storage: host.storage,
      activeRunId: runId
    });
    if (result.ok) {
      io.stdout.write(`${result.message}\n`);
    } else {
      io.stderr.write(`${result.error}\n`);
    }
    return;
  }
  await host.local.client.sendRunInput(runId, { mode: "follow_up", text: line });
  io.stdout.write("queued follow-up\n");
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

async function* readLines(input: NodeJS.ReadableStream): AsyncIterable<string> {
  let buffer = "";
  input.setEncoding("utf8");
  for await (const chunk of input) {
    buffer += String(chunk);
    let newlineIndex = buffer.search(/\r?\n/);
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(buffer[newlineIndex] === "\r" && buffer[newlineIndex + 1] === "\n" ? newlineIndex + 2 : newlineIndex + 1);
      yield line;
      newlineIndex = buffer.search(/\r?\n/);
    }
  }
  if (buffer.length > 0) {
    yield buffer;
  }
}

type LineTake = {
  promise: Promise<IteratorResult<string>>;
  cancel(): void;
};

type LineQueue = {
  take(): LineTake;
  doneTake(): LineTake;
};

function createLineQueue(input: NodeJS.ReadableStream): LineQueue {
  const lines: string[] = [];
  const waiters: Array<(value: IteratorResult<string>) => void> = [];
  let done = false;

  void (async () => {
    try {
      for await (const line of readLines(input)) {
        const waiter = waiters.shift();
        if (waiter) {
          waiter({ done: false, value: line });
        } else {
          lines.push(line);
        }
      }
    } finally {
      done = true;
      for (const waiter of waiters.splice(0)) {
        waiter({ done: true, value: undefined });
      }
    }
  })();

  return {
    take() {
      if (lines.length > 0) {
        return resolvedTake({ done: false, value: lines.shift() ?? "" });
      }
      if (done) {
        return this.doneTake();
      }
      let active = true;
      let resolver: (value: IteratorResult<string>) => void = () => undefined;
      const promise = new Promise<IteratorResult<string>>((resolve) => {
        resolver = resolve;
        waiters.push(resolve);
      });
      return {
        promise,
        cancel() {
          if (!active) {
            return;
          }
          active = false;
          const index = waiters.indexOf(resolver);
          if (index !== -1) {
            waiters.splice(index, 1);
          }
        }
      };
    },
    doneTake() {
      return resolvedTake({ done: true, value: undefined });
    }
  };
}

function resolvedTake(value: IteratorResult<string>): LineTake {
  return {
    promise: Promise.resolve(value),
    cancel() {
      return undefined;
    }
  };
}

function isSessionSummary(value: unknown): value is { session: Awaited<ReturnType<CliHost["local"]["client"]["createSession"]>> } {
  return !!value && typeof value === "object" && "session" in value;
}

function printInteractiveHelp(io: CliIO): void {
  io.stdout.write([
    "Commands:",
    "  /models              list configured models",
    "  /model <id>          switch model and start a fresh host session",
    "  /profile <id>        switch profile: default|code|deep-research|review",
    "  /exit                leave interactive mode",
    ""
  ].join("\n"));
}

function printConfiguredModels(io: CliIO): void {
  const config = readCliConfig(io.env);
  const models = listCliModels(config);
  if (models.length === 0) {
    io.stdout.write("configured model: (none)\n");
    return;
  }
  for (const model of models) {
    const marker = model.id === (config.defaultModel ?? config.modelId) ? "*" : " ";
    io.stdout.write(`${marker} ${model.id} -> ${model.modelId ?? model.id}${model.label ? ` (${model.label})` : ""}\n`);
  }
}

function currentConfigModelLabel(env: NodeJS.ProcessEnv | undefined): string {
  const config = readCliConfig(env);
  const selected = selectCliModel(config, undefined, env);
  return selected?.id ?? selected?.modelId ?? "(none)";
}

async function printOperationalStatus(host: CliHost, io: CliIO): Promise<void> {
  const status = await host.local.client.getOperationalStatus();
  const operationCount = status.capabilities.filter((capability) => capability.type === "operation").length;
  const providerCount = status.health.length;
  const runCount = status.audit.length;
  const totalTokens = status.metrics.counters["usage.total_tokens"] ?? 0;
  io.stdout.write(`operations: providers=${providerCount} operations=${operationCount} runs=${runCount} totalTokens=${totalTokens}\n`);
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

async function createWorkbenchHost(
  args: InteractiveArgs,
  selectedModel: string | undefined,
  selectedProfile: CliProfileId | undefined,
  env: NodeJS.ProcessEnv | undefined
): Promise<CliHost> {
  return createCliHost({
    mock: args.mock,
    ...(selectedProfile ? { profileId: selectedProfile } : {}),
    ...(args.providerId ? { providerId: args.providerId } : {}),
    ...(selectedModel ? { modelSelector: selectedModel } : {}),
    ...(env ? { env } : {})
  });
}

function describeConfigSource(host: CliHost): string {
  if (host.config.sourceStack?.length) {
    return host.config.sourceStack
      .map((source) => `${source.source}:${source.path}`)
      .join(" < ");
  }
  if (host.config.filePath) {
    return `${host.config.fileSource ?? "config"}:${host.config.filePath}`;
  }
  if (host.config.sources.modelId === "env" || host.config.sources.defaultModel === "env") {
    return "env";
  }
  if (host.selectedModel || host.modelId) {
    return "default";
  }
  return "none";
}

function handleCliError(error: unknown, io: CliIO): number {
  if (error instanceof CliHostFactoryError || error instanceof CliConfigError) {
    io.stderr.write(`${error.message}\n`);
    return 2;
  }
  throw error;
}

function cliUsage(): string {
  return [
    "usage: guga [--model id] [--profile code|deep-research|review] [--mock]",
    "       guga run <prompt> [--provider id] [--model id] [--profile code|deep-research|review] [--mock] [--debug-events] [--ops]",
    "       guga -p <prompt> [--provider id] [--model id] [--profile code|deep-research|review] [--mock]",
    "       guga --list-models",
    ""
  ].join("\n");
}
