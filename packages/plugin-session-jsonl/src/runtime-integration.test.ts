import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentRuntime, createDurableEventEnvelope, AgentEventType, createMockProvider, createTestTool } from "@guga-agent/core";
import { createReplayAuditPlugin } from "../../plugin-replay-audit/src/replay-audit-plugin";
import { createJsonlSessionPlugin } from "./jsonl-session-plugin";

const tempRoots: string[] = [];

describe("jsonl session runtime integration", () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("exposes plugin-provided stores through createAgentRuntime without core internals", async () => {
    const root = await tempRoot();
    const runtime = createAgentRuntime({
      plugins: [createJsonlSessionPlugin({ rootDir: root })]
    });

    await expect(runtime.resumeSession({ sessionId: "missing-before-init" })).resolves.toMatchObject({
      ok: false,
      status: "unavailable"
    });

    const result = await runtime.run({
      input: "hello",
      providerId: "missing-provider",
      runId: "run-initialize-jsonl"
    });
    expect(result).toMatchObject({ ok: false, error: { code: "PROVIDER_NOT_FOUND" } });

    const { eventStore, sessionStore } = runtime.getPersistenceCapabilities();
    expect(eventStore).toBeDefined();
    expect(sessionStore).toBeDefined();

    await expect(sessionStore?.createSession({ sessionId: "session-1", branchId: "main" })).resolves.toMatchObject({
      ok: true
    });
    const event = createDurableEventEnvelope({
      schemaVersion: 1,
      eventId: "event-runtime-1",
      streamId: "session/session-1",
      streamRevision: 0,
      sessionId: "session-1",
      branchId: "main",
      runId: "run-initialize-jsonl",
      parentEventId: null,
      previousEventHash: null,
      createdAt: "2026-05-27T00:00:00.000Z",
      actor: { type: "runtime", id: "core" },
      source: { type: "runtime", id: "core" },
      payload: { type: AgentEventType.RunStarted, runId: "run-initialize-jsonl", input: "hello" }
    });
    await expect(eventStore?.append(event, { expectedRevision: "no-stream" })).resolves.toMatchObject({
      ok: true
    });
    await expect(sessionStore?.setActiveLeaf({
      sessionId: "session-1",
      branchId: "main",
      eventId: "event-runtime-1",
      reason: "host-selected"
    })).resolves.toMatchObject({
      ok: true,
      leaf: { eventId: "event-runtime-1" }
    });

    await expect(runtime.resumeSession({ sessionId: "session-1" })).resolves.toMatchObject({
      ok: true,
      session: { id: "session-1" },
      activeLeaf: { branchId: "main", eventId: "event-runtime-1" }
    });
    await runtime.dispose();
  });

  it("reopens persisted runs and replays model input without calling the provider", async () => {
    const root = await tempRoot();
    const providerSpy = vi.fn();
    const runtime = createAgentRuntime({
      plugins: [
        createJsonlSessionPlugin({ rootDir: root }),
        createReplayAuditPlugin()
      ]
    });
    runtime.registerProvider(createMockProvider([
      () => {
        providerSpy();
        return { type: "tool_calls", toolCalls: [{ id: "call-1", name: "echo", input: { value: "hello" } }] };
      },
      () => {
        providerSpy();
        return { type: "final", content: "done" };
      }
    ]));
    runtime.registerTool(createTestTool({ name: "echo", content: "tool hello" }));

    await expect(runtime.run({
      input: "hello",
      providerId: "mock",
      runId: "run-jsonl-replay",
      session: { sessionId: "session-1", branchId: "main" }
    })).resolves.toMatchObject({ ok: true, finalAnswer: "done" });
    await runtime.dispose();
    providerSpy.mockClear();

    const reopened = createAgentRuntime({
      plugins: [
        createJsonlSessionPlugin({ rootDir: root }),
        createReplayAuditPlugin()
      ]
    });
    const init = await reopened.run({
      input: "initialize plugins",
      providerId: "missing",
      runId: "run-reopen-init"
    });
    expect(init.ok).toBe(false);

    await expect(reopened.resumeSession({ sessionId: "session-1" })).resolves.toMatchObject({
      ok: true,
      conversation: expect.arrayContaining([
        { role: "user", content: "hello" },
        { role: "assistant", content: "done" }
      ])
    });
    await expect(reopened.replayModelInput({ sessionId: "session-1", branchId: "main", turn: 0 })).resolves.toMatchObject({
      ok: true,
      projection: {
        runId: "run-jsonl-replay",
        turn: 0,
        messages: [{ role: "user", content: "hello" }],
        tools: expect.arrayContaining([
          expect.objectContaining({ name: "fs_read" }),
          expect.objectContaining({ name: "git_status" }),
          expect.objectContaining({ name: "shell_exec" }),
          expect.objectContaining({ name: "echo" })
        ])
      }
    });
    expect(providerSpy).not.toHaveBeenCalled();
    await reopened.dispose();
  });
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "guga-jsonl-runtime-"));
  tempRoots.push(root);
  return root;
}
