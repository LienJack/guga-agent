import { describe, expect, it } from "vitest";
import { AgentEventType, type AgentEvent } from "../contracts/events";
import type {
  DurableEventEnvelope,
  DurableEventUpcaster,
  EventStore
} from "../contracts/persistence";
import {
  computeDurableEventRecordHash,
  createDurableEventEnvelope,
  normalizeDurableJson,
  upcastDurableEventEnvelope,
  validateDurableEventEnvelope
} from "./durable-event-envelope";

describe("durable event envelope", () => {
  it("validates a durable event envelope and preserves the AgentEvent payload", () => {
    const payload: AgentEvent = {
      type: AgentEventType.RunStarted,
      runId: "run-1",
      input: "hello"
    };
    const envelope = createDurableEventEnvelope({
      schemaVersion: 1,
      eventId: "event-1",
      streamId: "session/session-1",
      streamRevision: 0,
      sessionId: "session-1",
      branchId: "main",
      runId: payload.runId,
      turn: 0,
      parentEventId: null,
      previousEventHash: null,
      createdAt: "2026-05-27T00:00:00.000Z",
      actor: { type: "user", id: "user-1" },
      source: { type: "runtime", id: "core" },
      payload
    });

    expect(validateDurableEventEnvelope(envelope)).toMatchObject({ ok: true });
    expect(envelope.eventType).toBe(AgentEventType.RunStarted);
    expect(envelope.payload).toEqual(payload);
    expect(envelope.payloadHash.algorithm).toBe("sha256");
  });

  it("rejects envelopes missing required durable identity fields", () => {
    const incomplete = {
      schemaVersion: 1,
      eventId: "",
      streamId: "session/session-1",
      streamRevision: 0,
      branchId: "main",
      parentEventId: null,
      createdAt: "2026-05-27T00:00:00.000Z",
      actor: { type: "user" },
      source: { type: "runtime" },
      payload: { type: AgentEventType.RunStarted, runId: "run-1", input: "hello" }
    };

    const result = validateDurableEventEnvelope(incomplete);

    expect(result).toMatchObject({ ok: false });
    expect(result.ok === false ? result.issues.map((issue) => issue.path) : []).toEqual(
      expect.arrayContaining(["eventId", "sessionId"])
    );
  });

  it("normalizes non JSON-safe payload details without leaking executable or native objects", () => {
    const signal = new AbortController().signal;
    const normalized = normalizeDurableJson({
      error: new Error("Provider exploded"),
      signal,
      execute() {
        return "nope";
      },
      nested: {
        text: "keep me",
        enabled: true,
        fn: () => "hidden",
        bigint: 10n,
        date: new Date("2026-05-27T00:00:00.000Z")
      }
    });

    expect(JSON.stringify(normalized)).not.toContain("execute");
    expect(JSON.stringify(normalized)).not.toContain("fn");
    expect(normalized).toMatchObject({
      error: { name: "Error", message: "Provider exploded" },
      signal: { type: "AbortSignal", aborted: false },
      nested: { text: "keep me", enabled: true, bigint: "10", date: "2026-05-27T00:00:00.000Z" }
    });
    expect(normalized).not.toBeInstanceOf(Error);
  });

  it("supports append-only expected revision and idempotency result semantics", async () => {
    const payload: AgentEvent = {
      type: AgentEventType.ToolResult,
      runId: "run-1",
      turn: 0,
      call: { id: "call-1", name: "echo", input: { text: "hi" } },
      result: { ok: true, content: "hi" }
    };
    const stored = createDurableEventEnvelope({
      schemaVersion: 1,
      eventId: "event-tool-result",
      streamId: "session/session-1",
      streamRevision: 0,
      sessionId: "session-1",
      branchId: "main",
      runId: payload.runId,
      turn: payload.turn,
      parentEventId: "event-tool-started",
      previousEventHash: null,
      createdAt: "2026-05-27T00:00:00.000Z",
      actor: { type: "tool", id: "echo" },
      source: { type: "runtime", id: "core" },
      idempotency: { key: "tool-result/call-1", scope: "stream" },
      payload
    });
    const attemptedDifferentPayload = createDurableEventEnvelope({
      ...stored,
      eventId: "event-tool-result-conflict",
      payload: { ...payload, result: { ok: true, content: "different" } }
    });
    const events: DurableEventEnvelope[] = [];
    const idempotency = new Map<string, DurableEventEnvelope>();
    const store: EventStore = {
      append(event, options) {
        if (options?.expectedRevision !== "any" && options?.expectedRevision !== "no-stream") {
          const actual = events.length - 1;
          if (options?.expectedRevision !== actual) {
            return Promise.resolve({ ok: false, status: "expected_revision_conflict", expectedRevision: options?.expectedRevision, actualRevision: actual });
          }
        }
        const key = options?.idempotencyKey ?? event.idempotency?.key;
        if (key) {
          const existing = idempotency.get(key);
          if (existing && existing.eventId === event.eventId && existing.payloadHash.value === event.payloadHash.value) {
            return Promise.resolve({ ok: true, status: "idempotent_replay", event: existing, streamRevision: existing.streamRevision });
          }
          if (existing) {
            return Promise.resolve({
              ok: false,
              status: "idempotency_conflict",
              key,
              existingEventId: existing.eventId,
              existingPayloadHash: existing.payloadHash,
              attemptedEventId: event.eventId,
              attemptedPayloadHash: event.payloadHash
            });
          }
        }
        events.push(event);
        if (key) {
          idempotency.set(key, event);
        }
        return Promise.resolve({ ok: true, status: "appended", event, streamRevision: event.streamRevision });
      },
      readStream() {
        return Promise.resolve({ ok: true, events, nextRevision: events.length });
      }
    };

    await expect(store.append(stored, { expectedRevision: "no-stream", idempotencyKey: "tool-result/call-1" })).resolves.toMatchObject({
      ok: true,
      status: "appended",
      streamRevision: 0
    });
    await expect(store.append(stored, { expectedRevision: 0, idempotencyKey: "tool-result/call-1" })).resolves.toMatchObject({
      ok: true,
      status: "idempotent_replay",
      streamRevision: 0
    });
    await expect(store.append(attemptedDifferentPayload, { expectedRevision: 0, idempotencyKey: "tool-result/call-1" })).resolves.toMatchObject({
      ok: false,
      status: "idempotency_conflict",
      existingEventId: "event-tool-result",
      attemptedEventId: "event-tool-result-conflict"
    });
  });

  it("reports unknown schema versions and upcasts old schema views without changing raw record hashes", () => {
    const rawOldEnvelope = createDurableEventEnvelope({
      schemaVersion: 0,
      eventId: "event-old",
      streamId: "session/session-1",
      streamRevision: 0,
      sessionId: "session-1",
      branchId: "main",
      parentEventId: null,
      previousEventHash: null,
      createdAt: "2026-05-27T00:00:00.000Z",
      actor: { type: "runtime", id: "legacy-core" },
      source: { type: "runtime", id: "legacy-core" },
      payload: { type: AgentEventType.RunStarted, runId: "run-old", input: "old" }
    });
    const rawHashBefore = computeDurableEventRecordHash(rawOldEnvelope);
    const upcaster: DurableEventUpcaster = {
      fromSchemaVersion: 0,
      toSchemaVersion: 1,
      upcast(envelope) {
        return {
          ...envelope,
          schemaVersion: 1,
          source: { ...envelope.source, version: "upcasted" }
        };
      }
    };

    expect(upcastDurableEventEnvelope(rawOldEnvelope, { targetSchemaVersion: 2, upcasters: [upcaster] })).toMatchObject({
      ok: false,
      status: "upcaster_missing",
      fromSchemaVersion: 1,
      toSchemaVersion: 2
    });

    const result = upcastDurableEventEnvelope(rawOldEnvelope, { targetSchemaVersion: 1, upcasters: [upcaster] });

    expect(result).toMatchObject({
      ok: true,
      status: "upcasted",
      diagnostics: [{ fromSchemaVersion: 0, toSchemaVersion: 1 }]
    });
    expect(result.ok === true ? result.envelope.schemaVersion : undefined).toBe(1);
    expect(computeDurableEventRecordHash(rawOldEnvelope)).toBe(rawHashBefore);
  });
});
