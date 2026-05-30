import type { RuntimeToolInvoker } from "@guga-agent/core";
import {
  createCodeTask,
  type CodeTask,
  type CodeTaskPlan,
  type CodeTaskStageRole,
  type CreateCodeTaskInput,
  type VerificationAttempt
} from "./contracts";
import { transitionCodeTask, type CodeTaskTransition } from "./lifecycle";
import { runVerification, selectVerificationCommands, type VerificationCommand } from "./verification-runner";

export type CodeTaskStageRunRequest = {
  task: CodeTask;
  role: CodeTaskStageRole;
  prompt: string;
  failureEvidence?: VerificationAttempt[];
};

export type CodeTaskStageRunResult = {
  runId: string;
  plan?: CodeTaskPlan;
};

export type CodeTaskStageRunner = (request: CodeTaskStageRunRequest) => Promise<CodeTaskStageRunResult>;

export type CodeTaskControllerOptions = {
  invoker: RuntimeToolInvoker;
  runStage: CodeTaskStageRunner;
  now?: () => Date;
  maxRepairAttempts?: number;
  onTaskCreated?: (task: CodeTask) => void;
  onTransition?: (event: { previous: CodeTask; task: CodeTask; transition: CodeTaskTransition }) => void;
  onVerificationStarted?: (event: { task: CodeTask; attempt: VerificationAttempt }) => void;
};

export type StartCodeTaskOptions = Omit<CreateCodeTaskInput, "now" | "maxRepairAttempts"> & {
  prompt: string;
  changedFiles?: string[];
  plannedChecks?: VerificationCommand[];
};

export type CodeTaskControllerResult = {
  task: CodeTask;
};

export class CodeTaskController {
  private readonly invoker: RuntimeToolInvoker;
  private readonly runStage: CodeTaskStageRunner;
  private readonly now: () => Date;
  private readonly maxRepairAttempts: number;
  private readonly onTaskCreated: ((task: CodeTask) => void) | undefined;
  private readonly onTransition: CodeTaskControllerOptions["onTransition"];
  private readonly onVerificationStarted: CodeTaskControllerOptions["onVerificationStarted"];

  constructor(options: CodeTaskControllerOptions) {
    this.invoker = options.invoker;
    this.runStage = options.runStage;
    this.now = options.now ?? (() => new Date());
    this.maxRepairAttempts = options.maxRepairAttempts ?? 2;
    this.onTaskCreated = options.onTaskCreated;
    this.onTransition = options.onTransition;
    this.onVerificationStarted = options.onVerificationStarted;
  }

  async start(options: StartCodeTaskOptions): Promise<CodeTaskControllerResult> {
    let task = createCodeTask({
      taskId: options.taskId,
      sessionId: options.sessionId,
      rootRunId: options.rootRunId,
      cwd: options.cwd,
      objective: options.objective,
      now: this.timestamp(),
      maxRepairAttempts: this.maxRepairAttempts
    });
    this.onTaskCreated?.(task);

    task = await this.runStageAndAdvance(task, "scout", "scouting", "planning", options.prompt);
    const planned = await this.runStage({
      task,
      role: "planner",
      prompt: options.prompt
    });
    task = this.mustTransition(task, { type: "start_stage_run", at: this.timestamp(), role: "planner", runId: planned.runId });
    task = this.mustTransition(task, { type: "finish_stage_run", at: this.timestamp(), runId: planned.runId, status: "completed" });
    if (planned.plan) {
      task = this.mustTransition(task, { type: "set_plan", at: this.timestamp(), plan: planned.plan });
    }
    task = this.mustTransition(task, { type: "advance", state: "executing", at: this.timestamp(), activeRunId: planned.runId });
    task = await this.runStageAndAdvance(task, "executor", "executing", "verifying", options.prompt);

    const checks = options.plannedChecks ?? selectVerificationCommands({
      cwd: options.cwd,
      ...(options.changedFiles ? { changedFiles: options.changedFiles } : {}),
      ...(task.plan?.checks ? { plannedChecks: task.plan.checks } : {})
    });

    return { task: await this.verifyOrRepair(task, checks, options.prompt) };
  }

