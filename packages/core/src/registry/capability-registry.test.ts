import { describe, expect, it } from "vitest";
import { CapabilityRegistry, diffCapabilityDescriptors } from "./capability-registry";
import type { ArtifactStore, EventStore, ReplayCapability, SessionStore } from "../contracts/persistence";
import type { ModelMetadata, Provider } from "../contracts/provider";
import type { ToolDefinition } from "../contracts/tools";

const provider: Provider = {
  id: "mock",
  generate: () => ({ type: "final", content: "done" })
};

const tool: ToolDefinition = {
  name: "echo",
  description: "Echo input",
  inputSchema: {},
  effect: "read",
  execute: () => ({ ok: true, content: "echo" })
};

const model: ModelMetadata = {
  providerId: "mock",
  modelId: "mock-small",
  purposes: ["primary"],
  capabilities: { toolCalling: true, usage: "optional" }
};

const eventStore: EventStore = {
  append() {
    return { ok: false, status: "unavailable", reason: "test" };
  },
  readStream() {
    return { ok: false, status: "unavailable", diagnostics: [] };
  }
};

const sessionStore: SessionStore = {
  createSession() {
    return { ok: false, diagnostic: { status: "unavailable", message: "test" } };
  },
  getSessionTree() {
    return { ok: false, diagnostic: { status: "unavailable", message: "test" } };
  },
  forkBranch() {
    return { ok: false, diagnostic: { status: "unavailable", message: "test" } };
  },
  setActiveLeaf() {
    return { ok: false, diagnostic: { status: "unavailable", message: "test" } };
  }
};

const artifactStore: ArtifactStore = {
  putArtifact() {
    return { ok: false, status: "unavailable", reason: "test" };
  },
  readArtifact() {
    return {
      ok: false,
      status: "unavailable",
      diagnostic: { kind: "unknown", message: "test", recoverable: true }
    };
  },
  tombstoneArtifact() {
    return {
      ok: false,
      status: "unavailable",
      diagnostic: { kind: "unknown", message: "test", recoverable: true }
    };
  }
};

const replayCapability: ReplayCapability = {
  replayConversation() {
    return { ok: false, status: "unavailable", diagnostics: [] };
  },
  replayModelInput() {
    return { ok: false, status: "unavailable", diagnostics: [] };
  },
  replayAudit() {
    return { ok: false, status: "unavailable", diagnostics: [] };
  }
};

