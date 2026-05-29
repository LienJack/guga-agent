import { describe, expect, it } from "vitest";
import { AgentEventType } from "../contracts/events";
import type { ToolDefinition } from "../contracts/tools";
import { createTestTool } from "../testing/test-tool";
import { createAgentRuntime } from "./create-agent-runtime";
import { createRuntimeToolInvoker } from "./tool-invoker";

describe("runtime tool invoker", () => {
  it("executes controller-originated tools through the same durable event path", async () => {
    const runtime = createAgentRuntime({ builtIns: false });
    const events: string[] = [];
    runtime.onEvent((event) => events.push(event.type));
    runtime.registerTool(createTestTool({ name: "echo", content: "hello" }));

    const result = await runtime.invokeTool({
      runId: "run-controller",
      call: { id: "call-1", name: "echo", input: {} },
      source: "controller",
      taskId: "task-1"
    });

    expect(result).toMatchObject({
      result: { ok: true, content: "hello" },
      correlation: {
        runId: "run-controller",
        turn: 0,
        toolCallId: "call-1",
        attempt: 1,
        source: "controller",
        taskId: "task-1"
      }
    });
    expect(events).toEqual(expect.arrayContaining([
      AgentEventType.ToolQueued,
      AgentEventType.PermissionResolved,
      AgentEventType.ToolStarted,
      AgentEventType.ToolCompleted
    ]));
  });

  it("honors permission denials for verification-originated tool calls", async () => {
    const runtime = createAgentRuntime({
      builtIns: false,
      permissions: {
        resolver: () => ({
          action: "deny",
          remember: "once",
          source: "host",
          reason: "no writes"
        })
      }
    });
    runtime.registerTool(writeTool());

    const result = await runtime.invokeTool({
      runId: "run-verification",
      call: { id: "call-write", name: "write_fixture", input: { value: "x" } },
      source: "verification",
      taskId: "task-1"
    });

    expect(result).toMatchObject({
      reason: "permission_denied",
      correlation: { source: "verification", taskId: "task-1" },
      result: {
        ok: false,
        error: { code: "TOOL_PERMISSION_DENIED", message: "no writes" }
      }
    });
  });

  it("initializes plugin tools before invoking them", async () => {
    const runtime = createAgentRuntime({
      builtIns: false,
      plugins: [{
        id: "tool-plugin",
        init(context) {
          context.registerTool(createTestTool({ name: "plugin_echo", content: "from plugin" }));
        }
      }]
    });

    await expect(runtime.invokeTool({
      runId: "run-plugin-tool",
      call: { id: "call-plugin", name: "plugin_echo", input: {} },
      source: "host"
    })).resolves.toMatchObject({
      result: { ok: true, content: "from plugin" }
    });
  });

  it("can be exposed through a narrow invoker facade", async () => {
    const runtime = createAgentRuntime({ builtIns: false });
    runtime.registerTool(createTestTool({ name: "echo", content: "facade" }));
    const invoker = createRuntimeToolInvoker(runtime);

    await expect(invoker.invokeTool({
      runId: "run-facade",
      call: { id: "call-facade", name: "echo", input: {} },
      source: "controller"
    })).resolves.toMatchObject({
      result: { ok: true, content: "facade" }
    });
  });
});

function writeTool(): ToolDefinition {
  return {
    name: "write_fixture",
    description: "Test write tool",
    inputSchema: {
      type: "object",
      required: ["value"],
      properties: {
        value: { type: "string" }
      },
      additionalProperties: false
    },
    effect: "write",
    execute(input) {
      return { ok: true, content: JSON.stringify(input) };
    }
  };
}
