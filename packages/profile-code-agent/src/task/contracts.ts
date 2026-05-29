export const CODE_TASK_STATES = [
  "created",
  "scouting",
  "planning",
  "executing",
  "verifying",
  "repairing",
  "completed",
  "blocked",
  "failed",
  "cancelled"
] as const;

export type CodeTaskState = typeof CODE_TASK_STATES[number];

export type CodeTaskPhase = Exclude<CodeTaskState, "completed" | "blocked" | "failed" | "cancelled">;

export type CodeTaskStageRole = "scout" | "planner" | "executor" | "verifier" | "repairer";

export type CodeTaskTerminalState = Extract<CodeTaskState, "completed" | "blocked" | "failed" | "cancelled">;

export type CodeTaskBlockedReason = {
  code: string;
  message: string;
  recoverable?: boolean;
  details?: unknown;
};

export type CodeTaskFailureReason = {
  code: string;
  message: string;
  details?: unknown;
};

export type CodeTaskCancelledBy = "user" | "host" | "runtime";

export type CodeTaskPlanFile = {
  path: string;
  action: "inspect" | "create" | "modify" | "delete" | "test";
  reason?: string;
};

export type CodeTaskPlannedCheck = {
  command: string;
  cwd?: string;
  required: boolean;
  reason: string;
};

export type CodeTaskPlan = {
  summary: string;
  files: CodeTaskPlanFile[];
  checks: CodeTaskPlannedCheck[];
  assumptions: string[];
  risks: string[];
  userVisibleSummary?: string;
};

export type VerificationAttemptStatus = "planned" | "running" | "passed" | "failed" | "cancelled" | "skipped";

export type VerificationAttempt = {
  id: string;
  command: string;
  cwd: string;
  required: boolean;
  status: VerificationAttemptStatus;
  reason: string;
  startedAt?: string;
  completedAt?: string;
  exitCode?: number;
  outputSummary?: string;
  artifactRef?: string;
};

export type CodeTaskStageRun = {
  role: CodeTaskStageRole;
  runId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  startedAt?: string;
  completedAt?: string;
};

export type CodeTask = {
  taskId: string;
  sessionId: string;
  rootRunId: string;
  activeRunId?: string;
  cwd: string;
  objective: string;
  state: CodeTaskState;
  phase: CodeTaskPhase | CodeTaskTerminalState;
  attempt: number;
  maxRepairAttempts: number;
  createdAt: string;
  updatedAt: string;
  plan?: CodeTaskPlan;
  stageRuns: CodeTaskStageRun[];
  verificationAttempts: VerificationAttempt[];
  completionEvidence?: CodeTaskCompletionEvidence;
  blockedReason?: CodeTaskBlockedReason;
  failureReason?: CodeTaskFailureReason;
  cancelledBy?: CodeTaskCancelledBy;
};

export type CodeTaskCompletionEvidence = {
  completedAt: string;
  passingVerificationAttemptIds: string[];
  summary?: string;
};

export type CreateCodeTaskInput = {
  taskId: string;
  sessionId: string;
  rootRunId: string;
  cwd: string;
  objective: string;
  now: string;
  maxRepairAttempts?: number;
};

export type CodeTaskValidationIssue = {
  code: string;
  message: string;
};

export type CodeTaskValidationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      issues: CodeTaskValidationIssue[];
    };

export function createCodeTask(input: CreateCodeTaskInput): CodeTask {
  return {
    taskId: input.taskId,
    sessionId: input.sessionId,
    rootRunId: input.rootRunId,
    cwd: input.cwd,
    objective: input.objective,
    state: "created",
    phase: "created",
    attempt: 0,
    maxRepairAttempts: input.maxRepairAttempts ?? 2,
    createdAt: input.now,
    updatedAt: input.now,
    stageRuns: [],
    verificationAttempts: []
  };
}

export function validateCodeTask(task: CodeTask): CodeTaskValidationResult {
  const issues: CodeTaskValidationIssue[] = [];

  if (task.state === "completed") {
    if (!task.completionEvidence) {
      issues.push({
        code: "COMPLETION_EVIDENCE_REQUIRED",
        message: "Completed code tasks require completion evidence"
      });
    }
    const passingRequired = task.verificationAttempts.filter((attempt) => attempt.required && attempt.status === "passed");
    if (passingRequired.length === 0) {
      issues.push({
        code: "PASSING_REQUIRED_VERIFICATION_REQUIRED",
        message: "Completed code tasks require at least one passing required verification attempt"
      });
    }
    const evidenceIds = new Set(task.completionEvidence?.passingVerificationAttemptIds ?? []);
    if (passingRequired.length > 0 && !passingRequired.some((attempt) => evidenceIds.has(attempt.id))) {
      issues.push({
        code: "COMPLETION_EVIDENCE_MUST_REFERENCE_PASSING_VERIFICATION",
        message: "Completion evidence must reference a passing required verification attempt"
      });
    }
  }

  if (task.state === "blocked" && !task.blockedReason) {
    issues.push({
      code: "BLOCKED_REASON_REQUIRED",
      message: "Blocked code tasks require a blocked reason"
    });
  }

  if (task.state === "failed" && !task.failureReason) {
    issues.push({
      code: "FAILURE_REASON_REQUIRED",
      message: "Failed code tasks require a failure reason"
    });
  }

  if (task.state === "cancelled" && !task.cancelledBy) {
    issues.push({
      code: "CANCELLED_ACTOR_REQUIRED",
      message: "Cancelled code tasks require the actor that cancelled them"
    });
  }

  if (task.phase !== task.state) {
    issues.push({
      code: "PHASE_STATE_MISMATCH",
      message: "Code task phase must match the persisted lifecycle state"
    });
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