  private async verifyOrRepair(
    task: CodeTask,
    checks: VerificationCommand[],
    prompt: string
  ): Promise<CodeTask> {
    const verification = await runVerification({
      task,
      invoker: this.invoker,
      commands: checks,
      now: this.now,
      onAttemptStarted: (attempt) => this.onVerificationStarted?.({ task, attempt })
    });
    for (const attempt of verification.attempts) {
      task = this.mustTransition(task, { type: "record_verification", at: this.timestamp(), attempt });
    }

    if (verification.passedRequired) {
      const passingIds = verification.attempts
        .filter((attempt) => attempt.required && attempt.status === "passed")
        .map((attempt) => attempt.id);
      task = this.settleLedgerItems(task, passingIds);
      return this.mustTransition(task, {
        type: "complete",
        at: this.timestamp(),
        evidence: {
          completedAt: this.timestamp(),
          passingVerificationAttemptIds: passingIds,
          summary: "Required verification passed"
        }
      });
    }

    if (task.attempt >= task.maxRepairAttempts) {
      return this.mustTransition(task, {
        type: "block",
        at: this.timestamp(),
        reason: {
          code: "VERIFICATION_FAILED",
          message: "Required verification failed and repair budget is exhausted",
          recoverable: true,
          details: { failedRequired: verification.failedRequired }
        }
      });
    }

    task = this.mustTransition({
      ...task,
      attempt: task.attempt + 1
    }, { type: "advance", state: "repairing", at: this.timestamp() });
    const repaired = await this.runStage({
      task,
      role: "repairer",
      prompt,
      failureEvidence: verification.failedRequired
    });
    task = this.mustTransition(task, { type: "start_stage_run", at: this.timestamp(), role: "repairer", runId: repaired.runId });
    task = this.mustTransition(task, { type: "finish_stage_run", at: this.timestamp(), runId: repaired.runId, status: "completed" });
    task = this.mustTransition(task, { type: "advance", state: "verifying", at: this.timestamp(), activeRunId: repaired.runId });
    return this.verifyOrRepair(task, checks, prompt);
  }

  private settleLedgerItems(task: CodeTask, passingVerificationAttemptIds: string[]): CodeTask {
    for (const item of task.plan?.ledgerItems ?? []) {
      if (item.status === "done") {
        continue;
      }
      if (item.status === "blocked") {
        task = this.mustTransition(task, {
          type: "update_plan_item",
          at: this.timestamp(),
          itemId: item.id,
          status: "in-progress"
        });
      }
      const current = task.plan?.ledgerItems?.find((candidate) => candidate.id === item.id);
      if (current?.status === "pending") {
        task = this.mustTransition(task, {
          type: "update_plan_item",
          at: this.timestamp(),
          itemId: item.id,
          status: "in-progress"
        });
      }
      const evidence = passingVerificationAttemptIds.map((verificationAttemptId) => ({
        kind: "verification" as const,
        id: verificationAttemptId,
        verificationAttemptId,
        summary: `Required verification passed: ${verificationAttemptId}`,
        changedFiles: item.changedFiles
      }));
      task = this.mustTransition(task, {
        type: "update_plan_item",
        at: this.timestamp(),
        itemId: item.id,
        status: "evidence-submitted",
        evidence,
        verificationAttemptIds: passingVerificationAttemptIds
      });
      task = this.mustTransition(task, {
        type: "update_plan_item",
        at: this.timestamp(),
        itemId: item.id,
        status: "verified",
        evidence,
        verificationAttemptIds: passingVerificationAttemptIds
      });
      task = this.mustTransition(task, {
        type: "update_plan_item",
        at: this.timestamp(),
        itemId: item.id,
        status: "done",
        evidence,
        verificationAttemptIds: passingVerificationAttemptIds
      });
    }
    return task;
  }

  private async runStageAndAdvance(
    task: CodeTask,
    role: CodeTaskStageRole,
    from: "scouting" | "executing",
    to: "planning" | "verifying",
    prompt: string
  ): Promise<CodeTask> {
    if (task.state !== from) {
      task = this.mustTransition(task, { type: "advance", state: from, at: this.timestamp() });
    }
    const result = await this.runStage({ task, role, prompt });
    task = this.mustTransition(task, { type: "start_stage_run", at: this.timestamp(), role, runId: result.runId });
    task = this.mustTransition(task, { type: "finish_stage_run", at: this.timestamp(), runId: result.runId, status: "completed" });
    return this.mustTransition(task, { type: "advance", state: to, at: this.timestamp(), activeRunId: result.runId });
  }

  private mustTransition(task: CodeTask, transition: CodeTaskTransition): CodeTask {
    const result = transitionCodeTask(task, transition);
    if (!result.ok) {
      throw new Error(`${result.error.code}: ${result.error.message}`);
    }
    this.onTransition?.({ previous: task, task: result.task, transition });
    return result.task;
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}
