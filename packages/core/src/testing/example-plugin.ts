import { HookEffect, HookPhase } from "../contracts/hooks";
import type { LocalPlugin } from "../contracts/plugins";

export type ExamplePluginOptions = {
  pluginId?: string;
  providerId?: string;
  toolName?: string;
  toolContent?: string;
  gate?: "allow" | "deny";
  denyReason?: string;
  failInit?: Error;
  failHook?: Error;
  failShutdown?: Error;
};

export type ExamplePluginState = {
  active: boolean;
  toolExecutions: number;
  shutdowns: number;
};

export type ExamplePluginFixture = {
  plugin: LocalPlugin;
  state: ExamplePluginState;
  providerId: string;
  toolName: string;
};

export function createExamplePlugin(options: ExamplePluginOptions = {}): ExamplePluginFixture {
  const pluginId = options.pluginId ?? "example-plugin";
  const providerId = options.providerId ?? "example-provider";
  const toolName = options.toolName ?? "example-tool";
  const toolContent = options.toolContent ?? "example tool result";
  const gate = options.gate ?? "allow";
  const denyReason = options.denyReason ?? "blocked by example plugin";
  const state: ExamplePluginState = {
    active: false,
    toolExecutions: 0,
    shutdowns: 0
  };

  const plugin: LocalPlugin = {
    id: pluginId,
    name: "Example Plugin",
    init(context) {
      if (options.failInit) {
        throw options.failInit;
      }

      state.active = true;
      let calls = 0;
      context.registerProvider({
        id: providerId,
        generate(request) {
          calls += 1;
          if (calls === 1) {
            return {
              type: "tool_calls",
              toolCalls: [{ id: "example-call-1", name: toolName, input: { value: "hello" } }]
            };
          }

          const last = request.messages.at(-1);
          return {
            type: "final",
            content: last?.role === "tool" ? `example final: ${last.content}` : "example final: missing tool result"
          };
        }
      });
      context.registerTool({
        name: toolName,
        description: "Example plugin test tool",
        inputSchema: { type: "object" },
        effect: "read",
        execute() {
          state.toolExecutions += 1;
          return { ok: true, content: toolContent };
        }
      });
      context.registerHook({
        id: "example-pre-tool-gate",
        phase: HookPhase.PreToolGate,
        effect: HookEffect.Gate,
        handler(hookContext) {
          if (options.failHook) {
            throw options.failHook;
          }

          if (hookContext.call.name === toolName && gate === "deny") {
            return { type: "deny", reason: denyReason };
          }

          return { type: "allow" };
        }
      });
      context.registerHook({
        id: "example-shutdown",
        phase: HookPhase.RuntimeShutdown,
        effect: HookEffect.Observe,
        handler() {
          state.active = false;
        }
      });
    },
    shutdown() {
      if (options.failShutdown) {
        throw options.failShutdown;
      }

      state.active = false;
      state.shutdowns += 1;
    }
  };

  return {
    plugin,
    state,
    providerId,
    toolName
  };
}
