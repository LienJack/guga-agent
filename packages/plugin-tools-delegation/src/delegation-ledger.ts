import type {
  DelegateTaskBatchOutput,
  DelegateTaskOutput,
  DelegationEventCount,
  DelegationLedger,
  DelegationRunRecord,
  DelegationStatus,
  DelegationValidationDiagnostic
} from "./delegation-types";

const statuses: DelegationStatus[] = ["completed", "failed", "cancelled", "timed_out"];

export function createDelegationLedger(records: readonly DelegationRunRecord[]): DelegationLedger {
  const sortedRecords = [...records].sort(compareRunRecords);
  return {
    records: sortedRecords,
    statusCounts: countStatuses(sortedRecords),
    eventCounts: mergeEventCounts(sortedRecords.flatMap((record) => record.events))
  };
}

export function renderDelegationResult(output: DelegateTaskOutput): string {
  const eventSummary = output.events && output.events.length > 0
    ? `\nEvents: ${sortEventCounts(output.events).map((event) => `${event.type}=${event.count}`).join(", ")}`
    : "";
  return [
    `Delegated task ${output.status}.`,
    `Child run: ${output.childRunId}`,
    `Child session: ${output.childSessionId}`,
    `Summary: ${output.summary}${eventSummary}`
  ].join("\n");
}

export function renderDelegationBatchResult(output: DelegateTaskBatchOutput): string {
  const counts = statuses
    .filter((status) => output.statusCounts[status] > 0)
    .map((status) => `${status}=${output.statusCounts[status]}`)
    .join(", ");
  const children = output.childResults
    .map((child) => {
      const taskLabel = child.taskId ? `${child.taskIndex}:${child.taskId}` : String(child.taskIndex);
      return `- [${taskLabel}] ${child.status} ${child.childRunId}: ${child.summary}`;
    })
    .join("\n");
  const eventSummary = output.eventCounts.length > 0
    ? `\nEvents: ${output.eventCounts.map((event) => `${event.type}=${event.count}`).join(", ")}`
    : "";

  return [
    `Delegated batch ${output.status}.`,
    `Children: ${output.childResults.length}`,
    `Statuses: ${counts || "none"}`,
    `Summary: ${output.summary}`,
    "Results:",
    children,
    eventSummary.trimEnd()
  ].filter(Boolean).join("\n");
}

export function validateDelegationOutput(output: unknown): DelegationValidationDiagnostic[] {
  const diagnostics: DelegationValidationDiagnostic[] = [];
  if (!isRecord(output)) {
    return [{ code: "DELEGATION_OUTPUT_NOT_OBJECT", message: "Delegation output must be an object" }];
  }
  if (typeof output.status !== "string" || !statuses.includes(output.status as DelegationStatus)) {
    diagnostics.push({ code: "DELEGATION_STATUS_INVALID", message: `Unsupported delegation status: ${String(output.status)}`, path: "status" });
  }
  if (typeof output.summary !== "string" || !output.summary.trim()) {
    diagnostics.push({ code: "DELEGATION_SUMMARY_EMPTY", message: "Delegation output summary is required", path: "summary" });
  }
  if (typeof output.childRunId !== "string" || !output.childRunId.trim()) {
    diagnostics.push({ code: "DELEGATION_CHILD_RUN_ID_EMPTY", message: "Delegation output childRunId is required", path: "childRunId" });
  }
  if (typeof output.childSessionId !== "string" || !output.childSessionId.trim()) {
    diagnostics.push({ code: "DELEGATION_CHILD_SESSION_ID_EMPTY", message: "Delegation output childSessionId is required", path: "childSessionId" });
  }
  if (output.events !== undefined && !Array.isArray(output.events)) {
    diagnostics.push({ code: "DELEGATION_EVENTS_INVALID", message: "Delegation output events must be an array", path: "events" });
    return diagnostics;
  }
  for (const [index, event] of (output.events ?? []).entries()) {
    if (!isRecord(event) || typeof event.type !== "string" || !event.type.trim()) {
      diagnostics.push({ code: "DELEGATION_EVENT_TYPE_EMPTY", message: "Delegation event type is required", path: `events[${index}].type` });
    }
    const count = isRecord(event) ? event.count : undefined;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
      diagnostics.push({ code: "DELEGATION_EVENT_COUNT_INVALID", message: "Delegation event count must be a non-negative integer", path: `events[${index}].count` });
    }
  }
  return diagnostics;
}

export function sortEventCounts(events: readonly DelegationEventCount[]): DelegationEventCount[] {
  return [...events].sort((left, right) => left.type.localeCompare(right.type));
}

export function countDelegationStatuses(records: readonly Pick<DelegationRunRecord, "status">[]): Record<DelegationStatus, number> {
  return countStatuses(records);
}

export function mergeDelegationEventCounts(events: readonly DelegationEventCount[]): DelegationEventCount[] {
  return mergeEventCounts(events);
}

function compareRunRecords(left: DelegationRunRecord, right: DelegationRunRecord): number {
  return (
    left.taskIndex - right.taskIndex ||
    (left.taskId ?? "").localeCompare(right.taskId ?? "") ||
    left.childRunId.localeCompare(right.childRunId)
  );
}

function countStatuses(records: readonly Pick<DelegationRunRecord, "status">[]): Record<DelegationStatus, number> {
  return Object.fromEntries(statuses.map((status) => [status, records.filter((record) => record.status === status).length])) as Record<DelegationStatus, number>;
}

function mergeEventCounts(events: readonly DelegationEventCount[]): DelegationEventCount[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.type, (counts.get(event.type) ?? 0) + event.count);
  }
  return sortEventCounts([...counts].map(([type, count]) => ({ type, count })));
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
