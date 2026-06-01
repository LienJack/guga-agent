import type { RuntimeToolInvoker, ToolRuntimeResult } from "@guga-agent/core";
import type { CodeTask, CodeTaskPlannedCheck, VerificationAttempt } from "./contracts";
import { summarizeVerificationToolResult } from "./verification-summary";
import { discoverTestCommands, type DiscoverTestCommandsOptions } from "../test-discovery";

export type VerificationCommand = CodeTaskPlannedCheck & {
  id?: string;
};

export type SelectVerificationCommandsOptions = DiscoverTestCommandsOptions & {
  cwd: string;
  plannedChecks?: CodeTaskPlannedCheck[];
};

export type RunVerificationOptions = {
  task: Pick<CodeTask, "taskId" | "sessionId" | "rootRunId" | "cwd">;
  invoker: RuntimeToolInvoker;
  commands: VerificationCommand[];
  now?: () => Date;
  runId?: string;
  onAttemptStarted?: (attempt: VerificationAttempt) => void;
};

export type RunVerificationResult = {
  attempts: VerificationAttempt[];
  passedRequired: boolean;
  failedRequired: VerificationAttempt[];
};

export function selectVerificationCommands(options: SelectVerificationCommandsOptions): VerificationCommand[] {
  const planned = options.plannedChecks ?? [];
  if (planned.length > 0) {
    return planned;
  }

  return discoverTestCommands(options).map((candidate) => ({
    command: candidate.command,
    cwd: options.cwd,
    required: candidate.confidence === "high",
    reason: candidate.reason
  }));
}

export async function runVerification(options: RunVerificationOptions): Promise<RunVerificationResult> {
  const now = options.now ?? (() => new Date());
  const attempts: VerificationAttempt[] = [];
  for (const [index, command] of options.commands.entries()) {
    const id = command.id ?? `verify-${index + 1}`;
    const startedAt = now().toISOString();
    options.onAttemptStarted?.({
      id,
      command: command.command,
      cwd: command.cwd ?? options.task.cwd,
      required: command.required,
      status: "running",
      reason: command.reason,
      startedAt
    });
    const result = await options.invoker.invokeTool({
      runId: options.runId ?? options.task.rootRunId,
      call: {
        id: `verification-${id}`,
        name: "shell_exec",
        input: { command: command.command }
      },
      source: "verification",
      taskId: options.task.taskId
    });
    attempts.push(attemptFromResult({
      id,
      task: options.task,
      command,
      startedAt,
      completedAt: now().toISOString(),
      result
    }));
  }

  const requiredAttempts = attempts.filter((attempt) => attempt.required);
  const failedRequired = requiredAttempts.filter((attempt) => attempt.status !== "passed");
  return {
    attempts,
    passedRequired: requiredAttempts.length > 0 && failedRequired.length === 0,
    failedRequired
  };
}

function attemptFromResult(options: {
  id: string;
  task: Pick<CodeTask, "taskId" | "sessionId" | "cwd">;
  command: VerificationCommand;
  startedAt: string;
  completedAt: string;
  result: ToolRuntimeResult;
}): VerificationAttempt {
  const summary = summarizeVerificationToolResult(options.result.result);
  return {
    id: options.id,
    command: options.command.command,
    cwd: options.command.cwd ?? options.task.cwd,
    required: options.command.required,
    status: summary.status,
    reason: options.command.reason,
    startedAt: options.startedAt,
    completedAt: options.completedAt,
    ...(summary.exitCode !== undefined ? { exitCode: summary.exitCode } : {}),
    outputSummary: summary.outputSummary
  };
}
