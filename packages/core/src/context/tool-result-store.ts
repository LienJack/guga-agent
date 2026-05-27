import type { ToolCallCorrelation, ToolResultReference } from "../contracts/tool-runtime";
import type { ToolResult } from "../contracts/tools";

export type ToolResultRecord = {
  id: string;
  correlation: ToolCallCorrelation;
  toolName: string;
  result: ToolResult;
  content: string;
  contentHash: string;
  originalContentChars: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type StoreToolResultOptions = {
  correlation: ToolCallCorrelation;
  toolName: string;
  result: ToolResult;
  content: string;
  metadata?: Record<string, unknown>;
};

export type ToolResultStore = {
  store(options: StoreToolResultOptions): ToolResultReference;
  get(id: string): ToolResultRecord | undefined;
};

export class InMemoryToolResultStore implements ToolResultStore {
  private readonly records = new Map<string, ToolResultRecord>();

  store(options: StoreToolResultOptions): ToolResultReference {
    const id = toolResultRecordId(options.correlation);
    this.records.set(id, {
      id,
      correlation: options.correlation,
      toolName: options.toolName,
      result: structuredClone(options.result),
      content: options.content,
      contentHash: simpleContentHash(options.content),
      originalContentChars: options.content.length,
      createdAt: new Date().toISOString(),
      ...(options.metadata ? { metadata: options.metadata } : {})
    });

    return {
      type: "buffer",
      id,
      label: `${options.toolName} result`,
      metadata: {
        toolName: options.toolName,
        originalContentChars: options.content.length,
        contentHash: simpleContentHash(options.content)
      }
    };
  }

  get(id: string): ToolResultRecord | undefined {
    const record = this.records.get(id);
    return record ? structuredClone(record) : undefined;
  }
}

export function toolResultRecordId(correlation: ToolCallCorrelation): string {
  const batch = correlation.batchId ? `-${correlation.batchId}` : "";
  return `tool-result-${correlation.runId}-turn-${correlation.turn}-attempt-${correlation.attempt}${batch}-${correlation.toolCallId}`;
}

function simpleContentHash(input: string): string {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
