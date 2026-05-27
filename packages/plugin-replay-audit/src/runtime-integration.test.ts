import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { AgentEventType, createAgentRuntime, createDurableEventEnvelope, type LocalPlugin } from "@guga-agent/core";
import { createReplayAuditPlugin } from "./replay-audit-plugin";
import { FakeEventStore, FakeSessionStore, projectionFixture } from "./test-fixtures";

const tempRoots: string[] = [];

describe("replay audit runtime integration", () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("registers ReplayCapability through the public plugin context and uses public stores", async () => {
    const root = await tempRoot();
    const projection = projectionFixture();
    const eventStore = new FakeEventStore();
    const sessionStore = new FakeSessionStore([]);
    const storePlugin: LocalPlugin = {
      id: "test-stores",
      init(context) {
        context.registerEventStore(eventStore);
        context.registerSessionStore(sessionStore);
      }
    };
    const runtime = createAgentRuntime({
      plugins: [storePlugin, createReplayAuditPlugin()]
    });

    const init = await runtime.run({ input: "initialize plugins", runId: "run-init" });
    expect(init.ok).toBe(false);
    expect(init.events).toContainEqual(expect.objectContaining({
      type: AgentEventType.PluginCapabilityRegistered,
      capability: "replay",
      pluginId: "guga-replay-audit"
    }));
    expect(runtime.getPersistenceCapabilities().replay).toBeDefined();

    const events = [
      createDurableEventEnvelope({
        schemaVersion: 1,
        eventId: "event-1",
        streamId: "session/session-1/main",
        streamRevision: 0,
        sessionId: "session-1",
        branchId: "main",
        runId: "run-1",
        parentEventId: null,
        previousEventHash: null,
        createdAt: "2026-05-27T00:00:00.000Z",
        actor: { type: "runtime", id: "test" },
        source: { type: "runtime", id: "test" },
        payload: { type: AgentEventType.RunStarted, runId: "run-1", input: "hello" }
      }),
      createDurableEventEnvelope({
        schemaVersion: 1,
        eventId: "event-2",
        streamId: "session/session-1/main",
        streamRevision: 1,
        sessionId: "session-1",
        branchId: "main",
        runId: "run-1",
        turn: 0,
        parentEventId: null,
        previousEventHash: null,
        createdAt: "2026-05-27T00:00:01.000Z",
        actor: { type: "runtime", id: "test" },
        source: { type: "runtime", id: "test" },
        payload: { type: AgentEventType.ContextProjectionCreated, runId: "run-1", turn: 0, projection }
      }),
      createDurableEventEnvelope({
        schemaVersion: 1,
        eventId: "event-3",
        streamId: "session/session-1/main",
        streamRevision: 2,
        sessionId: "session-1",
        branchId: "main",
        runId: "run-1",
        turn: 0,
        parentEventId: null,
        previousEventHash: null,
        createdAt: "2026-05-27T00:00:02.000Z",
        actor: { type: "runtime", id: "test" },
        source: { type: "runtime", id: "test" },
        payload: { type: AgentEventType.ProviderInputCommitted, runId: "run-1", turn: 0, projectionId: "projection-1" }
      })
    ];
    eventStore.streams.set("session/session-1/main", events);
    sessionStore.branches[0] = { ...sessionStore.branches[0]!, visibleEventIds: events.map((event) => event.eventId) };
    sessionStore.activeLeaf = {
      sessionId: "session-1",
      branchId: "main",
      eventId: "event-3",
      updatedAt: "2026-05-27T00:00:00.000Z",
      reason: "resume-selected"
    };

    await expect(runtime.replayModelInput({ sessionId: "session-1", branchId: "main", turn: 0 })).resolves.toMatchObject({
      ok: true,
      projection: { projectionId: "projection-1" }
    });

    await runtime.dispose();
    expect(root).toContain("guga-replay-runtime-");
  });

});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "guga-replay-runtime-"));
  tempRoots.push(root);
  return root;
}
