import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createMemoryGovernanceLedger,
  createMemoryReviewHealth,
  createMemoryReviewReport,
  renderCuratedMemoryMarkdown,
  renderMemoryReviewHealthBlock,
  renderMemoryReviewReport,
  searchGovernedMemoryItems,
  validateMemoryCandidate,
  validateMemoryDecision,
  type MemoryCandidate,
  type MemoryDecision,
  type MemoryGovernanceLedger,
  type MemoryRetrievalOptions,
  type MemoryRetrievalResponse,
  type MemoryReviewHealth,
  type MemoryReviewReport,
  type RenderCuratedMemoryMarkdownOptions,
  type RenderMemoryReviewReportOptions
} from "@guga-agent/plugin-memory-candidates";

export type JsonlMemoryStoreOptions = {
  rootDir: string;
  fileName?: string;
};

export type JsonlMemoryRecord =
  | {
      kind: "candidate";
      recordId: string;
      recordedAt: string;
      candidate: MemoryCandidate;
    }
  | {
      kind: "decision";
      recordId: string;
      recordedAt: string;
      decision: MemoryDecision;
    };

export type JsonlMemoryDiagnostic = {
  kind: "partial_tail" | "invalid_json" | "invalid_record";
  message: string;
  line?: number;
  recoverable: boolean;
};

export type JsonlMemoryAppendResult =
  | { ok: true; status: "appended"; record: JsonlMemoryRecord }
  | { ok: false; status: "invalid"; diagnostics: JsonlMemoryDiagnostic[] }
  | { ok: false; status: "unavailable"; reason: string };

export type JsonlMemoryReadResult =
  | {
      ok: true;
      records: JsonlMemoryRecord[];
      candidates: MemoryCandidate[];
      decisions: MemoryDecision[];
      diagnostics: JsonlMemoryDiagnostic[];
    }
  | {
      ok: false;
      status: "corrupt";
      records: JsonlMemoryRecord[];
      diagnostics: JsonlMemoryDiagnostic[];
    };

export type JsonlMemoryReviewReportResult =
  | { ok: true; report: MemoryReviewReport; diagnostics: JsonlMemoryDiagnostic[] }
  | { ok: false; status: "corrupt"; diagnostics: JsonlMemoryDiagnostic[] };

export type JsonlMemoryReviewMarkdownResult =
  | { ok: true; report: MemoryReviewReport; markdown: string; diagnostics: JsonlMemoryDiagnostic[] }
  | { ok: false; status: "corrupt"; diagnostics: JsonlMemoryDiagnostic[] };

export type JsonlMemoryReviewHealthResult =
  | { ok: true; report: MemoryReviewReport; health: MemoryReviewHealth; diagnostics: JsonlMemoryDiagnostic[] }
  | { ok: false; status: "corrupt"; diagnostics: JsonlMemoryDiagnostic[] };

export type JsonlMemoryRetrievalResult =
  | { ok: true; response: MemoryRetrievalResponse; diagnostics: JsonlMemoryDiagnostic[] }
  | { ok: false; status: "corrupt"; diagnostics: JsonlMemoryDiagnostic[] };

export type JsonlMemoryCuratedMarkdownResult =
  | { ok: true; ledger: MemoryGovernanceLedger; markdown: string; diagnostics: JsonlMemoryDiagnostic[] }
  | { ok: false; status: "corrupt"; diagnostics: JsonlMemoryDiagnostic[] };

export type JsonlMemoryAuditSnapshotResult =
  | {
      ok: true;
      ledger: MemoryGovernanceLedger;
      report: MemoryReviewReport;
      health: MemoryReviewHealth;
      markdown: string;
      diagnostics: JsonlMemoryDiagnostic[];
    }
  | { ok: false; status: "corrupt"; diagnostics: JsonlMemoryDiagnostic[] };

export type JsonlMemoryReviewHealthMarkdownResult =
  | { ok: true; report: MemoryReviewReport; health: MemoryReviewHealth; markdown: string; diagnostics: JsonlMemoryDiagnostic[] }
  | { ok: false; status: "corrupt"; diagnostics: JsonlMemoryDiagnostic[] };

export class JsonlMemoryStore {
  readonly rootDir: string;
  readonly fileName: string;

  constructor(options: JsonlMemoryStoreOptions) {
    this.rootDir = options.rootDir;
    this.fileName = options.fileName ?? "memory.jsonl";
  }

