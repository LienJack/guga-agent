import { describe, expect, it } from "vitest";
import type {
  CapabilityRegistrationOptions,
  HookRegistration,
  PluginContext,
  SkillMetadata,
  ToolDefinition
} from "@guga-agent/core";
import { defineExtension, ExtensionSdkError, type ExtensionSetupContext } from "./index";

const extensionSource = {
  kind: "first-party",
  packageName: "@guga-agent/extension-sdk-test"
} as const;

describe("defineExtension", () => {
  it("returns a LocalPlugin and injects extension metadata into capability registrations", async () => {
    const calls = createCapturingPluginContext("mcp-fixture");
    const extension = defineExtension({
      id: "mcp-fixture",
      name: "MCP Fixture",
      version: "0.0.0",
      source: extensionSource,
      namespace: "fixture",
      declaredEffects: ["network.access"],
      permissionRequirements: [{ subject: "mcp.fixture", actions: ["connect"], reason: "Connect to the fixture server" }],
      dependencies: [{ kind: "service", name: "fixture", optional: true }],
      lifecycle: { load: "eager", unload: "remove-contributions", reload: "supported" },
      setup(context) {
        context.tool(createTool("mcp__fixture__echo"), { source: "mcp" });
        context.operation("mcp.fixture.connect", { source: "mcp" });
      }
    });

    expect(extension).toMatchObject({ id: "mcp-fixture", name: "MCP Fixture" });
    await extension.init(calls);

    const expectedExtension = {
      id: "mcp-fixture",
      name: "MCP Fixture",
      version: "0.0.0",
      source: extensionSource,
      namespace: "fixture",
      owner: { kind: "extension", id: "mcp-fixture", packageName: "@guga-agent/extension-sdk-test" },
      declaredEffects: ["network.access"],
      permissionRequirements: [{ subject: "mcp.fixture", actions: ["connect"], reason: "Connect to the fixture server" }],
      dependencies: [{ kind: "service", name: "fixture", optional: true }],
      lifecycle: { load: "eager", unload: "remove-contributions", reload: "supported" }
    };
    expect(calls.tools).toEqual([
      {
        tool: expect.objectContaining({ name: "mcp__fixture__echo" }),
        options: {
          source: "mcp",
          layer: "extension",
          namespace: "fixture",
          ownerPluginId: "mcp-fixture",
          owner: expectedExtension.owner,
          extension: expectedExtension,
          declaredEffects: ["network.access"],
          permissionRequirements: expectedExtension.permissionRequirements,
          dependencies: expectedExtension.dependencies,
          lifecycle: expectedExtension.lifecycle
        }
      }
    ]);
    expect(calls.operations).toEqual([
      {
        name: "mcp.fixture.connect",
        options: expect.objectContaining({
          source: "mcp",
          layer: "extension",
          namespace: "fixture",
          ownerPluginId: "mcp-fixture",
          owner: expectedExtension.owner,
          extension: expectedExtension
        })
      }
    ]);
  });

  it("offers tool, skill, hook, and operation facades over the core context", async () => {
    const calls = createCapturingPluginContext("facade-fixture");
    const extension = defineExtension({
      id: "facade-fixture",
      source: extensionSource,
      namespace: "facade",
      declaredEffects: ["context.read"],
      lifecycle: { load: "lazy" },
      setup(context) {
        context.tool(createTool("facade_tool"));
        context.skill({ name: "facade-skill", description: "Facade skill" });
        context.hook({
          id: "facade-hook",
          phase: "runtime.start",
          effect: "observe",
          handler() {}
        } as HookRegistration);
        context.operation("facade.operation", { declaredEffects: ["runtime.operation"] });
      }
    });

    await extension.init(calls);

    expect(calls.tools[0]?.options).toMatchObject({
      source: "plugin",
      layer: "extension",
      namespace: "facade",
      ownerPluginId: "facade-fixture",
      owner: { kind: "extension", id: "facade-fixture", packageName: "@guga-agent/extension-sdk-test" },
      declaredEffects: ["context.read"],
      lifecycle: { load: "lazy" },
      extension: expect.objectContaining({ id: "facade-fixture" })
    });
    expect(calls.skills).toEqual([
      {
        skill: { name: "facade-skill", description: "Facade skill", namespace: "facade" },
        options: expect.objectContaining({
          layer: "extension",
          ownerPluginId: "facade-fixture",
          extension: expect.objectContaining({ id: "facade-fixture" })
        })
      }
    ]);
    expect(calls.hooks[0]).toMatchObject({
      hook: { id: "facade-hook" },
      options: expect.objectContaining({
        layer: "extension",
        ownerPluginId: "facade-fixture",
        extension: expect.objectContaining({ id: "facade-fixture" })
      })
    });
    expect(calls.operations[0]).toMatchObject({
      name: "facade.operation",
      options: expect.objectContaining({
        declaredEffects: ["runtime.operation"],
        layer: "extension",
        ownerPluginId: "facade-fixture"
      })
    });
  });

  it("invalidates the setup context after setup returns", async () => {
    let captured: ExtensionSetupContext | undefined;
    const extension = defineExtension({
      id: "inactive-fixture",
      source: extensionSource,
      setup(context) {
        captured = context;
        expect(context.isActive()).toBe(true);
      }
    });

    await extension.init(createCapturingPluginContext("inactive-fixture"));

    expect(captured?.isActive()).toBe(false);
    expect(() => captured?.tool(createTool("too_late"))).toThrow(ExtensionSdkError);
    expect(() => captured?.assertActive()).toThrow(
      expect.objectContaining({
        code: "EXTENSION_CONTEXT_INACTIVE",
        details: { extensionId: "inactive-fixture", pluginId: "inactive-fixture" }
      })
    );
  });

  it("invalidates the shutdown context after shutdown returns", async () => {
    let shutdownContext: { isActive(): boolean; assertActive(): void } | undefined;
    const extension = defineExtension({
      id: "shutdown-fixture",
      source: extensionSource,
      setup() {},
      shutdown(context) {
        shutdownContext = context;
        expect(context.isActive()).toBe(true);
      }
    });

    await extension.init(createCapturingPluginContext("shutdown-fixture"));
    await extension.shutdown?.({ pluginId: "shutdown-fixture" });

    expect(shutdownContext?.isActive()).toBe(false);
    expect(() => shutdownContext?.assertActive()).toThrow(ExtensionSdkError);
  });
});

