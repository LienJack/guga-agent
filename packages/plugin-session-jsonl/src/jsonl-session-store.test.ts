import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { JsonlSessionStore } from "./jsonl-session-store";

const tempRoots: string[] = [];

describe("JsonlSessionStore", () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("persists session creation and active leaf movement as append-only facts across restart", async () => {
    const root = await tempRoot();
    const store = new JsonlSessionStore({ rootDir: root, now: clock(["2026-05-27T00:00:00.000Z", "2026-05-27T00:00:01.000Z"]) });

    await expect(store.createSession({ sessionId: "session-1", branchId: "main", title: "Session" })).resolves.toMatchObject({
      ok: true,
      session: { id: "session-1", activeBranchId: "main", rootBranchId: "main", title: "Session" },
      branch: { id: "main", createdFrom: { type: "root" } }
    });
    await expect(store.setActiveLeaf({
      sessionId: "session-1",
      branchId: "main",
      eventId: "event-2",
      reason: "host-selected"
    })).resolves.toMatchObject({
      ok: true,
      leaf: { sessionId: "session-1", branchId: "main", eventId: "event-2", reason: "host-selected" }
    });

    await expect(new JsonlSessionStore({ rootDir: root }).getSessionTree("session-1")).resolves.toMatchObject({
      ok: true,
      session: { id: "session-1", activeBranchId: "main", updatedAt: "2026-05-27T00:00:01.000Z" },
      branches: [{ id: "main", visibleEventIds: ["event-2"] }],
      activeLeaf: { branchId: "main", eventId: "event-2" }
    });
  });

  it("forks from visible historical events without mutating the source branch", async () => {
    const root = await tempRoot();
    const store = new JsonlSessionStore({ rootDir: root });
    await store.createSession({ sessionId: "session-1", branchId: "main" });
    await store.setActiveLeaf({ sessionId: "session-1", branchId: "main", eventId: "event-1", reason: "host-selected" });
    await store.setActiveLeaf({ sessionId: "session-1", branchId: "main", eventId: "event-2", reason: "host-selected" });

    await expect(store.forkBranch({
      sessionId: "session-1",
      branchId: "branch-fork",
      fromBranchId: "main",
      fromEventId: "event-1",
      metadata: { reason: "try-again" }
    })).resolves.toMatchObject({
      ok: true,
      branch: {
        id: "branch-fork",
        parentBranchId: "main",
        createdFrom: { type: "event", branchId: "main", eventId: "event-1", visibility: "visible" },
        visibleEventIds: ["event-1"]
      }
    });
    await expect(store.getSessionTree("session-1")).resolves.toMatchObject({
      ok: true,
      session: { activeBranchId: "branch-fork" },
      branches: expect.arrayContaining([
        expect.objectContaining({ id: "main", visibleEventIds: ["event-1", "event-2"] }),
        expect.objectContaining({ id: "branch-fork", visibleEventIds: ["event-1"] })
      ]),
      activeLeaf: { branchId: "branch-fork", eventId: "event-1", reason: "fork-created" }
    });
  });

  it("rejects duplicate branches, non-visible fork sources, invalid active leaves, and cyclic lineage", async () => {
    const root = await tempRoot();
    const store = new JsonlSessionStore({ rootDir: root });
    await store.createSession({ sessionId: "session-1", branchId: "main" });
    await store.setActiveLeaf({ sessionId: "session-1", branchId: "main", eventId: "event-1", reason: "host-selected" });

    await expect(store.forkBranch({
      sessionId: "session-1",
      branchId: "main",
      fromBranchId: "main",
      fromEventId: "event-1"
    })).resolves.toMatchObject({
      ok: false,
      diagnostic: { status: "branch_id_conflict" }
    });
    await expect(store.forkBranch({
      sessionId: "session-1",
      branchId: "branch-missing",
      fromBranchId: "main",
      fromEventId: "event-missing"
    })).resolves.toMatchObject({
      ok: false,
      diagnostic: { status: "source_event_not_visible" }
    });
    await expect(store.setActiveLeaf({
      sessionId: "session-1",
      branchId: "missing-branch",
      eventId: "event-missing",
      reason: "host-selected"
    })).resolves.toMatchObject({
      ok: false,
      diagnostic: { status: "active_leaf_not_found" }
    });
    await expect(store.forkBranch({
      sessionId: "session-1",
      branchId: "cycle",
      fromBranchId: "cycle",
      fromEventId: "event-1"
    })).resolves.toMatchObject({
      ok: false,
      diagnostic: { status: "cycle_detected" }
    });
  });

  it("surfaces session JSONL corruption diagnostics when replaying the tree", async () => {
    const root = await tempRoot();
    const store = new JsonlSessionStore({ rootDir: root });
    await store.createSession({ sessionId: "session-1", branchId: "main" });
    await store.appendRawFactForTest("session-1", "{not-json}\n");

    await expect(new JsonlSessionStore({ rootDir: root }).getSessionTree("session-1")).resolves.toMatchObject({
      ok: false,
      diagnostic: {
        status: "unavailable",
        metadata: {
          corruption: expect.objectContaining({ kind: "middle_corruption", recoverable: false })
        }
      }
    });
  });
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "guga-jsonl-sessions-"));
  tempRoots.push(root);
  return root;
}

function clock(values: string[]): () => string {
  const timestamps = [...values];
  return () => timestamps.shift() ?? "2026-05-27T00:00:59.000Z";
}
