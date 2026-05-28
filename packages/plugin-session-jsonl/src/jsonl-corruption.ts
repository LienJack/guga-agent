import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { StoreCorruptionDiagnostic } from "@guga-agent/core";

export type JsonlReadSuccess<TRecord> = {
  ok: true;
  records: TRecord[];
  diagnostics: StoreCorruptionDiagnostic[];
};

export type JsonlReadFailure = {
  ok: false;
  diagnostics: StoreCorruptionDiagnostic[];
};

export type JsonlReadResult<TRecord> = JsonlReadSuccess<TRecord> | JsonlReadFailure;

export async function appendJsonlRecord(path: string, record: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(record)}\n`, "utf8");
}

export async function readJsonlRecords<TRecord>(
  path: string,
  options: {
    describeRecord(record: unknown): TRecord | undefined;
    corruptionContext?: Pick<StoreCorruptionDiagnostic, "streamId">;
  }
): Promise<JsonlReadResult<TRecord>> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (isNotFound(error)) {
      return { ok: true, records: [], diagnostics: [] };
    }
    return {
      ok: false,
      diagnostics: [{
        kind: "unknown",
        message: error instanceof Error ? error.message : `Unable to read JSONL file: ${path}`,
        recoverable: false,
        ...options.corruptionContext
      }]
    };
  }

  if (text.length === 0) {
    return { ok: true, records: [], diagnostics: [] };
  }

  const diagnostics: StoreCorruptionDiagnostic[] = [];
  const lines = text.split("\n");
  const hasTerminatingNewline = text.endsWith("\n");
  const parseableLines = hasTerminatingNewline ? lines.slice(0, -1) : lines.slice(0, -1);
  const records: TRecord[] = [];

  for (const [index, line] of parseableLines.entries()) {
    if (line.length === 0) {
      continue;
    }
    try {
      const record = options.describeRecord(JSON.parse(line));
      if (!record) {
        return {
          ok: false,
          diagnostics: [{
            kind: "schema_invalid",
            message: `Invalid JSONL record at line ${index + 1}`,
            recoverable: false,
            metadata: { line: index + 1 },
            ...options.corruptionContext
          }]
        };
      }
      records.push(record);
    } catch (error) {
      return {
        ok: false,
        diagnostics: [{
          kind: "middle_corruption",
          message: error instanceof Error ? error.message : `Invalid JSON at line ${index + 1}`,
          recoverable: false,
          metadata: { line: index + 1 },
          ...options.corruptionContext
        }]
      };
    }
  }

  if (!hasTerminatingNewline) {
    const tail = lines.at(-1) ?? "";
    if (tail.length > 0) {
      diagnostics.push({
        kind: "partial_tail",
        message: "Ignoring partial final JSONL line",
        recoverable: true,
        metadata: { line: lines.length },
        ...options.corruptionContext
      });
    }
  }

  return { ok: true, records, diagnostics };
}

export function safePathSegment(input: string): string {
  return input.replaceAll(/[^a-zA-Z0-9._=-]/g, "__");
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
