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

const userCandidate: MemoryCandidate = {
  ...candidate,
  id: "candidate-user",
  scope: "user",
  content: "Remember that local memory retrieval must stay scope bounded.",
  createdAt: "2026-05-28T00:10:00.000Z",
  sourceRefs: [{ eventId: "event-user", sessionId: "session-1", turn: 2 }]
};

const userDecision: MemoryDecision = {
  ...decision,
  id: "decision-user",
  candidateId: "candidate-user",
  itemId: "memory-user",
  decidedAt: "2026-05-28T00:11:00.000Z"
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

    await expect(reopened.readReviewReport()).resolves.toMatchObject({
      ok: true,
      diagnostics: [],
      report: {
        counts: {
          candidates: 1,
          decisions: 1,
          active: 1,
          superseded: 0,
          rejected: 0,
          undecided: 0,
          unsafe: 0,
          diagnostics: 0
        },
        activeItems: [{ id: "memory-1", candidateId: "candidate-1" }]
      }
    });
    await expect(reopened.readReviewHealth()).resolves.toMatchObject({
      ok: true,
      diagnostics: [],
      report: { counts: { active: 1, undecided: 0, unsafe: 0, diagnostics: 0 } },
      health: {
        status: "healthy",
        reasons: [],
        counts: { active: 1, undecided: 0, unsafe: 0, diagnostics: 0 }
      }
    });
    await expect(reopened.readReviewHealthMarkdown({ title: "Durable Memory Health" })).resolves.toMatchObject({
      ok: true,
      diagnostics: [],
      report: { counts: { active: 1, undecided: 0, unsafe: 0, diagnostics: 0 } },
      health: { status: "healthy", reasons: [] },
      markdown: [
        "## Durable Memory Health",
        "",
        "- status: healthy",
        "- active: 1",
        "- undecided: 0",
        "- unsafe: 0",
        "- diagnostics: 0",
        "- reasons: none"
      ].join("\n")
    });
    await expect(reopened.readAuditSnapshot({ title: "Durable Memory Snapshot", maxContentChars: 36 })).resolves.toMatchObject({
      ok: true,
      diagnostics: [],
      ledger: { counts: { active: 1, superseded: 0, rejected: 0 } },
      report: { counts: { active: 1, undecided: 0, unsafe: 0, diagnostics: 0 } },
      health: {
        status: "healthy",
        reasons: [],
        counts: { active: 1, undecided: 0, unsafe: 0, diagnostics: 0 }
      },
      markdown: expect.stringContaining("# Durable Memory Snapshot")
    });
    const snapshot = await reopened.readAuditSnapshot({ title: "Durable Memory Snapshot", maxContentChars: 36 });
    expect(snapshot).toMatchObject({ ok: true });
    if (snapshot.ok) {
      expect(snapshot.markdown).toContain("memory-1");
      expect(snapshot.markdown).toContain("Persist governed memory records a...");
    }
    await expect(reopened.readRetrieval("append jsonl memory", { scope: "project" })).resolves.toMatchObject({
      ok: true,
      diagnostics: [],
      response: {
        diagnostics: [],
        results: [
          {
            item: { id: "memory-1", candidateId: "candidate-1" },
            matchedTerms: expect.arrayContaining(["jsonl", "memory"])
          }
        ]
      }
    });
    await expect(reopened.readCuratedMarkdown({ title: "Durable Curated Memory", includeSourceRefs: true, includeTags: true, maxContentChars: 36 })).resolves.toMatchObject({
      ok: true,
      diagnostics: [],
      ledger: {
        items: [{ id: "memory-1", candidateId: "candidate-1" }]
      },
      markdown: expect.stringContaining("# Durable Curated Memory")
    });
    const curated = await reopened.readCuratedMarkdown({ title: "Durable Curated Memory", includeSourceRefs: true, includeTags: true, maxContentChars: 36 });
    expect(curated).toMatchObject({ ok: true });
    if (curated.ok) {
      expect(curated.markdown).toContain("## project / decision");
      expect(curated.markdown).toContain("Persist governed memory records a...");
      expect(curated.markdown).toContain("tags: memory");
      expect(curated.markdown).toContain("sources: event-1");
    }

    await expect(reopened.readReviewMarkdown({ title: "Durable Memory Audit", maxContentChars: 36 })).resolves.toMatchObject({
      ok: true,
      diagnostics: [],
      report: {
        counts: { active: 1, undecided: 0 }
      },
      markdown: expect.stringContaining("# Durable Memory Audit")
    });
    const markdown = await reopened.readReviewMarkdown({ title: "Durable Memory Audit", maxContentChars: 36 });
    expect(markdown).toMatchObject({ ok: true });
    if (markdown.ok) {
      expect(markdown.markdown).toContain("memory-1");
      expect(markdown.markdown).toContain("Persist governed memory records a...");
    }
  });

  it("retrieves only from the requested memory scope", async () => {
    const root = await tempRoot();
    const store = new JsonlMemoryStore({ rootDir: root });
    await store.appendCandidate(candidate);
    await store.appendDecision(decision);
    await store.appendCandidate(userCandidate);
    await store.appendDecision(userDecision);

    const project = await store.readRetrieval("memory retrieval", { scope: "project", maxResults: 5 });
    expect(project).toMatchObject({ ok: true });
    if (project.ok) {
      expect(project.response.results.map((result) => result.item.id)).toEqual(["memory-1"]);
    }

    const user = await store.readRetrieval("memory retrieval", { scope: "user", maxResults: 5 });
    expect(user).toMatchObject({ ok: true });
    if (user.ok) {
      expect(user.response.results.map((result) => result.item.id)).toEqual(["memory-user"]);
    }
  });

  it("returns retrieval diagnostics without treating query issues as JSONL failures", async () => {
    const store = new JsonlMemoryStore({ rootDir: await tempRoot() });

    await expect(store.readRetrieval("   ", { scope: "project" })).resolves.toMatchObject({
      ok: true,
      diagnostics: [],
      response: {
        results: [],
        diagnostics: [{ code: "MEMORY_RETRIEVAL_QUERY_REQUIRED" }]
      }
    });
  });

  it("renders curated Markdown with scope and kind filters", async () => {
    const root = await tempRoot();
    const store = new JsonlMemoryStore({ rootDir: root });
    await store.appendCandidate(candidate);
    await store.appendDecision(decision);
    await store.appendCandidate(userCandidate);
    await store.appendDecision(userDecision);

    const rendered = await store.readCuratedMarkdown({ scopes: ["user"], kinds: ["decision"], includeTags: true });
    expect(rendered).toMatchObject({ ok: true });
    if (rendered.ok) {
      expect(rendered.markdown).toContain("## user / decision");
      expect(rendered.markdown).toContain("local memory retrieval");
      expect(rendered.markdown).not.toContain("append-only JSONL");
    }
  });

  it("renders curated Markdown empty state when no active safe items exist", async () => {
    const store = new JsonlMemoryStore({ rootDir: await tempRoot() });

    await expect(store.readCuratedMarkdown({ title: "Durable Curated Memory" })).resolves.toMatchObject({
      ok: true,
      diagnostics: [],
      ledger: { counts: { active: 0, superseded: 0, rejected: 0 } },
      markdown: "# Durable Curated Memory\n\nNo active safe memory items."
    });
    await expect(store.readReviewHealthMarkdown()).resolves.toMatchObject({
      ok: true,
      diagnostics: [],
      health: { status: "healthy", reasons: [] },
      markdown: expect.stringContaining("- status: healthy")
    });
    await expect(store.readAuditSnapshot({ title: "Durable Memory Snapshot" })).resolves.toMatchObject({
      ok: true,
      diagnostics: [],
      ledger: { counts: { active: 0, superseded: 0, rejected: 0 } },
      report: { counts: { candidates: 0, decisions: 0, active: 0, undecided: 0 } },
      health: { status: "healthy", reasons: [] },
      markdown: expect.stringContaining("# Durable Memory Snapshot")
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
    await expect(store.readReviewReport()).resolves.toMatchObject({
      ok: true,
      diagnostics: [{ kind: "partial_tail", recoverable: true }],
      report: {
        counts: {
          candidates: 1,
          decisions: 0,
          active: 0,
          undecided: 1
        },
        undecidedCandidates: [{ id: "candidate-1" }]
      }
    });
    await expect(store.readReviewHealth()).resolves.toMatchObject({
      ok: true,
      diagnostics: [{ kind: "partial_tail", recoverable: true }],
      health: {
        status: "needs_review",
        reasons: ["undecided-candidates"],
        counts: { active: 0, undecided: 1, unsafe: 0, diagnostics: 0 }
      }
    });
    await expect(store.readReviewHealthMarkdown()).resolves.toMatchObject({
      ok: true,
      diagnostics: [{ kind: "partial_tail", recoverable: true }],
      health: {
        status: "needs_review",
        reasons: ["undecided-candidates"]
      },
      markdown: expect.stringContaining("- status: needs_review")
    });
    await expect(store.readAuditSnapshot()).resolves.toMatchObject({
      ok: true,
      diagnostics: [{ kind: "partial_tail", recoverable: true }],
      report: {
        counts: { candidates: 1, decisions: 0, active: 0, undecided: 1 },
        undecidedCandidates: [{ id: "candidate-1" }]
      },
      health: {
        status: "needs_review",
        reasons: ["undecided-candidates"]
      },
      markdown: expect.stringContaining("candidate-1")
    });
    await expect(store.readReviewMarkdown()).resolves.toMatchObject({
      ok: true,
      diagnostics: [{ kind: "partial_tail", recoverable: true }],
      markdown: expect.stringContaining("candidate-1")
    });
    await expect(store.readCuratedMarkdown()).resolves.toMatchObject({
      ok: true,
      diagnostics: [{ kind: "partial_tail", recoverable: true }],
      markdown: "# Curated Memory\n\nNo active safe memory items."
    });
    await expect(store.readRetrieval("append jsonl memory", { scope: "project" })).resolves.toMatchObject({
      ok: true,
      diagnostics: [{ kind: "partial_tail", recoverable: true }],
      response: {
        diagnostics: [],
        results: []
      }
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
    await expect(store.readReviewReport()).resolves.toMatchObject({
      ok: false,
      status: "corrupt",
      diagnostics: [expect.objectContaining({ kind: "invalid_json", recoverable: false })]
    });
    await expect(store.readReviewMarkdown()).resolves.toMatchObject({
      ok: false,
      status: "corrupt",
      diagnostics: [expect.objectContaining({ kind: "invalid_json", recoverable: false })]
    });
    await expect(store.readReviewHealth()).resolves.toMatchObject({
      ok: false,
      status: "corrupt",
      diagnostics: [expect.objectContaining({ kind: "invalid_json", recoverable: false })]
    });
    await expect(store.readReviewHealthMarkdown()).resolves.toMatchObject({
      ok: false,
      status: "corrupt",
      diagnostics: [expect.objectContaining({ kind: "invalid_json", recoverable: false })]
    });
    await expect(store.readAuditSnapshot()).resolves.toMatchObject({
      ok: false,
      status: "corrupt",
      diagnostics: [expect.objectContaining({ kind: "invalid_json", recoverable: false })]
    });
    await expect(store.readCuratedMarkdown()).resolves.toMatchObject({
      ok: false,
      status: "corrupt",
      diagnostics: [expect.objectContaining({ kind: "invalid_json", recoverable: false })]
    });
    await expect(store.readRetrieval("append jsonl memory", { scope: "project" })).resolves.toMatchObject({
      ok: false,
      status: "corrupt",
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
