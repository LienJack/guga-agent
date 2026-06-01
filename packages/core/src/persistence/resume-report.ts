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

export type RecoveryPolicyOutcomeCategory =
  | "auto-retry"
  | "compact-and-retry"
  | "wait-for-user"
  | "repair"
  | "fork"
  | "truncate"
  | "blocked"
  | "read-only-diagnostics";

export type RecoveryPolicyOutcome = {
  category: RecoveryPolicyOutcomeCategory;
  message: string;
  recoverable: boolean;
  source: {
    kind: "interrupted_operation" | "store_diagnostic" | "replay_diagnostic";
    eventId?: string;
    diagnosticKind?: string;
    diagnosticCode?: string;
  };
  allowedActions: ResumeInterruptedOperation["allowedActions"];
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
  recoveryOutcomes: RecoveryPolicyOutcome[];
  diagnostics: Array<ReplayDiagnostic | StoreCorruptionDiagnostic>;
};

export type ResumeReportFailure = {
  ok: false;
  status: "not_found" | "unavailable" | "corrupt" | "repair_required";
  diagnostics: Array<ReplayDiagnostic | StoreCorruptionDiagnostic>;
  recoveryOutcomes?: RecoveryPolicyOutcome[];
};

export type ResumeReportResult = ResumeReport | ResumeReportFailure;
