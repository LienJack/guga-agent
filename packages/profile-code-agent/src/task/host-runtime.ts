import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RuntimeToolInvokeOptions, ToolRuntimeResult } from "@guga-agent/core";
import type { PackageScripts } from "../repo-context";
import { classifyCodeTask } from "./classifier";
import type { CodeTask, CodeTaskPlan, CodeTaskStageRole, VerificationAttempt } from "./contracts";
import { CodeTaskController, type CodeTaskStageRunner } from "./controller";
import type { CodeTaskTransition } from "./lifecycle";
import { parsePlannerOutput } from "./planner-output";
import { buildCodeTaskStagePrompt } from "./stages";
import { selectVerificationCommands, type VerificationCommand } from "./verification-runner";

export type CodeTaskHostRuntimeOptions = {
  profileId?: string;
  cwd: string;
  packageManager?: "pnpm" | "npm" | "yarn" | "bun";
  packageScripts?: PackageScripts;
  maxRepairAttempts?: number;
};

export type CodeTaskHostRuntime = {
  classify(options: { prompt: string; profileId?: string; cwd: string }): {
    shouldCreateTask: boolean;
    reason: string;
    confidence: "high" | "medium" | "low";
  };
  start(options: CodeTaskHostRuntimeStartOptions): Promise<{ finalAnswer: string }>;
};

export type CodeTaskHostRuntimeStartOptions = {
  taskId: string;
  sessionId: string;
  rootRunId: string;
  cwd: string;
  objective: string;
  prompt: string;
  signal?: AbortSignal;
  emit(event: CodeTaskHostEventInput): unknown;
  runStage(request: {
    taskId: string;
    role: CodeTaskStageRole;
    prompt: string;
  }): Promise<{
    runId: string;
    finalAnswer?: string;
    plan?: CodeTaskPlan;
  }>;
  invokeTool(options: RuntimeToolInvokeOptions): Promise<ToolRuntimeResult>;
};

export type CodeTaskHostEventInput = {
  type: string;
  [key: string]: unknown;
};

type VerificationAttemptHostResource = {
  id: string;
  taskId: string;
  sessionId: string;
  runId?: string;
  command: string;
  cwd: string;
  required: boolean;
  status: VerificationAttempt["status"];
  reason: string;
  startedAt?: string;
  completedAt?: string;
  exitCode?: number;
  outputSummary?: string;
  artifactRef?: string;
};

export function createCodeTaskHostRuntime(options: CodeTaskHostRuntimeOptions): CodeTaskHostRuntime {
  const packageScripts = options.packageScripts ?? readPackageScripts(options.cwd);
  const plannedChecks = selectVerificationCommands({
    cwd: options.cwd,
    packageManager: options.packageManager ?? "pnpm",
    packageScripts
  });

  return {
    classify(request) {
      const profileId = request.profileId ?? options.profileId;
      return classifyCodeTask({
        ...(profileId ? { profileId } : {}),
        prompt: request.prompt
      });
    },
    async start(request) {
      const controller = new CodeTaskController({
        invoker: {
          invokeTool(toolOptions) {
            return request.invokeTool({
              ...toolOptions,
              ...(request.signal ? { signal: toolOptions.signal ?? request.signal } : {})
            });
          }
        },
        runStage: createStageRunner(request, plannedChecks),
        ...(options.maxRepairAttempts !== undefined ? { maxRepairAttempts: options.maxRepairAttempts } : {}),
        onTaskCreated(task) {
          request.emit({
            type: "task.created",
            sessionId: task.sessionId,
            taskId: task.taskId,
            rootRunId: task.rootRunId,
            cwd: task.cwd,
            objective: task.objective,
            state: "created"
          });
        },
        onVerificationStarted({ task, attempt }) {
          request.emit({
            type: "verification.started",
            sessionId: task.sessionId,
            taskId: task.taskId,
            runId: task.rootRunId,
            attempt: verificationAttemptResource(task, attempt)
          });
        },
        onTransition(event) {
          emitTransition(request.emit, event);
        }
      });

      const result = await controller.start({
        taskId: request.taskId,
        sessionId: request.sessionId,
        rootRunId: request.rootRunId,
        cwd: request.cwd,
        objective: request.objective,
        prompt: request.prompt,
        plannedChecks
      });

      return { finalAnswer: finalAnswerForTask(result.task) };
    }
  };
}

function createStageRunner(
  request: CodeTaskHostRuntimeStartOptions,
  plannedChecks: VerificationCommand[]
): CodeTaskStageRunner {
  return async (stage) => {
    const prompt = buildCodeTaskStagePrompt({
      task: stage.task,
      role: stage.role,
      ...(stage.failureEvidence ? { failureEvidence: stage.failureEvidence } : {})
    });
    const result = await request.runStage({
      taskId: stage.task.taskId,
      role: stage.role,
      prompt
    });
    return {
      runId: result.runId,
      ...(stage.role === "planner"
        ? {
            plan: result.plan ?? parsePlannerFinalAnswer(result.finalAnswer, plannedChecks)
          }
        : {})
    };
  };
}

