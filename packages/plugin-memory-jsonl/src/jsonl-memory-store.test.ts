import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { JsonlMemoryStore, type JsonlMemoryRecord } from "./jsonl-memory-store";
import type { MemoryCandidate, MemoryDecision } from "@guga-agent/plugin-memory-candidates";

const tempRoots: string[] = [];

const candidate: MemoryCandidate = {
  id: "candidate-1",
  scope: "project",
  kind: "decision",
  content: "Persist governed memory records as append-only JSONL.",
  confidence: 0.9,
  importance: 0.8,
  status: "proposed",
  createdAt: "2026-05-28T00:00:00.000Z",
  sourceRefs: [{ eventId: "event-1", sessionId: "session-1", turn: 1 }],
  safety: { status: "safe", reasons: [] },
  tags: ["memory"]
};

const decision: MemoryDecision = {
  id: "decision-1",
  candidateId: "candidate-1",
  action: "accept",
  decidedAt: "2026-05-28T00:05:00.000Z",
  reviewer: { type: "user", id: "lien" },
  reason: "Approved for local durable memory testing.",
  itemId: "memory-1"
};

describe("JsonlMemoryStore", () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("appends candidates and decisions, then reopens a governed ledger", async () => {
    const root = await tempRoot();
    const store = new JsonlMemoryStore({ rootDir: root });

    await expect(store.appendCandidate(candidate, { recordedAt: "2026-05-28T00:01:00.000Z" })).resolves.toMatchObject({
      ok: true,
      status: "appended",
      record: { kind: "candidate", recordId: "candidate:candidate-1" }
    });
    await expect(store.appendDecision(decision, { recordedAt: "2026-05-28T00:06:00.000Z" })).resolves.toMatchObject({
      ok: true,
      status: "appended",
      record: { kind: "decision", recordId: "decision:decision-1" }
    });

    await expect(readFile(join(root, "memory.jsonl"), "utf8")).resolves.toMatch(/\n$/);
    const reopened = new JsonlMemoryStore({ rootDir: root });
    const read = await reopened.readRecords();
    expect(read).toMatchObject({
      ok: true,
      records: [{ kind: "candidate" }, { kind: "decision" }],
      candidates: [{ id: "candidate-1" }],
      decisions: [{ id: "decision-1" }]
    });

    await expect(reopened.readGovernanceLedger()).resolves.toMatchObject({
      ok: true,
      ledger: {
        counts: { active: 1, superseded: 0, rejected: 0 },
        items: [{ id: "memory-1", candidateId: "candidate-1", status: "active" }]
      }
    });
  });

  it("rejects invalid candidates and decisions before append", async () => {
    const store = new JsonlMemoryStore({ rootDir: await tempRoot() });

    await expect(store.appendCandidate({ ...candidate, sourceRefs: [] })).resolves.toMatchObject({
      ok: false,
      status: "invalid",
      diagnostics: [expect.objectContaining({ kind: "invalid_record" })]
    });
    await expect(store.appendDecision({ ...decision, id: "", reviewer: { type: "agent", id: "" } })).resolves.toMatchObject({
      ok: false,
      status: "invalid",
      diagnostics: expect.arrayContaining([expect.objectContaining({ kind: "invalid_record" })])
    });
  });

  it("returns partial-tail diagnostics and refuses appends until repaired", async () => {
    const root = await tempRoot();
    const store = new JsonlMemoryStore({ rootDir: root });
    await store.appendCandidate(candidate);
    await appendFile(join(root, "memory.jsonl"), "{\"kind\":\"candidate\"", "utf8");

    const read = await store.readRecords();
    expect(read).toMatchObject({
      ok: true,
      records: [{ kind: "candidate" }],
      diagnostics: [{ kind: "partial_tail", recoverable: true }]
    });
    await expect(store.appendDecision(decision)).resolves.toMatchObject({
      ok: false,
      status: "unavailable",
      reason: expect.stringContaining("partial")
    });
  });

  it("fails on corrupt middle records instead of dropping them", async () => {
    const root = await tempRoot();
    const store = new JsonlMemoryStore({ rootDir: root });
    await store.appendCandidate(candidate);
    await appendFile(join(root, "memory.jsonl"), "{not-json}\n", "utf8");
    await appendFile(join(root, "memory.jsonl"), `${JSON.stringify(recordForDecision(decision))}\n`, "utf8");

    await expect(store.readRecords()).resolves.toMatchObject({
      ok: false,
      status: "corrupt",
      records: [{ kind: "candidate" }],
      diagnostics: [expect.objectContaining({ kind: "invalid_json", recoverable: false })]
    });
  });

  it("diagnoses invalid persisted record shapes", async () => {
    const root = await tempRoot();
    await appendFile(join(root, "memory.jsonl"), `${JSON.stringify({ kind: "candidate", recordId: "", recordedAt: "bad", candidate })}\n`, "utf8");

    await expect(new JsonlMemoryStore({ rootDir: root }).readRecords()).resolves.toMatchObject({
      ok: false,
      status: "corrupt",
      diagnostics: [expect.objectContaining({ kind: "invalid_record", message: expect.stringContaining("recordId") })]
    });
  });
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "guga-memory-jsonl-"));
  tempRoots.push(root);
  return root;
}

function recordForDecision(input: MemoryDecision): JsonlMemoryRecord {
  return {
    kind: "decision",
    recordId: `decision:${input.id}`,
    recordedAt: "2026-05-28T00:06:00.000Z",
    decision: input
  };
}