  async appendCandidate(candidate: MemoryCandidate, options: { recordId?: string; recordedAt?: string } = {}): Promise<JsonlMemoryAppendResult> {
    const diagnostics = validateMemoryCandidate(candidate).map(toInvalidRecordDiagnostic);
    if (diagnostics.length > 0) {
      return { ok: false, status: "invalid", diagnostics };
    }
    return this.appendRecord({
      kind: "candidate",
      recordId: options.recordId ?? `candidate:${candidate.id}`,
      recordedAt: options.recordedAt ?? new Date().toISOString(),
      candidate
    });
  }

  async appendDecision(decision: MemoryDecision, options: { recordId?: string; recordedAt?: string } = {}): Promise<JsonlMemoryAppendResult> {
    const diagnostics = validateMemoryDecision(decision).map(toInvalidRecordDiagnostic);
    if (diagnostics.length > 0) {
      return { ok: false, status: "invalid", diagnostics };
    }
    return this.appendRecord({
      kind: "decision",
      recordId: options.recordId ?? `decision:${decision.id}`,
      recordedAt: options.recordedAt ?? new Date().toISOString(),
      decision
    });
  }

  async readRecords(): Promise<JsonlMemoryReadResult> {
    let content = "";
    try {
      content = await readFile(this.filePath(), "utf8");
    } catch (error) {
      if (isNotFoundError(error)) {
        return { ok: true, records: [], candidates: [], decisions: [], diagnostics: [] };
      }
      return { ok: false, status: "corrupt", records: [], diagnostics: [{ kind: "invalid_record", recoverable: false, message: String(error) }] };
    }

    const diagnostics: JsonlMemoryDiagnostic[] = [];
    const records: JsonlMemoryRecord[] = [];
    const hasPartialTail = content.length > 0 && !content.endsWith("\n");
    const lines = content.split("\n");
    const parseableLines = hasPartialTail ? lines.slice(0, -1) : lines;

    if (hasPartialTail) {
      diagnostics.push({
        kind: "partial_tail",
        recoverable: true,
        line: lines.length,
        message: "Ignoring partial final JSONL line"
      });
    }

    for (const [index, line] of parseableLines.entries()) {
      if (!line.trim()) {
        continue;
      }
      const parsed = parseRecordLine(line, index + 1);
      if (!parsed.ok) {
        return { ok: false, status: "corrupt", records, diagnostics: [...diagnostics, parsed.diagnostic] };
      }
      records.push(parsed.record);
    }

    return {
      ok: true,
      records,
      candidates: records.flatMap((record) => (record.kind === "candidate" ? [record.candidate] : [])),
      decisions: records.flatMap((record) => (record.kind === "decision" ? [record.decision] : [])),
      diagnostics
    };
  }

  async readGovernanceLedger(): Promise<{ ok: true; ledger: MemoryGovernanceLedger; diagnostics: JsonlMemoryDiagnostic[] } | { ok: false; status: "corrupt"; diagnostics: JsonlMemoryDiagnostic[] }> {
    const read = await this.readRecords();
    if (!read.ok) {
      return { ok: false, status: "corrupt", diagnostics: read.diagnostics };
    }
    return {
      ok: true,
      ledger: createMemoryGovernanceLedger(read.candidates, read.decisions),
      diagnostics: read.diagnostics
    };
  }

  async readReviewReport(): Promise<JsonlMemoryReviewReportResult> {
    const read = await this.readGovernanceLedger();
    if (!read.ok) {
      return { ok: false, status: "corrupt", diagnostics: read.diagnostics };
    }
    return {
      ok: true,
      report: createMemoryReviewReport(read.ledger),
      diagnostics: read.diagnostics
    };
  }

  async readReviewMarkdown(options: RenderMemoryReviewReportOptions = {}): Promise<JsonlMemoryReviewMarkdownResult> {
    const read = await this.readReviewReport();
    if (!read.ok) {
      return { ok: false, status: "corrupt", diagnostics: read.diagnostics };
    }
    return {
      ok: true,
      report: read.report,
      markdown: renderMemoryReviewReport(read.report, options),
      diagnostics: read.diagnostics
    };
  }

  async readReviewHealth(): Promise<JsonlMemoryReviewHealthResult> {
    const read = await this.readReviewReport();
    if (!read.ok) {
      return { ok: false, status: "corrupt", diagnostics: read.diagnostics };
    }
    return {
      ok: true,
      report: read.report,
      health: createMemoryReviewHealth(read.report),
      diagnostics: read.diagnostics
    };
  }

  async readReviewHealthMarkdown(options: { title?: string } = {}): Promise<JsonlMemoryReviewHealthMarkdownResult> {
    const read = await this.readReviewHealth();
    if (!read.ok) {
      return { ok: false, status: "corrupt", diagnostics: read.diagnostics };
    }
    return {
      ok: true,
      report: read.report,
      health: read.health,
      markdown: renderMemoryReviewHealthBlock(read.health, options.title),
      diagnostics: read.diagnostics
    };
  }

