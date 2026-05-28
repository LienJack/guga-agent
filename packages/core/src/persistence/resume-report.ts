import type { CoreMessage } from "../contracts/messages";
import type { ProjectionLedgerEntry } from "../contracts/context";
import type {
  JsonObject,
  ReplayDiagnostic,
  SessionLeaf,
  SessionRecord,
  SessionBranch,
  StoreCorruptionDiagnostic
} from "../contracts/persistence";

export type ResumeOperationKind = "run" | "turn" | "model" | "tool" | "permission" | "hook" | "compaction";

export type ResumeOperationStatus =
  | "completed"
  | "failed"
  | "cancelled"
  | "timeout"
  | "denied"
  | "interrupted"
  | "corrupt";

export type ResumeInterruptedOperation = {
  kind: ResumeOperationKind;
  status: Exclude<ResumeOperationStatus, "completed">;
  runId?: string;
  turn?: number;
  eventId?: string;
  startedAt?: string;
  message: string;
  allowedActions: Array<"resume" | "fork" | "mark_abandoned" | "repair" | "truncate">;
  metadata?: JsonObject;
};

export type ResumeReport = {
  ok: true;
  session: SessionRecord;
  branches: SessionBranch[];
  activeLeaf: SessionLeaf;
  conversation: CoreMessage[];
  projectionLedger: ProjectionLedgerEntry[];
  interrupted: ResumeInterruptedOperation[];
  diagnostics: Array<ReplayDiagnostic | StoreCorruptionDiagnostic>;
};

export type ResumeReportFailure = {
  ok: false;
  status: "not_found" | "unavailable" | "corrupt" | "repair_required";
  diagnostics: Array<ReplayDiagnostic | StoreCorruptionDiagnostic>;
};

export type ResumeReportResult = ResumeReport | ResumeReportFailure;
