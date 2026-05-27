import { describe, expect, it } from "vitest";
import { CapabilityRegistry } from "./capability-registry";
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

  it("allows explicit tool override only when the replaced name matches", () => {
    const registry = new CapabilityRegistry();
    const replacement = { ...tool, description: "Replacement echo" };
    registry.registerTool(tool);

    expect(() => registry.registerTool(replacement, { override: { replaces: "other", reason: "test" } })).toThrow("Tool already registered: echo");
    registry.registerTool(replacement, { override: { replaces: "echo", reason: "test" } });

    expect(registry.requireTool("echo")).toBe(replacement);
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
  });
});
