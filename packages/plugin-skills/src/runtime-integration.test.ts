import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AgentEventType, CapabilityRegistry, EventBus, HookKernel, PluginHost } from "@guga-agent/core";
import { describe, expect, it } from "vitest";
import { createSkillsPlugin } from "./skills-plugin";

describe("createSkillsPlugin", () => {
  it("registers discovered skill metadata through the plugin host", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "guga-skills-"));
    await mkdir(path.join(root, "docs"), { recursive: true });
    await writeFile(path.join(root, "docs", "SKILL.md"), "---\nname: docs\ndescription: Write docs\n---\nBody");
    const registry = new CapabilityRegistry();
    const eventBus = new EventBus();
    const hookKernel = new HookKernel({ eventBus });
    const host = new PluginHost({
      plugins: [createSkillsPlugin({ pluginId: "skills", roots: [{ path: root, namespace: "project" }] })],
      registry,
      eventBus,
      hookKernel
    });

    await host.initialize({ runId: "run-skills" });

    expect(registry.getSkill("docs")).toMatchObject({
      name: "docs",
      description: "Write docs",
      namespace: "project"
    });
    expect(registry.listCapabilityDescriptors()).toContainEqual({
      type: "skill",
      name: "docs",
      source: "plugin",
      status: "registered",
      namespace: "project",
      ownerPluginId: "skills"
    });
    expect(eventBus.events).toContainEqual(expect.objectContaining({
      type: AgentEventType.PluginCapabilityRegistered,
      capability: "skill",
      name: "docs"
    }));
  });
});
