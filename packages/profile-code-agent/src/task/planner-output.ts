import type { CodeTaskPlan, CodeTaskPlanFile, CodeTaskPlannedCheck, CodeTaskPlanLedgerItem } from "./contracts";

export type PlannerOutputParseResult =
  | {
      ok: true;
      plan: CodeTaskPlan;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
      };
    };

const FENCE_PATTERN = /```(?:json\s+)?code_task_plan\s*([\s\S]*?)```/i;

export function parsePlannerOutput(text: string): PlannerOutputParseResult {
  const raw = extractPlanJson(text);
  if (!raw) {
    return {
      ok: false,
      error: {
        code: "PLANNER_OUTPUT_BLOCK_MISSING",
        message: "Planner output must include a ```code_task_plan JSON block"
      }
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "PLANNER_OUTPUT_JSON_INVALID",
        message: error instanceof Error ? error.message : "Planner output JSON is invalid"
      }
    };
  }

  return planFromUnknown(parsed);
}

function extractPlanJson(text: string): string | undefined {
  const match = FENCE_PATTERN.exec(text);
  if (match?.[1]) {
    return match[1].trim();
  }
  const trimmed = text.trim();
  return trimmed.startsWith("{") && trimmed.endsWith("}") ? trimmed : undefined;
}

function planFromUnknown(value: unknown): PlannerOutputParseResult {
  if (!isRecord(value)) {
    return parseError("PLANNER_OUTPUT_SCHEMA_INVALID", "Planner output must be a JSON object");
  }

  const summary = stringField(value, "summary");
  if (!summary) {
    return parseError("PLANNER_OUTPUT_SUMMARY_REQUIRED", "Planner output requires a non-empty summary");
  }

  const files = arrayField(value, "files").map(parseFile).filter((file): file is CodeTaskPlanFile => Boolean(file));
  const checks = arrayField(value, "checks").map(parseCheck).filter((check): check is CodeTaskPlannedCheck => Boolean(check));
  const ledgerItems = arrayField(value, "ledgerItems")
    .map(parseLedgerItem)
    .filter((item): item is CodeTaskPlanLedgerItem => Boolean(item));
  const itemIds = new Set<string>();
  for (const item of ledgerItems) {
    if (itemIds.has(item.id)) {
      return parseError("PLANNER_OUTPUT_LEDGER_ID_DUPLICATE", `Planner output contains duplicate ledger item id: ${item.id}`);
    }
    itemIds.add(item.id);
  }
  if (ledgerItems.length === 0) {
    return parseError("PLANNER_OUTPUT_LEDGER_REQUIRED", "Planner output requires at least one ledger item");
  }
  const userVisibleSummary = stringField(value, "userVisibleSummary");

  return {
    ok: true,
    plan: {
      summary,
      files,
      checks,
      assumptions: stringArrayField(value, "assumptions"),
      risks: stringArrayField(value, "risks"),
      ...(userVisibleSummary ? { userVisibleSummary } : {}),
      ledgerItems
    }
  };
}

function parseFile(value: unknown): CodeTaskPlanFile | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const path = stringField(value, "path");
  const action = stringField(value, "action");
  const reason = stringField(value, "reason");
  if (!path || !isPlanFileAction(action)) {
    return undefined;
  }
  return {
    path,
    action,
    ...(reason ? { reason } : {})
  };
}

function parseCheck(value: unknown): CodeTaskPlannedCheck | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const command = stringField(value, "command");
  const reason = stringField(value, "reason");
  const cwd = stringField(value, "cwd");
  if (!command || !reason) {
    return undefined;
  }
  return {
    command,
    ...(cwd ? { cwd } : {}),
    required: value.required === true,
    reason
  };
}

function parseLedgerItem(value: unknown): CodeTaskPlanLedgerItem | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = stringField(value, "id");
  const title = stringField(value, "title");
  if (!id || !title) {
    return undefined;
  }
  return {
    id,
    title,
    status: "pending",
    evidence: [],
    changedFiles: stringArrayField(value, "changedFiles"),
    verificationAttemptIds: [],
    risks: stringArrayField(value, "risks")
  };
}

function parseError(code: string, message: string): PlannerOutputParseResult {
  return { ok: false, error: { code, message } };
}

function arrayField(value: Record<string, unknown>, key: string): unknown[] {
  const field = value[key];
  return Array.isArray(field) ? field : [];
}

function stringArrayField(value: Record<string, unknown>, key: string): string[] {
  return arrayField(value, key).filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" && field.trim().length > 0 ? field.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlanFileAction(value: string | undefined): value is CodeTaskPlanFile["action"] {
  return value === "inspect" || value === "create" || value === "modify" || value === "delete" || value === "test";
}
