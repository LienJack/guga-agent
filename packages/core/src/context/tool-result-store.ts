import type { ArtifactStore, JsonObject } from "../contracts/persistence";
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

export type ArtifactToolResultStoreOptions = {
  artifactStore: ArtifactStore;
  privacyTags?: string[];
  retention?: "session" | "until-deleted" | "ephemeral" | "external-policy";
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
        contentHash: simpleContentHash(options.content),
        evidence: {
          rawSource: "buffer",
          redaction: { state: "none" },
          verifier: { status: "unverified" }
        }
      }
    };
  }

  get(id: string): ToolResultRecord | undefined {
    const record = this.records.get(id);
    return record ? structuredClone(record) : undefined;
  }
}

export class ArtifactToolResultStore implements ToolResultStore {
  private readonly artifactStore: ArtifactStore;
  private readonly privacyTags: string[];
  private readonly retention: "session" | "until-deleted" | "ephemeral" | "external-policy";

  constructor(options: ArtifactToolResultStoreOptions) {
    this.artifactStore = options.artifactStore;
    this.privacyTags = options.privacyTags ?? ["tool-result"];
    this.retention = options.retention ?? "session";
  }

  store(options: StoreToolResultOptions): ToolResultReference {
    const id = toolResultRecordId(options.correlation);
    const result = this.artifactStore.putArtifact({
      artifactId: id,
      data: options.content,
      mimeType: "text/plain; charset=utf-8",
      label: `${options.toolName} result`,
      privacyTags: this.privacyTags,
      retention: this.retention,
      metadata: {
        kind: "tool-result",
        toolName: options.toolName,
        correlation: jsonSafeMetadata(options.correlation),
        result: jsonSafeMetadata(options.result),
        originalContentChars: options.content.length,
        evidence: {
          rawSource: "artifact",
          redaction: { state: "none" },
          verifier: { status: "unverified" }
        },
        ...(options.metadata ? { policy: jsonSafeMetadata(options.metadata) } : {})
      }
    });

    if (isPromiseLike(result)) {
      throw new Error("ArtifactToolResultStore requires a synchronous ArtifactStore for ResultPolicy.apply");
    }
    if (!result.ok) {
      throw new Error(`Artifact store unavailable: ${result.reason}`);
    }

    return {
      type: "artifact",
      id: result.reference.artifactId,
      label: result.reference.label ?? `${options.toolName} result`,
      artifact: result.reference,
      metadata: {
        toolName: options.toolName,
        originalContentChars: options.content.length,
        contentHash: result.reference.contentHash.value,
        sizeBytes: result.reference.sizeBytes,
        mimeType: result.reference.mimeType,
        artifactId: result.reference.artifactId,
        evidence: {
          rawSource: "artifact",
          redaction: result.reference.redaction ?? { state: "none" },
          verifier: { status: "unverified" }
        }
      }
    };
  }

  get(id: string): ToolResultRecord | undefined {
    const result = this.artifactStore.readArtifact(id);
    if (isPromiseLike(result)) {
      throw new Error("ArtifactToolResultStore requires a synchronous ArtifactStore for ResultPolicy.apply");
    }
    if (!result.ok || typeof result.data !== "string") {
      return undefined;
    }

    const metadata = result.reference?.metadata ?? {};
    const correlation = metadata.correlation;
    const toolName = metadata.toolName;
    const storedResult = metadata.result;
    if (!isToolCallCorrelation(correlation) || typeof toolName !== "string" || !isToolResult(storedResult)) {
      return undefined;
    }

    return {
      id,
      correlation,
      toolName,
      result: storedResult,
      content: result.data,
      contentHash: result.reference?.contentHash.value ?? simpleContentHash(result.data),
      originalContentChars: typeof metadata.originalContentChars === "number"
        ? metadata.originalContentChars
        : result.data.length,
      createdAt: result.reference?.createdAt ?? new Date(0).toISOString(),
      metadata
    };
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

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return Boolean(value) && typeof (value as Promise<T>).then === "function";
}

function jsonSafeMetadata(value: unknown): JsonObject {
  return normalize(value) as JsonObject;
}

function normalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalize(item));
  }
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      output[key] = normalize((value as Record<string, unknown>)[key]);
    }
    return output;
  }
  return String(value);
}

function isToolCallCorrelation(value: unknown): value is ToolCallCorrelation {
  return Boolean(value) &&
    typeof value === "object" &&
    typeof (value as ToolCallCorrelation).runId === "string" &&
    typeof (value as ToolCallCorrelation).turn === "number" &&
    typeof (value as ToolCallCorrelation).toolCallId === "string" &&
    typeof (value as ToolCallCorrelation).attempt === "number";
}

function isToolResult(value: unknown): value is ToolResult {
  if (!value || typeof value !== "object" || typeof (value as ToolResult).ok !== "boolean") {
    return false;
  }
  if ((value as ToolResult).ok) {
    return typeof (value as { content?: unknown }).content === "string";
  }
  const error = (value as { error?: unknown }).error;
  return Boolean(error) &&
    typeof error === "object" &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string";
}
