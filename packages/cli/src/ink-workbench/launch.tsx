import React from "react";
import { render } from "ink";
import { CliConfigError, readCliConfig } from "../config";
import { CliHostFactoryError, createCliHost, type CliHost } from "../host-factory";
import { selectResolvedModel } from "../model-registry";
import { BRACKETED_PASTE_DISABLE, BRACKETED_PASTE_ENABLE } from "../tui/keys";
import { WORKBENCH_SLASH_COMMANDS } from "../workbench/commands";
import { InkWorkbenchApp } from "./app";
import { WorkbenchController } from "./controller";
import type { InkWorkbenchLaunchOptions, InkWorkbenchStdin } from "./types";

export async function launchInkWorkbench(options: InkWorkbenchLaunchOptions): Promise<number> {
  const host = await createCliHost({
    mock: options.args.mock,
    ...(options.args.profile ? { profileId: options.args.profile } : {}),
    ...(options.args.providerId ? { providerId: options.args.providerId } : {}),
    ...(options.args.modelId ? { modelSelector: options.args.modelId } : {}),
    ...(options.io.env ? { env: options.io.env } : {})
  });
  let bracketedPasteEnabled = false;

  try {
    const session = await host.local.client.createSession({ title: "CLI interactive" });
    const startup = {
      projectPath: process.cwd(),
      sessionId: session.id,
      ...(session.activeBranchId ? { branchId: session.activeBranchId } : {}),
      profileId: host.profileId,
      ...(host.providerId ? { providerId: host.providerId } : {}),
      modelId: host.selectedModel?.id ?? host.modelId ?? currentConfigModelLabel(options.io.env),
      configSource: describeConfigSource(host),
      slashCommands: WORKBENCH_SLASH_COMMANDS
    };
    const controller = new WorkbenchController({
      client: host.local.client,
      config: host.config.config,
      storage: host.storage,
      startup,
      session,
      ...(host.providerId ? { providerId: host.providerId } : {}),
      ...(host.modelId ? { modelId: host.modelId } : {}),
      profileId: host.profileId,
      ...(options.io.oauthLoginRunner ? { oauthLoginRunner: options.io.oauthLoginRunner } : {}),
      ...(options.io.env ? { env: options.io.env } : {})
    });

    if (!supportsRawMode(options.io.stdin)) {
      options.io.stderr.write("guga interactive workbench requires a TTY with raw mode support.\n");
      return 2;
    }

    options.io.stdout.write(BRACKETED_PASTE_ENABLE);
    bracketedPasteEnabled = true;
    const instance = render(<InkWorkbenchApp controller={controller} />, {
      stdin: options.io.stdin as NodeJS.ReadStream,
      stdout: options.io.stdout as NodeJS.WriteStream,
      stderr: options.io.stderr as NodeJS.WriteStream,
      exitOnCtrlC: false,
      patchConsole: false
    });
    await instance.waitUntilExit();
    return 0;
  } finally {
    if (bracketedPasteEnabled) {
      options.io.stdout.write(BRACKETED_PASTE_DISABLE);
    }
    await host.local.close();
  }
}

function supportsRawMode(stdin: InkWorkbenchStdin | undefined): stdin is InkWorkbenchStdin & {
  setRawMode(mode: boolean): unknown;
} {
  return stdin?.isTTY === true && typeof stdin.setRawMode === "function";
}

function currentConfigModelLabel(env: NodeJS.ProcessEnv | undefined): string {
  const config = readCliConfig(env);
  const selected = selectResolvedModel({
    config,
    ...(env ? { env } : {})
  });
  return selected?.id ?? selected?.modelId ?? "(none)";
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

export function isInkWorkbenchLaunchError(error: unknown): error is CliHostFactoryError | CliConfigError {
  return error instanceof CliHostFactoryError || error instanceof CliConfigError;
}
