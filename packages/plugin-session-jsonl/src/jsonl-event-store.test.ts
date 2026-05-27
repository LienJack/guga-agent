import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  AgentEventType,
  computeDurableEventRecordHash,
  createDurableEventEnvelope,
  type AgentEvent,
  type DurableEventEnvelope
} from "@guga-agent/core";
import { JsonlEventStore } from "./jsonl-event-store";

const tempRoots: string[] = [];

describe("JsonlEventStore", () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("appends newline-terminated durable events and reopens them in revision order", async () => {
    const root = await tempRoot();
    const store = new JsonlEventStore({ rootDir: root });
    const first = eventEnvelope({ eventId: "event-1", revision: 0, previousEventHash: null });
    const firstAppend = await store.append(first, { expectedRevision: "no-stream" });
    const second = eventEnvelope({
      eventId: "event-2",
      revision: 1,
      parentEventId: first.eventId,
      previousEventHash: hash(first),
      payload: { type: AgentEventType.RunFinished, runId: "run-1", status: "completed" }
    });

    await expect(store.append(second, { expectedRevision: 0 })).resolves.toMatchObject({
      ok: true,
      status: "appended",
      streamRevision: 1
    });
    expect(firstAppend).toMatchObject({ ok: true, status: "appended", streamRevision: 0 });

    const reopened = new JsonlEventStore({ rootDir: root });
    await expect(reopened.readStream("session/session-1/main")).resolves.toMatchObject({
      ok: true,
      events: [
        { eventId: "event-1", streamRevision: 0 },
        { eventId: "event-2", streamRevision: 1 }
      ],
      nextRevision: 2
    });
    await expect(readFile(join(root, "events", "session__session-1__main.jsonl"), "utf8")).resolves.toMatch(/\n$/);
  });

  it("persists idempotency keys across process restart and rejects changed retry payloads", async () => {
    const root = await tempRoot();
    const first = eventEnvelope({ eventId: "event-idempotent", revision: 0, idempotencyKey: "tool-result/call-1" });
    const changed = eventEnvelope({
      eventId: "event-idempotent-changed",
      revision: 1,
      idempotencyKey: "tool-result/call-1",
      payload: { type: AgentEventType.ToolResult, runId: "run-1", turn: 0, call: { id: "call-1", name: "echo", input: {} }, result: { ok: true, content: "changed" } }
    });

    await new JsonlEventStore({ rootDir: root }).append(first, {
      expectedRevision: "no-stream",
      idempotencyKey: "tool-result/call-1"
    });
    const reopened = new JsonlEventStore({ rootDir: root });

    await expect(reopened.append(first, { expectedRevision: 0, idempotencyKey: "tool-result/call-1" })).resolves.toMatchObject({
      ok: true,
      status: "idempotent_replay",
      event: { eventId: "event-idempotent" },
      streamRevision: 0
    });
    await expect(reopened.append(changed, { expectedRevision: 0, idempotencyKey: "tool-result/call-1" })).resolves.toMatchObject({
      ok: false,
      status: "idempotency_conflict",
      key: "tool-result/call-1",
      existingEventId: "event-idempotent",
      attemptedEventId: "event-idempotent-changed"
    });
  });

  it("replays idempotent appends when the key and payload hash match even with a regenerated event id", async () => {
    const root = await tempRoot();
    const payload = { type: AgentEventType.ToolResult, runId: "run-1", turn: 0, call: { id: "call-1", name: "echo", input: {} }, result: { ok: true, content: "same" } } satisfies AgentEvent;
    const stored = eventEnvelope({ eventId: "event-original", revision: 0, idempotencyKey: "tool-result/call-1", payload });
    const regenerated = eventEnvelope({ eventId: "event-regenerated", revision: 1, idempotencyKey: "tool-result/call-1", payload });

    await new JsonlEventStore({ rootDir: root }).append(stored, {
      expectedRevision: "no-stream",
      idempotencyKey: "tool-result/call-1"
    });

    await expect(new JsonlEventStore({ rootDir: root }).append(regenerated, {
      expectedRevision: 0,
      idempotencyKey: "tool-result/call-1"
    })).resolves.toMatchObject({
      ok: true,
      status: "idempotent_replay",
      event: { eventId: "event-original", streamRevision: 0 },
      streamRevision: 0
    });
    await expect(new JsonlEventStore({ rootDir: root }).readStream("session/session-1/main")).resolves.toMatchObject({
      ok: true,
      events: [{ eventId: "event-original" }],
      nextRevision: 1
    });
  });

  it("returns expected revision conflicts without appending out of order", async () => {
    const root = await tempRoot();
    const store = new JsonlEventStore({ rootDir: root });
    await store.append(eventEnvelope({ eventId: "event-1", revision: 0 }), { expectedRevision: "no-stream" });

    await expect(store.append(eventEnvelope({ eventId: "event-2", revision: 1 }), { expectedRevision: "no-stream" })).resolves.toMatchObject({
      ok: false,
      status: "expected_revision_conflict",
      expectedRevision: "no-stream",
      actualRevision: 0
    });
    await expect(store.readStream("session/session-1/main")).resolves.toMatchObject({
      ok: true,
      events: [{ eventId: "event-1" }]
    });
  });

  it("returns a longest valid prefix plus diagnostic for partial final lines", async () => {
    const root = await tempRoot();
    const store = new JsonlEventStore({ rootDir: root });
    const first = eventEnvelope({ eventId: "event-1", revision: 0 });
    await store.append(first, { expectedRevision: "no-stream" });
    await appendRawEventLine(root, "session/session-1/main", "{\"eventId\":\"partial\"");

    await expect(new JsonlEventStore({ rootDir: root }).readStream("session/session-1/main")).resolves.toMatchObject({
      ok: true,
      events: [{ eventId: "event-1" }],
      nextRevision: 1,
      diagnostics: [
        {
          kind: "partial_tail",
          recoverable: true
        }
      ]
    });
  });

  it("refuses appends to streams with unrepaired partial final lines", async () => {
    const root = await tempRoot();
    const store = new JsonlEventStore({ rootDir: root });
    const first = eventEnvelope({ eventId: "event-1", revision: 0 });
    const second = eventEnvelope({
      eventId: "event-2",
      revision: 1,
      parentEventId: first.eventId,
      previousEventHash: hash(first),
      payload: { type: AgentEventType.RunFinished, runId: "run-1", status: "completed" }
    });
    await store.append(first, { expectedRevision: "no-stream" });
    await appendRawEventLine(root, "session/session-1/main", "{\"eventId\":\"partial\"");

    await expect(new JsonlEventStore({ rootDir: root }).append(second, { expectedRevision: 0 })).resolves.toMatchObject({
      ok: false,
      status: "unavailable",
      reason: expect.stringContaining("unrepaired partial JSONL tail")
    });

    const persisted = await readFile(join(root, "events", "session__session-1__main.jsonl"), "utf8");
    expect(persisted).toMatch(/\{"eventId":"partial"$/);
    expect(persisted).not.toContain("event-2");
  });

  it("blocks automatic resume on corrupt middle records and hash chain mismatches", async () => {
    const root = await tempRoot();
    const store = new JsonlEventStore({ rootDir: root });
    const first = eventEnvelope({ eventId: "event-1", revision: 0, previousEventHash: null });
    const second = eventEnvelope({
      eventId: "event-2",
      revision: 1,
      parentEventId: "event-1",
      previousEventHash: hash(first),
      payload: { type: AgentEventType.RunFinished, runId: "run-1", status: "completed" }
    });
    await store.append(first, { expectedRevision: "no-stream" });
    await appendRawEventLine(root, "session/session-1/main", "{not-json}\n");
    await appendRawEventLine(root, "session/session-1/main", JSON.stringify({ kind: "event", envelope: second }) + "\n");

    await expect(new JsonlEventStore({ rootDir: root }).readStream("session/session-1/main")).resolves.toMatchObject({
      ok: false,
      status: "corrupt",
      diagnostics: [expect.objectContaining({ kind: "middle_corruption", recoverable: false })]
    });

    const hashRoot = await tempRoot();
    const hashStore = new JsonlEventStore({ rootDir: hashRoot });
    await hashStore.append(first, { expectedRevision: "no-stream" });
    await appendRawEventLine(
      hashRoot,
      "session/session-1/main",
      JSON.stringify({ kind: "event", envelope: { ...second, previousEventHash: { algorithm: "sha256", value: "bad" } } }) + "\n"
    );

    await expect(new JsonlEventStore({ rootDir: hashRoot }).readStream("session/session-1/main")).resolves.toMatchObject({
      ok: false,
      status: "corrupt",
      diagnostics: [expect.objectContaining({ kind: "hash_chain_mismatch", recoverable: false, eventId: "event-2" })]
    });
  });
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "guga-jsonl-events-"));
  tempRoots.push(root);
  return root;
}

