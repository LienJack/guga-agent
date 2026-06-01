import type { CodeTask, CodeTaskStageRole, VerificationAttempt } from "./contracts";

export type CodeTaskStagePromptOptions = {
  task: Pick<CodeTask, "objective" | "cwd" | "attempt" | "maxRepairAttempts" | "plan" | "verificationAttempts">;
  role: CodeTaskStageRole;
  projectRules?: string[];
  failureEvidence?: VerificationAttempt[];
};

export function buildCodeTaskStagePrompt(options: CodeTaskStagePromptOptions): string {
  const lines = [
    `Role: ${stageRoleLabel(options.role)}`,
    `Objective: ${options.task.objective}`,
    `Workspace: ${options.task.cwd}`,
    `Attempt: ${options.task.attempt}/${options.task.maxRepairAttempts}`,
    "",
    "Contract:",
    ...stageContract(options.role),
    "- Completion requires at least one passing required verification attempt."
  ];

  if (options.task.plan) {
    lines.push("", "Current structured plan:", options.task.plan.summary);
    if (options.task.plan.files.length > 0) {
      lines.push(`Files: ${options.task.plan.files.map((file) => `${file.action}:${file.path}`).join(", ")}`);
    }
    if (options.task.plan.checks.length > 0) {
      lines.push(`Checks: ${options.task.plan.checks.map((check) => `${check.required ? "required" : "optional"}:${check.command}`).join(", ")}`);
    }
  }

  if (options.failureEvidence && options.failureEvidence.length > 0) {
    lines.push("", "Verification failures to repair:");
    for (const attempt of options.failureEvidence) {
      lines.push(`- ${attempt.command} -> ${attempt.status}${attempt.exitCode !== undefined ? ` (${attempt.exitCode})` : ""}: ${attempt.outputSummary ?? "no summary"}`);
    }
  }

  if (options.projectRules && options.projectRules.length > 0) {
    lines.push("", "Project rules:", ...options.projectRules.map((rule) => `- ${rule}`));
  }

  return lines.join("\n");
}

function stageRoleLabel(role: CodeTaskStageRole): string {
  switch (role) {
    case "scout":
      return "Scout relevant code, tests, and constraints using read-only tools";
    case "planner":
      return "Create a structured implementation and verification plan";
    case "executor":
      return "Implement the approved behavior slice and update tests";
    case "verifier":
      return "Inspect verification evidence and decide whether repair is needed";
    case "repairer":
      return "Repair the implementation using failed verification evidence";
  }
}

function stageContract(role: CodeTaskStageRole): string[] {
  switch (role) {
    case "scout":
      return [
        "- Use only read/search/git status style tools.",
        "- Identify files, existing tests, and project constraints.",
        "- Do not edit files or claim completion."
      ];
    case "planner":
      return [
        "- Produce a concise plan with files to edit and focused verification commands.",
        "- Include one fenced ```code_task_plan JSON block with summary, files, checks, assumptions, risks, and ledgerItems.",
        "- Each ledgerItems entry must include a stable id, title, changedFiles, and risks; execution cannot start from summary-only text.",
        "- Include assumptions and risks.",
        "- Do not edit files."
      ];
    case "executor":
      return [
        "- Edit only files needed for the current task.",
        "- Add or update focused tests for behavior changes when feasible.",
        "- Stop after implementation; completion is decided by verification."
      ];
    case "verifier":
      return [
        "- Run or inspect required verification evidence.",
        "- Completion requires at least one passing required verification.",
        "- Failed required verification must feed repair or block the task."
      ];
    case "repairer":
      return [
        "- Use the failure evidence to make the smallest corrective change.",
        "- Avoid repeating identical failed attempts.",
        "- Verification still decides completion."
      ];
  }
}