function createCapturingPluginContext(pluginId: string): PluginContext & {
  tools: Array<{ tool: ToolDefinition; options?: CapabilityRegistrationOptions }>;
  skills: Array<{ skill: SkillMetadata; options?: CapabilityRegistrationOptions }>;
  hooks: Array<{ hook: HookRegistration; options?: CapabilityRegistrationOptions }>;
  operations: Array<{ name: string; options?: CapabilityRegistrationOptions }>;
} {
  const calls = {
    tools: [] as Array<{ tool: ToolDefinition; options?: CapabilityRegistrationOptions }>,
    skills: [] as Array<{ skill: SkillMetadata; options?: CapabilityRegistrationOptions }>,
    hooks: [] as Array<{ hook: HookRegistration; options?: CapabilityRegistrationOptions }>,
    operations: [] as Array<{ name: string; options?: CapabilityRegistrationOptions }>
  };

  return {
    pluginId,
    registerProvider() {},
    registerTool(tool, options) {
      calls.tools.push({ tool, ...(options ? { options: options as CapabilityRegistrationOptions } : {}) });
    },
    registerSkill(skill, options?: CapabilityRegistrationOptions) {
      calls.skills.push({ skill, ...(options ? { options } : {}) });
    },
    registerHook(hook, options?: CapabilityRegistrationOptions) {
      calls.hooks.push({ hook, ...(options ? { options } : {}) });
    },
    registerOperation(name, options) {
      calls.operations.push({ name, ...(options ? { options } : {}) });
    },
    ...calls
  };
}

function createTool(name: string): ToolDefinition {
  return {
    name,
    description: `${name} test tool`,
    inputSchema: { type: "object" },
    effect: "read",
    execute() {
      return { ok: true, content: "ok" };
    }
  };
}