describe("CapabilityRegistry", () => {
  it("registers and resolves providers and tools", () => {
    const registry = new CapabilityRegistry();
    registry.registerProvider(provider);
    registry.registerModel(model);
    registry.registerTool(tool);

    expect(registry.requireProvider("mock")).toBe(provider);
    expect(registry.getModel("mock", "mock-small")).toBe(model);
    expect(registry.listModels()).toEqual([model]);
    expect(registry.requireTool("echo")).toBe(tool);
    expect(registry.listTools()).toEqual([tool]);
    expect(registry.listCapabilityDescriptors()).toEqual([
      { type: "model", name: "mock/mock-small", source: "host", status: "registered" },
      { type: "provider", name: "mock", source: "host", status: "registered" },
      { type: "tool", name: "echo", source: "host", status: "registered" }
    ]);
  });

  it("fails explicitly for missing providers and tools", () => {
    const registry = new CapabilityRegistry();

    expect(() => registry.requireProvider("missing")).toThrow("Provider not registered: missing");
    expect(() => registry.requireTool("missing")).toThrow("Tool not registered: missing");
  });

  it("does not silently overwrite duplicate capabilities", () => {
    const registry = new CapabilityRegistry();
    registry.registerProvider(provider);
    registry.registerModel(model);
    registry.registerTool(tool);

    expect(() => registry.registerProvider(provider)).toThrow("Provider already registered: mock");
    expect(() => registry.registerModel(model)).toThrow("Model already registered: mock/mock-small");
    expect(() => registry.registerTool(tool)).toThrow("Tool already registered: echo");
  });

  it("registers skill metadata without body-bearing runtime handlers", () => {
    const registry = new CapabilityRegistry();
    registry.registerSkill(
      {
        name: "typescript-review",
        description: "Review TypeScript changes",
        location: "skills/typescript-review/SKILL.md",
        namespace: "project"
      },
      { source: "plugin", ownerPluginId: "skills-plugin", namespace: "project" }
    );

    expect(registry.getSkill("typescript-review")).toEqual({
      name: "typescript-review",
      description: "Review TypeScript changes",
      location: "skills/typescript-review/SKILL.md",
      namespace: "project"
    });
    expect(registry.listSkills()).toEqual([expect.objectContaining({ name: "typescript-review" })]);
    expect(registry.listCapabilityDescriptors()).toEqual([
      {
        type: "skill",
        name: "typescript-review",
        source: "plugin",
        status: "registered",
        namespace: "project",
        ownerPluginId: "skills-plugin"
      }
    ]);
    expect(JSON.parse(JSON.stringify(registry.listCapabilityDescriptors()))).toEqual(registry.listCapabilityDescriptors());
  });

  it("records optional trust metadata on capability descriptors", () => {
    const registry = new CapabilityRegistry();
    registry.registerTool(tool, {
      source: "plugin",
      ownerPluginId: "filesystem",
      trust: {
        level: "first-party",
        scopes: [{ kind: "path", access: "read", value: "/repo" }]
      }
    });

    expect(registry.listCapabilityDescriptors()).toEqual([
      {
        type: "tool",
        name: "echo",
        source: "plugin",
        status: "registered",
        ownerPluginId: "filesystem",
        trust: {
          level: "first-party",
          scopes: [{ kind: "path", access: "read", value: "/repo" }]
        }
      }
    ]);
  });

  it("records built-in capability layer and core ownership metadata", () => {
    const registry = new CapabilityRegistry();
    registry.registerTool(tool, {
      source: "built-in",
      namespace: "filesystem",
      declaredEffects: ["filesystem.read"],
      permissionRequirements: [{ subject: "workspace", actions: ["read"], reason: "Read files for the agent" }]
    });

    expect(registry.listCapabilityDescriptors()).toEqual([
      {
        type: "tool",
        name: "echo",
        source: "built-in",
        status: "registered",
        layer: "built-in-core",
        namespace: "filesystem",
        owner: { kind: "core", id: "guga-core" },
        declaredEffects: ["filesystem.read"],
        permissionRequirements: [{ subject: "workspace", actions: ["read"], reason: "Read files for the agent" }]
      }
    ]);
  });

  it("records extension ownership, dependencies, lifecycle, and declared effects", () => {
    const registry = new CapabilityRegistry();
    registry.registerTool(tool, {
      source: "plugin",
      layer: "extension",
      namespace: "mcp-fixture",
      ownerPluginId: "mcp",
      owner: { kind: "extension", id: "mcp", packageName: "@guga-agent/plugin-mcp" },
      declaredEffects: ["network.access"],
      permissionRequirements: [{ subject: "mcp.server.fixture", actions: ["connect"] }],
      dependencies: [{ kind: "service", name: "fixture", optional: true }],
      lifecycle: { load: "eager", unload: "remove-contributions", reload: "supported", shutdownTimeoutMs: 500 },
      extension: {
        id: "mcp",
        name: "MCP",
        source: { kind: "first-party", packageName: "@guga-agent/plugin-mcp" },
        namespace: "mcp-fixture",
        owner: { kind: "extension", id: "mcp", packageName: "@guga-agent/plugin-mcp" }
      }
    });

    expect(JSON.parse(JSON.stringify(registry.listCapabilityDescriptors()))).toEqual(registry.listCapabilityDescriptors());
    expect(registry.listCapabilityDescriptors()).toEqual([
      expect.objectContaining({
        type: "tool",
        name: "echo",
        source: "plugin",
        status: "registered",
        layer: "extension",
        namespace: "mcp-fixture",
        ownerPluginId: "mcp",
        owner: { kind: "extension", id: "mcp", packageName: "@guga-agent/plugin-mcp" },
        declaredEffects: ["network.access"],
        permissionRequirements: [{ subject: "mcp.server.fixture", actions: ["connect"] }],
        dependencies: [{ kind: "service", name: "fixture", optional: true }],
        lifecycle: { load: "eager", unload: "remove-contributions", reload: "supported", shutdownTimeoutMs: 500 }
      })
    ]);
  });

  it("rejects invalid source layer and owner combinations", () => {
    const registry = new CapabilityRegistry();

    expect(() => registry.registerTool(tool, { source: "built-in", ownerPluginId: "ordinary-plugin" })).toThrow(
      "Built-in capabilities cannot be owned by an extension"
    );
    expect(() => registry.registerProvider(provider, { source: "plugin", layer: "built-in-core" })).toThrow(
      "Extension capabilities cannot use the built-in-core layer"
    );
  });

  it("removes skill descriptors with skill metadata", () => {
    const registry = new CapabilityRegistry();
    registry.registerSkill({ name: "docs", description: "Write docs" });

    registry.removeSkill("docs");

    expect(registry.getSkill("docs")).toBeUndefined();
    expect(registry.listCapabilityDescriptors()).toEqual([]);
  });

  it("diffs capability descriptor snapshots", () => {
    const before = [
      { type: "tool" as const, name: "read", source: "host" as const, status: "registered" as const },
      { type: "skill" as const, name: "old-skill", source: "plugin" as const, status: "registered" as const, ownerPluginId: "old" }
    ];
    const after = [
      { type: "tool" as const, name: "read", source: "plugin" as const, status: "registered" as const, ownerPluginId: "tools" },
      { type: "skill" as const, name: "new-skill", source: "plugin" as const, status: "registered" as const, ownerPluginId: "new" },
      { type: "tool" as const, name: "read", source: "mcp" as const, status: "skipped-conflict" as const, reason: "name already registered" }
    ];

    expect(diffCapabilityDescriptors(before, after)).toEqual({
      added: [
        { type: "skill", name: "new-skill", source: "plugin", status: "registered", ownerPluginId: "new" },
        { type: "tool", name: "read", source: "mcp", status: "skipped-conflict", reason: "name already registered" }
      ],
      removed: [
        { type: "skill", name: "old-skill", source: "plugin", status: "registered", ownerPluginId: "old" }
      ],
      changed: [{
        before: { type: "tool", name: "read", source: "host", status: "registered" },
        after: { type: "tool", name: "read", source: "plugin", status: "registered", ownerPluginId: "tools" }
      }],
      skippedConflicts: [
        { type: "tool", name: "read", source: "mcp", status: "skipped-conflict", reason: "name already registered" }
      ]
    });
  });

  it("allows explicit tool override only when the replaced name matches", () => {
    const registry = new CapabilityRegistry();
    const replacement = { ...tool, description: "Replacement echo" };
    registry.registerTool(tool);

    expect(() => registry.registerTool(replacement, { override: { replaces: "other", reason: "test" } })).toThrow("Tool already registered: echo");
    registry.registerTool(replacement, { override: { replaces: "echo", reason: "test" } });

    expect(registry.requireTool("echo")).toBe(replacement);
    expect(registry.listCapabilityDescriptors()).toContainEqual({
      type: "tool",
      name: "echo",
      source: "host",
      status: "registered",
      reason: "test",
      override: {
        status: "active",
        target: { type: "tool", name: "echo" },
        reason: "test"
      }
    });
  });

  it("removes model metadata by provider and model id", () => {
    const registry = new CapabilityRegistry();
    registry.registerModel(model);

    registry.removeModel("mock", "mock-small");

    expect(registry.getModel("mock", "mock-small")).toBeUndefined();
    expect(registry.listModels()).toEqual([]);
  });

  it("registers and resolves persistence and replay capabilities", () => {
    const registry = new CapabilityRegistry();

    registry.registerEventStore(eventStore);
    registry.registerSessionStore(sessionStore);
    registry.registerArtifactStore(artifactStore);
    registry.registerReplayCapability(replayCapability);

    expect(registry.requireEventStore()).toBe(eventStore);
    expect(registry.requireSessionStore()).toBe(sessionStore);
    expect(registry.requireArtifactStore()).toBe(artifactStore);
    expect(registry.requireReplayCapability()).toBe(replayCapability);
    expect(registry.listEventStores()).toEqual([eventStore]);
    expect(registry.listSessionStores()).toEqual([sessionStore]);
    expect(registry.listArtifactStores()).toEqual([artifactStore]);
    expect(registry.listReplayCapabilities()).toEqual([replayCapability]);
    expect(registry.listCapabilityDescriptors()).toEqual([
      { type: "artifact-store", name: "default", source: "host", status: "registered" },
      { type: "event-store", name: "default", source: "host", status: "registered" },
      { type: "replay", name: "default", source: "host", status: "registered" },
      { type: "session-store", name: "default", source: "host", status: "registered" }
    ]);
  });

  it("does not silently overwrite duplicate persistence and replay capabilities", () => {
    const registry = new CapabilityRegistry();
    registry.registerEventStore(eventStore);
    registry.registerSessionStore(sessionStore);
    registry.registerArtifactStore(artifactStore);
    registry.registerReplayCapability(replayCapability);

    expect(() => registry.registerEventStore(eventStore)).toThrow("Event store already registered: default");
    expect(() => registry.registerSessionStore(sessionStore)).toThrow("Session store already registered: default");
    expect(() => registry.registerArtifactStore(artifactStore)).toThrow("Artifact store already registered: default");
    expect(() => registry.registerReplayCapability(replayCapability)).toThrow("Replay capability already registered: default");
  });

  it("removes persistence and replay capabilities by id", () => {
    const registry = new CapabilityRegistry();
    registry.registerEventStore(eventStore);
    registry.registerSessionStore(sessionStore);
    registry.registerArtifactStore(artifactStore);
    registry.registerReplayCapability(replayCapability);

    registry.removeEventStore();
    registry.removeSessionStore();
    registry.removeArtifactStore();
    registry.removeReplayCapability();

    expect(registry.getEventStore()).toBeUndefined();
    expect(registry.getSessionStore()).toBeUndefined();
    expect(registry.getArtifactStore()).toBeUndefined();
    expect(registry.getReplayCapability()).toBeUndefined();
    expect(registry.listCapabilityDescriptors()).toEqual([]);
  });
});