  async readRetrieval(query: string, options: MemoryRetrievalOptions): Promise<JsonlMemoryRetrievalResult> {
    const read = await this.readGovernanceLedger();
    if (!read.ok) {
      return { ok: false, status: "corrupt", diagnostics: read.diagnostics };
    }
    return {
      ok: true,
      response: searchGovernedMemoryItems(read.ledger.items, query, options),
      diagnostics: read.diagnostics
    };
  }

  async readCuratedMarkdown(options: RenderCuratedMemoryMarkdownOptions = {}): Promise<JsonlMemoryCuratedMarkdownResult> {
    const read = await this.readGovernanceLedger();
    if (!read.ok) {
      return { ok: false, status: "corrupt", diagnostics: read.diagnostics };
    }
    return {
      ok: true,
      ledger: read.ledger,
      markdown: renderCuratedMemoryMarkdown(read.ledger.items, options),
      diagnostics: read.diagnostics
    };
  }

  async readAuditSnapshot(options: RenderMemoryReviewReportOptions = {}): Promise<JsonlMemoryAuditSnapshotResult> {
    const read = await this.readGovernanceLedger();
    if (!read.ok) {
      return { ok: false, status: "corrupt", diagnostics: read.diagnostics };
    }
    const report = createMemoryReviewReport(read.ledger);
    return {
      ok: true,
      ledger: read.ledger,
      report,
      health: createMemoryReviewHealth(report),
      markdown: renderMemoryReviewReport(report, options),
      diagnostics: read.diagnostics
    };
  }

  private async appendRecord(record: JsonlMemoryRecord): Promise<JsonlMemoryAppendResult> {
    const current = await this.readRecords();
    if (!current.ok || current.diagnostics.some((diagnostic) => diagnostic.kind === "partial_tail")) {
      return { ok: false, status: "unavailable", reason: "Cannot append to corrupt or partial memory JSONL file" };
    }
    await mkdir(this.rootDir, { recursive: true });
    await appendFile(this.filePath(), `${JSON.stringify(record)}\n`, "utf8");
    return { ok: true, status: "appended", record };
  }

  private filePath(): string {
    return join(this.rootDir, this.fileName);
  }
}

function parseRecordLine(line: string, lineNumber: number): { ok: true; record: JsonlMemoryRecord } | { ok: false; diagnostic: JsonlMemoryDiagnostic } {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return {
      ok: false,
      diagnostic: { kind: "invalid_json", recoverable: false, line: lineNumber, message: "Invalid JSONL record" }
    };
  }

  const recordDiagnostics = validateJsonlMemoryRecord(value);
  if (recordDiagnostics.length > 0) {
    return {
      ok: false,
      diagnostic: {
        kind: "invalid_record",
        recoverable: false,
        line: lineNumber,
        message: recordDiagnostics.map((diagnostic) => diagnostic.message).join("; ")
      }
    };
  }
  return { ok: true, record: value as JsonlMemoryRecord };
}

function validateJsonlMemoryRecord(record: unknown): JsonlMemoryDiagnostic[] {
  if (!isRecord(record)) {
    return [{ kind: "invalid_record", recoverable: false, message: "Memory JSONL record must be an object" }];
  }
  const baseDiagnostics: JsonlMemoryDiagnostic[] = [];
  if (typeof record.recordId !== "string" || !record.recordId.trim()) {
    baseDiagnostics.push({ kind: "invalid_record", recoverable: false, message: "recordId is required" });
  }
  if (typeof record.recordedAt !== "string" || Number.isNaN(Date.parse(record.recordedAt))) {
    baseDiagnostics.push({ kind: "invalid_record", recoverable: false, message: "recordedAt must be an ISO-like date string" });
  }
  if (record.kind === "candidate") {
    return [...baseDiagnostics, ...validateMemoryCandidate(record.candidate).map(toInvalidRecordDiagnostic)];
  }
  if (record.kind === "decision") {
    return [...baseDiagnostics, ...validateMemoryDecision(record.decision).map(toInvalidRecordDiagnostic)];
  }
  return [...baseDiagnostics, { kind: "invalid_record", recoverable: false, message: "kind must be candidate or decision" }];
}

function toInvalidRecordDiagnostic(diagnostic: { message: string }): JsonlMemoryDiagnostic {
  return { kind: "invalid_record", recoverable: false, message: diagnostic.message };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function isNotFoundError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}
