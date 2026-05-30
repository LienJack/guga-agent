import type {
  CodeTask,
  CodeTaskBlockedReason,
  CodeTaskCancelledBy,
  CodeTaskCompletionEvidence,
  CodeTaskFailureReason,
  CodeTaskPlan,
  CodeTaskPlanEvidenceRef,
  CodeTaskPlanItemStatus,
  CodeTaskStageRole,
  CodeTaskStageRun,
  CodeTaskState,
  VerificationAttempt
} from "./contracts";
import { validateCodeTask } from "./contracts";

export type CodeTaskTransition =
  | {
      type: "advance";
      state: CodeTaskState;
      at: string;
      activeRunId?: string;
    }
  | {
      type: "set_plan";
      at: string;
      plan: CodeTaskPlan;
    }
  | {
      type: "update_plan_item";
      at: string;
      itemId: string;
      status: CodeTaskPlanItemStatus;
      evidence?: CodeTaskPlanEvidenceRef[];
      changedFiles?: string[];
      verificationAttemptIds?: string[];
      risks?: string[];
      blocker?: CodeTaskBlockedReason;
    }
  | {
      type: "start_stage_run";
      at: string;
      role: CodeTaskStageRole;
      runId: string;
    }
  | {
      type: "finish_stage_run";
      at: string;
      runId: string;
      status: Extract<CodeTaskStageRun["status"], "completed" | "failed" | "cancelled">;
    }
  | {
      type: "record_verification";
      at: string;
      attempt: VerificationAttempt;
    }
  | {
      type: "complete";
      at: string;
      evidence: CodeTaskCompletionEvidence;
    }
  | {
      type: "block";
      at: string;
      reason: CodeTaskBlockedReason;
    }
  | {
      type: "fail";
      at: string;
      reason: CodeTaskFailureReason;
    }
  | {
      type: "cancel";
      at: string;
      actor: CodeTaskCancelledBy;
    };

export type CodeTaskTransitionResult =
  | {
      ok: true;
      task: CodeTask;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        details?: unknown;
      };
    };

const ALLOWED_TRANSITIONS: Record<CodeTaskState, readonly CodeTaskState[]> = {
  created: ["scouting", "cancelled", "blocked", "failed"],
  scouting: ["planning", "blocked", "failed", "cancelled"],
  planning: ["executing", "blocked", "failed", "cancelled"],
  executing: ["verifying", "blocked", "failed", "cancelled"],
  verifying: ["completed", "repairing", "blocked", "failed", "cancelled"],
  repairing: ["executing", "verifying", "blocked", "failed", "cancelled"],
  completed: [],
  blocked: [],
  failed: [],
  cancelled: []
};

export function transitionCodeTask(task: CodeTask, transition: CodeTaskTransition): CodeTaskTransitionResult {
  const updated = applyTransition(task, transition);
  if (!updated.ok) {
    return updated;
  }
  const validation = validateCodeTask(updated.task);
  if (!validation.ok) {
    return {
      ok: false,
      error: {
        code: "CODE_TASK_INVARIANT_VIOLATION",
        message: validation.issues.map((issue) => issue.message).join("; "),
        details: validation.issues
      }
    };
  }
  return updated;
}