function eventEnvelope(options: {
  eventId: string;
  revision: number;
  previousEventHash?: DurableEventEnvelope["previousEventHash"];
  parentEventId?: string | null;
  idempotencyKey?: string;
  payload?: AgentEvent;
}): DurableEventEnvelope {
  const payload = options.payload ?? { type: AgentEventType.RunStarted, runId: "run-1", input: options.eventId };
  return createDurableEventEnvelope({
    schemaVersion: 1,
    eventId: options.eventId,
    streamId: "session/session-1/main",
    streamRevision: options.revision,
    sessionId: "session-1",
    branchId: "main",
    runId: payload.runId,
    turn: "turn" in payload ? payload.turn : undefined,
    parentEventId: options.parentEventId ?? null,
    previousEventHash: options.previousEventHash ?? null,
    createdAt: `2026-05-27T00:00:0${options.revision}.000Z`,
    actor: { type: "runtime", id: "core" },
    source: { type: "runtime", id: "core" },
    ...(options.idempotencyKey ? { idempotency: { key: options.idempotencyKey, scope: "stream" } } : {}),
    payload
  });
}

function hash(envelope: DurableEventEnvelope): DurableEventEnvelope["previousEventHash"] {
  return { algorithm: "sha256", value: computeDurableEventRecordHash(envelope) };
}

async function appendRawEventLine(root: string, streamId: string, line: string): Promise<void> {
  const { appendFile, mkdir } = await import("node:fs/promises");
  await mkdir(join(root, "events"), { recursive: true });
  await appendFile(join(root, "events", `${streamId.replaceAll("/", "__")}.jsonl`), line, "utf8");
}
