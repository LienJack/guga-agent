import type {
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

export function validateDelegationOutput(output: DelegateTaskOutput): DelegationValidationDiagnostic[] {
  const diagnostics: DelegationValidationDiagnostic[] = [];
  if (!statuses.includes(output.status)) {
    diagnostics.push({ code: "DELEGATION_STATUS_INVALID", message: `Unsupported delegation status: ${output.status}`, path: "status" });
  }
  if (!output.summary.trim()) {
    diagnostics.push({ code: "DELEGATION_SUMMARY_EMPTY", message: "Delegation output summary is required", path: "summary" });
  }
  if (!output.childRunId.trim()) {
    diagnostics.push({ code: "DELEGATION_CHILD_RUN_ID_EMPTY", message: "Delegation output childRunId is required", path: "childRunId" });
  }
  if (!output.childSessionId.trim()) {
    diagnostics.push({ code: "DELEGATION_CHILD_SESSION_ID_EMPTY", message: "Delegation output childSessionId is required", path: "childSessionId" });
  }
  for (const [index, event] of (output.events ?? []).entries()) {
    if (!event.type.trim()) {
      diagnostics.push({ code: "DELEGATION_EVENT_TYPE_EMPTY", message: "Delegation event type is required", path: `events[${index}].type` });
    }
    if (!Number.isInteger(event.count) || event.count < 0) {
      diagnostics.push({ code: "DELEGATION_EVENT_COUNT_INVALID", message: "Delegation event count must be a non-negative integer", path: `events[${index}].count` });
    }
  }
  return diagnostics;
}

export function sortEventCounts(events: readonly DelegationEventCount[]): DelegationEventCount[] {
  return [...events].sort((left, right) => left.type.localeCompare(right.type));
}

function compareRunRecords(left: DelegationRunRecord, right: DelegationRunRecord): number {
  return (
    left.parentRunId.localeCompare(right.parentRunId) ||
    left.parentToolCallId.localeCompare(right.parentToolCallId) ||
    left.childRunId.localeCompare(right.childRunId)
  );
}

function countStatuses(records: readonly DelegationRunRecord[]): Record<DelegationStatus, number> {
  return Object.fromEntries(statuses.map((status) => [status, records.filter((record) => record.status === status).length])) as Record<DelegationStatus, number>;
}

function mergeEventCounts(events: readonly DelegationEventCount[]): DelegationEventCount[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.type, (counts.get(event.type) ?? 0) + event.count);
  }
  return sortEventCounts([...counts].map(([type, count]) => ({ type, count })));
}
