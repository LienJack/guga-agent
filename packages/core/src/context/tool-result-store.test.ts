import { describe, expect, it } from "vitest";
import type { ArtifactStore, PutArtifactOptions, ReadArtifactResult } from "../contracts/persistence";
import { ArtifactToolResultStore, InMemoryToolResultStore, toolResultRecordId } from "./tool-result-store";

describe("InMemoryToolResultStore", () => {
  it("stores raw tool result content behind a stable correlation key", () => {
    const store = new InMemoryToolResultStore();
    const correlation = {
      runId: "run-1",
      turn: 2,
      toolCallId: "call-1",
      attempt: 1,
      batchId: "batch-1"
    };
    const reference = store.store({
      correlation,
      toolName: "shell_exec",
      result: { ok: true, content: "full output" },
      content: "full output"
    });

    expect(reference.id).toBe("tool-result-run-1-turn-2-attempt-1-batch-1-call-1");
    expect(store.get(reference.id)).toMatchObject({
      id: reference.id,
      correlation,
      toolName: "shell_exec",
      content: "full output",
      originalContentChars: 11
    });
    expect(reference.metadata).toMatchObject({
      evidence: {
        rawSource: "buffer",
        redaction: { state: "none" },
        verifier: { status: "unverified" }
      }
    });
  });

  it("includes run, turn, attempt, batch, and call id in record ids", () => {
    expect(toolResultRecordId({
      runId: "run",
      turn: 0,
      attempt: 3,
      batchId: "batch",
      toolCallId: "call"
    })).toBe("tool-result-run-turn-0-attempt-3-batch-call");
  });
});

describe("ArtifactToolResultStore", () => {
  it("stores tool result content through an ArtifactStore reference", () => {
    const artifactStore = new FakeArtifactStore();
    const store = new ArtifactToolResultStore({ artifactStore, privacyTags: ["tool-result"], retention: "session" });
    const correlation = {
      runId: "run-2",
      turn: 1,
      toolCallId: "call-2",
      attempt: 1
    };

    const reference = store.store({
      correlation,
      toolName: "fs_read",
      result: { ok: true, content: "full artifact output" },
      content: "full artifact output"
    });

    expect(reference).toMatchObject({
      type: "artifact",
      id: "tool-result-run-2-turn-1-attempt-1-call-2",
      artifact: {
        artifactId: "tool-result-run-2-turn-1-attempt-1-call-2",
        mimeType: "text/plain; charset=utf-8",
        privacyTags: ["tool-result"],
        retention: "session"
      },
      metadata: {
        contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        sizeBytes: 20,
        evidence: {
          rawSource: "artifact",
          redaction: { state: "none" },
          verifier: { status: "unverified" }
        }
      }
    });
    expect(store.get(reference.id)).toMatchObject({
      id: reference.id,
      correlation,
      toolName: "fs_read",
      content: "full artifact output",
      originalContentChars: 20
    });
  });
});

class FakeArtifactStore implements ArtifactStore {
  private readonly records = new Map<string, { data: string; reference: NonNullable<ReadArtifactResult & { ok: true }>["reference"] }>();

  putArtifact(options: PutArtifactOptions) {
    const artifactId = options.artifactId ?? "generated";
    const data = typeof options.data === "string" ? options.data : JSON.stringify(options.data);
    const reference = {
      artifactId,
      contentHash: { algorithm: "sha256" as const, value: "a".repeat(64) },
      sizeBytes: data.length,
      mimeType: options.mimeType,
      createdAt: "2026-05-27T00:00:00.000Z",
      ...(options.label ? { label: options.label } : {}),
      ...(options.privacyTags ? { privacyTags: options.privacyTags } : {}),
      ...(options.retention ? { retention: options.retention } : {}),
      redaction: { state: "none" as const },
      ...(options.metadata ? { metadata: options.metadata } : {})
    };
    this.records.set(artifactId, { data, reference });
    return { ok: true as const, reference };
  }

  readArtifact(artifactId: string): ReadArtifactResult {
    const record = this.records.get(artifactId);
    if (!record) {
      return {
        ok: false,
        status: "not_found",
        diagnostic: { kind: "artifact_missing", message: "missing", recoverable: true }
      };
    }
    return { ok: true, data: record.data, reference: record.reference };
  }

  tombstoneArtifact(artifactId: string) {
    const record = this.records.get(artifactId);
    if (!record) {
      return {
        ok: false as const,
        status: "not_found" as const,
        diagnostic: { kind: "artifact_missing" as const, message: "missing", recoverable: true }
      };
    }
    return { ok: true as const, reference: record.reference };
  }
}
