import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { AgentEventType, CapabilityRegistry, EventBus, HookKernel, PluginHost } from "@guga-agent/core";
import { createJsonlSessionPlugin } from "./jsonl-session-plugin";

const tempRoots: string[] = [];

describe("createJsonlSessionPlugin", () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("registers event and session stores through the public plugin context", async () => {
    const root = await tempRoot();
    const registry = new CapabilityRegistry();
    const eventBus = new EventBus();
    const hookKernel = new HookKernel({ eventBus });
    const host = new PluginHost({
      plugins: [createJsonlSessionPlugin({ rootDir: root, pluginId: "jsonl-session" })],
      registry,
      eventBus,
      hookKernel
    });

    await host.initialize({ runId: "run-jsonl-plugin" });

    expect(registry.getEventStore()).toBeDefined();
    expect(registry.getSessionStore()).toBeDefined();
    expect(eventBus.events).toEqual([
      expect.objectContaining({
        type: AgentEventType.PluginCapabilityRegistered,
        pluginId: "jsonl-session",
        capability: "event-store",
        name: "default"
      }),
      expect.objectContaining({
        type: AgentEventType.PluginCapabilityRegistered,
        pluginId: "jsonl-session",
        capability: "session-store",
        name: "default"
      }),
      expect.objectContaining({ type: AgentEventType.PluginInitialized, pluginId: "jsonl-session" })
    ]);
  });
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "guga-jsonl-plugin-"));
  tempRoots.push(root);
  return root;
}
