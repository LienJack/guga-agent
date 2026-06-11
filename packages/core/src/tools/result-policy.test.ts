import { describe, expect, it } from "vitest";
import { AgentEventType } from "../contracts/events";
import type { ArtifactStore, PutArtifactOptions, ReadArtifactResult } from "../contracts/persistence";
import type { ToolCallCorrelation } from "../contracts/tool-runtime";
import type { ToolResult } from "../contracts/tools";
import { ArtifactToolResultStore, InMemoryToolResultStore } from "../context/tool-result-store";
import { EventBus } from "../events/event-bus";
import { ResultPolicy } from "./result-policy";

const correlation: ToolCallCorrelation = {
  runId: "run-result",
  turn: 0,
  toolCallId: "call-result",
  attempt: 1,
  batchId: "batch-result"
};
const call = { id: correlation.toolCallId, name: "read_file", input: { path: "README.md" } };

describe("ResultPolicy", () => {
  it("passes small successful results through unchanged", () => {
    const policy = new ResultPolicy();
    const result: ToolResult = { ok: true, content: "small" };

    expect(policy.apply({ call, result, correlation })).toEqual(result);
  });

  it("truncates oversized successful content while preserving success status", () => {
    const eventBus = new EventBus();
    const policy = new ResultPolicy({ eventBus, defaultBudget: { maxContentChars: 5, strategy: "truncate" } });

    const result = policy.apply({
      call,
      correlation,
      result: { ok: true, content: "0123456789" }
    });

    expect(result).toMatchObject({
      ok: true,
      content: expect.stringContaining("Tool output preview omitted"),
      budget: {
        applied: true,
        originalContentChars: 10,
        reference: expect.objectContaining({ id: expect.stringContaining("tool-result-run-result") }),
        view: {
          llmPreview: expect.stringContaining("01234"),
          uiProjection: expect.stringContaining("01234"),
          auditMetadata: expect.objectContaining({
            rawAvailable: true,
            redaction: { state: "none" },
            verifier: { status: "unverified" }
          })
        },
        evidence: {
          raw: expect.objectContaining({ source: "buffer", available: true, originalContentChars: 10 }),
          model: expect.objectContaining({ preview: expect.stringContaining("01234") }),
          ui: expect.objectContaining({ projection: expect.stringContaining("01234") }),
          audit: expect.objectContaining({
            redaction: { state: "none" },
            verifier: { status: "unverified" }
          })
        },
        redaction: { state: "none" },
        verifier: { status: "unverified" }
      }
    });
    expect(eventBus.events).toContainEqual(expect.objectContaining({ type: AgentEventType.ToolResultBudgeted }));
  });

  it("truncates oversized failed details while preserving failure status", () => {
    const policy = new ResultPolicy({ defaultBudget: { maxContentChars: 12, strategy: "truncate" } });

    const result = policy.apply({
      call,
      correlation,
      result: {
        ok: false,
        error: { code: "TOOL_FAILED", message: "short", details: "01234567890123456789" }
      }
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TOOL_FAILED");
      expect(result.error.details).toMatchObject({
        truncated: true,
        originalContentChars: 20,
        content: expect.stringContaining("012345678901"),
        reference: expect.objectContaining({ type: "buffer" })
      });
    }
  });

  it("stores raw output and creates budget metadata with references when reference strategy is selected", () => {
    const store = new InMemoryToolResultStore();
    const policy = new ResultPolicy({ store, defaultBudget: { maxContentChars: 4, strategy: "reference" } });

    const result = policy.apply({
      call,
      correlation,
      result: { ok: true, content: "abcdef" }
    });

    expect(result).toMatchObject({
      ok: true,
      content: expect.stringContaining("Tool output stored as reference"),
      budget: {
        applied: true,
        reference: { type: "buffer", id: "tool-result-run-result-turn-0-attempt-1-batch-result-call-result" },
        rereadInstruction: expect.stringContaining("tool-result-run-result")
      }
    });
    expect(store.get("tool-result-run-result-turn-0-attempt-1-batch-result-call-result")?.content).toBe("abcdef");
  });

  it("uses artifact-backed references without changing model-visible preview behavior", () => {
    const eventBus = new EventBus();
    const store = new ArtifactToolResultStore({ artifactStore: new FakeArtifactStore() });
    const policy = new ResultPolicy({ eventBus, store, defaultBudget: { maxContentChars: 4, strategy: "truncate" } });

    const result = policy.apply({
      call,
      correlation,
      result: { ok: true, content: "abcdef" }
    });

    expect(result).toMatchObject({
      ok: true,
      content: expect.stringContaining("abcd"),
      budget: {
        applied: true,
        reference: {
          type: "artifact",
          id: "tool-result-run-result-turn-0-attempt-1-batch-result-call-result",
          artifact: {
            artifactId: "tool-result-run-result-turn-0-attempt-1-batch-result-call-result",
            sizeBytes: 6,
            mimeType: "text/plain; charset=utf-8"
          }
        },
        view: {
          llmPreview: expect.stringContaining("abcd"),
          uiProjection: expect.stringContaining("abcd"),
          auditMetadata: {
            strategy: "truncate",
            referenceType: "artifact",
            providerRawPersistence: "descriptor-only",
            rawAvailable: true,
            redaction: { state: "none" },
            verifier: { status: "unverified" },
            artifact: {
              artifactId: "tool-result-run-result-turn-0-attempt-1-batch-result-call-result",
              sizeBytes: 6
            }
          }
        },
        evidence: {
          raw: expect.objectContaining({
            source: "artifact",
            available: true,
            contentHash: "b".repeat(64)
          }),
          audit: expect.objectContaining({
            redaction: { state: "none" },
            verifier: { status: "unverified" }
          })
        }
      }
    });
    expect(result.content).not.toContain("abcdef");
    expect(eventBus.events).toContainEqual(expect.objectContaining({
      type: AgentEventType.ToolResultBudgeted,
      result: expect.objectContaining({
        budget: expect.objectContaining({
          reference: expect.objectContaining({ type: "artifact" })
        })
      })
    }));
  });

  it("builds synthetic cancelled, skipped, denied, and timed-out results", () => {
    const policy = new ResultPolicy();

    expect(policy.synthetic("cancelled", "run interrupted")).toMatchObject({
      ok: false,
      error: { code: "TOOL_CANCELLED", message: "run interrupted" }
    });
    expect(policy.synthetic("skipped", "batch downgraded")).toMatchObject({
      ok: false,
      error: { code: "TOOL_SKIPPED" }
    });
    expect(policy.synthetic("denied", "permission denied")).toMatchObject({
      ok: false,
      error: { code: "TOOL_PERMISSION_DENIED" }
    });
    expect(policy.synthetic("timeout", "tool timed out")).toMatchObject({
      ok: false,
      error: { code: "TOOL_TIMEOUT" }
    });
  });
});

class FakeArtifactStore implements ArtifactStore {
  putArtifact(options: PutArtifactOptions) {
    const data = typeof options.data === "string" ? options.data : JSON.stringify(options.data);
    const reference = {
      artifactId: options.artifactId ?? "generated",
      contentHash: { algorithm: "sha256" as const, value: "b".repeat(64) },
      sizeBytes: data.length,
      mimeType: options.mimeType,
      createdAt: "2026-05-27T00:00:00.000Z",
      redaction: { state: "none" as const },
      ...(options.metadata ? { metadata: options.metadata } : {})
    };
    return { ok: true as const, reference };
  }

  readArtifact(): ReadArtifactResult {
    return {
      ok: false,
      status: "not_found",
      diagnostic: { kind: "artifact_missing", message: "missing", recoverable: true }
    };
  }

  tombstoneArtifact() {
    return {
      ok: false as const,
      status: "not_found" as const,
      diagnostic: { kind: "artifact_missing" as const, message: "missing", recoverable: true }
    };
  }
}