export function canTransitionCodeTask(from: CodeTaskState, to: CodeTaskState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

function applyTransition(task: CodeTask, transition: CodeTaskTransition): CodeTaskTransitionResult {
  switch (transition.type) {
    case "advance":
      return advance(task, transition.state, transition.at, transition.activeRunId);
    case "set_plan":
      return ok({
        ...task,
        plan: transition.plan,
        updatedAt: transition.at
      });
    case "update_plan_item":
      return updatePlanItem(task, transition);
    case "start_stage_run":
      return ok({
        ...task,
        activeRunId: transition.runId,
        updatedAt: transition.at,
        stageRuns: [
          ...task.stageRuns,
          {
            role: transition.role,
            runId: transition.runId,
            status: "running",
            startedAt: transition.at
          }
        ]
      });
    case "finish_stage_run":
      return ok({
        ...task,
        updatedAt: transition.at,
        stageRuns: task.stageRuns.map((run) => run.runId === transition.runId
          ? {
              ...run,
              status: transition.status,
              completedAt: transition.at
            }
          : run)
      });
    case "record_verification":
      return ok({
        ...task,
        updatedAt: transition.at,
        verificationAttempts: upsertVerification(task.verificationAttempts, transition.attempt)
      });
    case "complete":
      return advance({
        ...task,
        completionEvidence: transition.evidence
      }, "completed", transition.at);
    case "block":
      return advance({
        ...task,
        blockedReason: transition.reason
      }, "blocked", transition.at);
    case "fail":
      return advance({
        ...task,
        failureReason: transition.reason
      }, "failed", transition.at);
    case "cancel":
      return advance({
        ...task,
        cancelledBy: transition.actor
      }, "cancelled", transition.at);
  }
}

function updatePlanItem(
  task: CodeTask,
  transition: Extract<CodeTaskTransition, { type: "update_plan_item" }>
): CodeTaskTransitionResult {
  const items = task.plan?.ledgerItems ?? [];
  const item = items.find((candidate) => candidate.id === transition.itemId);
  if (!task.plan || !item) {
    return {
      ok: false,
      error: {
        code: "PLAN_LEDGER_ITEM_NOT_FOUND",
        message: `Plan ledger item not found: ${transition.itemId}`
      }
    };
  }
  if (!canTransitionPlanItem(item.status, transition.status)) {
    return {
      ok: false,
      error: {
        code: "INVALID_PLAN_LEDGER_ITEM_TRANSITION",
        message: `Cannot transition plan ledger item ${item.id} from ${item.status} to ${transition.status}`,
        details: { itemId: item.id, from: item.status, to: transition.status }
      }
    };
  }

  return ok({
    ...task,
    updatedAt: transition.at,
    plan: {
      ...task.plan,
      ledgerItems: items.map((candidate) => candidate.id === item.id
        ? {
            ...candidate,
            status: transition.status,
            evidence: transition.evidence ?? candidate.evidence,
            changedFiles: transition.changedFiles ?? candidate.changedFiles,
            verificationAttemptIds: transition.verificationAttemptIds ?? candidate.verificationAttemptIds,
            risks: transition.risks ?? candidate.risks,
            ...(transition.blocker !== undefined ? { blocker: transition.blocker } : {}),
            ...((transition.status === "verified" || transition.status === "done") ? { settledAt: transition.at } : {})
          }
        : candidate)
    }
  });
}

function canTransitionPlanItem(from: CodeTaskPlanItemStatus, to: CodeTaskPlanItemStatus): boolean {
  if (from === to) {
    return true;
  }
  const allowed: Record<CodeTaskPlanItemStatus, readonly CodeTaskPlanItemStatus[]> = {
    pending: ["in-progress", "blocked"],
    "in-progress": ["evidence-submitted", "blocked"],
    "evidence-submitted": ["verified", "in-progress", "blocked"],
    verified: ["done", "in-progress", "blocked"],
    done: [],
    blocked: ["in-progress"]
  };
  return allowed[from].includes(to);
}

function advance(
  task: CodeTask,
  nextState: CodeTaskState,
  at: string,
  activeRunId?: string
): CodeTaskTransitionResult {
  if (!canTransitionCodeTask(task.state, nextState)) {
    return {
      ok: false,
      error: {
        code: "INVALID_CODE_TASK_TRANSITION",
        message: `Cannot transition code task from ${task.state} to ${nextState}`,
        details: { from: task.state, to: nextState }
      }
    };
  }

  return ok({
    ...task,
    state: nextState,
    phase: nextState,
    updatedAt: at,
    ...(activeRunId !== undefined ? { activeRunId } : {})
  });
}

function upsertVerification(attempts: VerificationAttempt[], next: VerificationAttempt): VerificationAttempt[] {
  const existingIndex = attempts.findIndex((attempt) => attempt.id === next.id);
  if (existingIndex === -1) {
    return [...attempts, next];
  }
  return attempts.map((attempt, index) => index === existingIndex ? next : attempt);
}

function ok(task: CodeTask): CodeTaskTransitionResult {
  return { ok: true, task };
}