function parsePlannerFinalAnswer(finalAnswer: string | undefined, plannedChecks: VerificationCommand[]): CodeTaskPlan {
  const parsed = parsePlannerOutput(finalAnswer ?? "");
  if (!parsed.ok) {
    throw new Error(`${parsed.error.code}: ${parsed.error.message}`);
  }
  const commands = new Set(parsed.plan.checks.map((check) => check.command));
  const checks = [
    ...parsed.plan.checks,
    ...plannedChecks
      .filter((check) => !commands.has(check.command))
      .map((check) => ({
        command: check.command,
        ...(check.cwd ? { cwd: check.cwd } : {}),
        required: check.required,
        reason: check.reason
      }))
  ];
  return {
    ...parsed.plan,
    checks
  };
}

function emitTransition(
  emit: (event: CodeTaskHostEventInput) => unknown,
  event: { previous: CodeTask; task: CodeTask; transition: CodeTaskTransition }
): void {
  if (event.transition.type === "advance") {
    emit({
      type: "task.phase_changed",
      sessionId: event.task.sessionId,
      taskId: event.task.taskId,
      from: event.previous.state,
      to: event.task.state,
      ...(event.task.activeRunId ? { activeRunId: event.task.activeRunId } : {}),
      attempt: event.task.attempt,
      ...(event.task.plan ? { plan: event.task.plan } : {})
    });
    return;
  }

  if (event.transition.type === "set_plan") {
    emit({
      type: "task.phase_changed",
      sessionId: event.task.sessionId,
      taskId: event.task.taskId,
      from: event.task.state,
      to: event.task.state,
      ...(event.task.activeRunId ? { activeRunId: event.task.activeRunId } : {}),
      attempt: event.task.attempt,
      plan: event.transition.plan
    });
    return;
  }

  if (event.transition.type === "update_plan_item") {
    emit({
      type: "task.phase_changed",
      sessionId: event.task.sessionId,
      taskId: event.task.taskId,
      from: event.task.state,
      to: event.task.state,
      ...(event.task.activeRunId ? { activeRunId: event.task.activeRunId } : {}),
      attempt: event.task.attempt,
      ...(event.task.plan ? { plan: event.task.plan } : {})
    });
    return;
  }

  if (event.transition.type === "record_verification") {
    emit({
      type: "verification.completed",
      sessionId: event.task.sessionId,
      taskId: event.task.taskId,
      runId: event.task.rootRunId,
      attempt: verificationAttemptResource(event.task, event.transition.attempt)
    });
    return;
  }

  if (event.transition.type === "complete") {
    emit({
      type: "task.completed",
      sessionId: event.task.sessionId,
      taskId: event.task.taskId,
      evidence: event.transition.evidence
    });
    return;
  }

  if (event.transition.type === "block") {
    emit({
      type: "task.blocked",
      sessionId: event.task.sessionId,
      taskId: event.task.taskId,
      reason: event.transition.reason
    });
    return;
  }

  if (event.transition.type === "fail") {
    emit({
      type: "task.failed",
      sessionId: event.task.sessionId,
      taskId: event.task.taskId,
      reason: event.transition.reason
    });
    return;
  }

  if (event.transition.type === "cancel") {
    emit({
      type: "task.cancelled",
      sessionId: event.task.sessionId,
      taskId: event.task.taskId,
      actor: event.transition.actor
    });
  }
}

function verificationAttemptResource(task: CodeTask, attempt: VerificationAttempt): VerificationAttemptHostResource {
  return {
    id: attempt.id,
    taskId: task.taskId,
    sessionId: task.sessionId,
    runId: task.rootRunId,
    command: attempt.command,
    cwd: attempt.cwd,
    required: attempt.required,
    status: attempt.status,
    reason: attempt.reason,
    ...(attempt.startedAt ? { startedAt: attempt.startedAt } : {}),
    ...(attempt.completedAt ? { completedAt: attempt.completedAt } : {}),
    ...(attempt.exitCode !== undefined ? { exitCode: attempt.exitCode } : {}),
    ...(attempt.outputSummary !== undefined ? { outputSummary: attempt.outputSummary } : {}),
    ...(attempt.artifactRef ? { artifactRef: attempt.artifactRef } : {})
  };
}

function finalAnswerForTask(task: CodeTask): string {
  if (task.state === "completed") {
    return task.completionEvidence?.summary ?? "Code task completed after required verification passed.";
  }
  if (task.state === "blocked") {
    return `Code task blocked: ${task.blockedReason?.message ?? "blocked"}`;
  }
  if (task.state === "failed") {
    return `Code task failed: ${task.failureReason?.message ?? "failed"}`;
  }
  return `Code task ended in ${task.state}.`;
}

function readPackageScripts(cwd: string): PackageScripts {
  try {
    const parsed = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) as { scripts?: Record<string, unknown> };
    return Object.fromEntries(
      Object.entries(parsed.scripts ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    );
  } catch {
    return {};
  }
}
