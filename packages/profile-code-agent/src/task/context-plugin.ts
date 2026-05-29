import { ContextSourceKind, ContextSourcePriority, type ReinjectionSource } from "@guga-agent/core";
import type { CodeTask } from "./contracts";

export type CodeTaskContextSourceOptions = {
  task: CodeTask;
  runtimeContextId?: string;
};

export function createCodeTaskReinjectionSource(options: CodeTaskContextSourceOptions): ReinjectionSource {
  const { task } = options;
  return {
    id: `code-task:${task.taskId}`,
    kind: ContextSourceKind.PlanTodo,
    priority: ContextSourcePriority.High,
    content: renderCodeTaskContext(task),
    ...(options.runtimeContextId ? { runtimeContextId: options.runtimeContextId } : {}),
    references: [{
      type: "host-reference",
      id: task.taskId,
      label: "active code task",
      metadata: {
        sessionId: task.sessionId,
        rootRunId: task.rootRunId,
        state: task.state
      }
    }],
    metadata: {
      taskId: task.taskId,
      state: task.state,
      phase: task.phase,
      attempt: task.attempt
    }
  };
}

export function renderCodeTaskContext(task: CodeTask): string {
  const lines = [
    `Active code task: ${task.objective}`,
    `State: ${task.state}`,
    `Attempt: ${task.attempt}/${task.maxRepairAttempts}`,
    `Workspace: ${task.cwd}`
  ];

  if (task.plan) {
    lines.push("", `Plan: ${task.plan.summary}`);
    if (task.plan.files.length > 0) {
      lines.push(`Files: ${task.plan.files.map((file) => `${file.action}:${file.path}`).join(", ")}`);
    }
    if (task.plan.checks.length > 0) {
      lines.push(`Checks: ${task.plan.checks.map((check) => `${check.required ? "required" : "optional"}:${check.command}`).join(", ")}`);
    }
  }

  const failed = task.verificationAttempts.filter((attempt) => attempt.required && attempt.status === "failed");
  if (failed.length > 0) {
    lines.push("", "Failed required verification:");
    for (const attempt of failed.slice(-3)) {
      lines.push(`- ${attempt.command}: ${attempt.outputSummary ?? "failed without summary"}`);
    }
  }

  const passed = task.verificationAttempts.filter((attempt) => attempt.required && attempt.status === "passed");
  if (passed.length > 0) {
    lines.push("", `Passing required verification: ${passed.map((attempt) => attempt.command).join(", ")}`);
  }

  lines.push("", nextStepFor(task));
  return lines.join("\n");
}

function nextStepFor(task: CodeTask): string {
  switch (task.state) {
    case "created":
      return "Next step: scout relevant files and tests.";
    case "scouting":
      return "Next step: finish read-only scout and produce a structured plan.";
    case "planning":
      return "Next step: produce the implementation and verification plan.";
    case "executing":
      return "Next step: implement the planned change and tests.";
    case "verifying":
      return "Next step: run required verification and use failures as repair evidence.";
    case "repairing":
      return "Next step: repair only the failed behavior and verify again.";
    case "completed":
      return "Next step: report completion evidence.";
    case "blocked":
      return `Next step: resolve blocker${task.blockedReason ? `: ${task.blockedReason.message}` : "."}`;
    case "failed":
      return `Next step: inspect failure${task.failureReason ? `: ${task.failureReason.message}` : "."}`;
    case "cancelled":
      return "Next step: wait for user direction before continuing.";
  }
}
