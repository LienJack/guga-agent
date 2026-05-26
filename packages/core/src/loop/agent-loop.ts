import { CoreError } from "../contracts/errors";
import { AgentEventType, type AgentEvent } from "../contracts/events";
import type { ToolCall } from "../contracts/messages";
import type { ProviderRequest } from "../contracts/provider";
import type { AgentRunFailure, AgentRunOptions, AgentRunResult } from "../contracts/runtime";
import type { ToolExecutionContext, ToolResult } from "../contracts/tools";
import { EventBus } from "../events/event-bus";
import { HookKernel } from "../hooks/hook-kernel";
import { CapabilityRegistry } from "../registry/capability-registry";
import { ConversationState } from "../state/conversation-state";

export type AgentLoopOptions = {
  registry: CapabilityRegistry;
  eventBus?: EventBus;
  eventStartIndex?: number;
  hookKernel?: HookKernel;
};

export class AgentLoop {
  private readonly registry: CapabilityRegistry;
  private readonly eventBus: EventBus;
  private readonly eventStartIndex: number | undefined;
  private readonly hookKernel: HookKernel | undefined;

  constructor(options: AgentLoopOptions) {
    this.registry = options.registry;
    this.eventBus = options.eventBus ?? new EventBus();
    this.eventStartIndex = options.eventStartIndex;
    this.hookKernel = options.hookKernel;
  }

  async run(options: AgentRunOptions): Promise<AgentRunResult> {
    const runId = options.runId ?? crypto.randomUUID();
    const maxTurns = options.maxTurns ?? 8;
    const eventStartIndex = this.eventStartIndex ?? this.eventBus.events.length;
    const state = new ConversationState();
    state.addUserMessage(options.input);

    this.publish({ type: AgentEventType.RunStarted, runId, input: options.input });

    let provider;
    try {
      provider = this.registry.requireProvider(options.providerId);
    } catch (error) {
      return this.fail(runId, eventStartIndex, toCoreError(error), "provider_missing");
    }

    for (let turn = 0; turn < maxTurns; turn += 1) {
      const messages = state.snapshot();
      const tools = this.registry.listTools();
      this.publish({
        type: AgentEventType.ModelRequested,
        runId,
        turn,
        providerId: provider.id,
        messages,
        toolNames: tools.map((tool) => tool.name)
      });

      const request: ProviderRequest = { messages, tools };
      if (options.signal) {
        request.signal = options.signal;
      }
      let response;
      try {
        response = await provider.generate(request);
      } catch (error) {
        return this.fail(
          runId,
          eventStartIndex,
          new CoreError(
            "PROVIDER_FAILED",
            error instanceof Error ? error.message : "Provider failed",
            error
          ),
          "provider_failed"
        );
      }
      this.publish({ type: AgentEventType.ModelResponded, runId, turn, response });
      if (response.usage) {
        this.publish({ type: AgentEventType.UsageRecorded, runId, turn, usage: response.usage });
      }

      if (response.type === "failure") {
        return this.fail(
          runId,
          eventStartIndex,
          new CoreError("PROVIDER_FAILED", response.error.message, response.error),
          "provider_failed"
        );
      }

      if (response.type === "final") {
        state.addAssistantFinal(response.content);
        this.publish({ type: AgentEventType.RunFinished, runId, status: "completed" });
        return {
          ok: true,
          runId,
          finalAnswer: response.content,
          events: this.eventsForRun(eventStartIndex)
        };
      }

      state.addAssistantToolCalls(response.toolCalls, response.content);

      for (const call of response.toolCalls) {
        this.publish({ type: AgentEventType.ToolCalled, runId, turn, call });

        if (this.hookKernel) {
          const gateResult = await this.hookKernel.runPreToolGate({ runId, turn, call, tools });
          if (!gateResult.ok) {
            return this.fail(
              runId,
              eventStartIndex,
              new CoreError("HOOK_FAILED", gateResult.error.message, {
                hook: gateResult.failedHook,
                error: gateResult.error
              }),
              "hook_failed"
            );
          }

          if ("deniedBy" in gateResult) {
            const blockedResult: ToolResult = {
              ok: false,
              error: {
                code: "TOOL_CALL_BLOCKED",
                message: gateResult.decision.reason,
                details: {
                  hookId: gateResult.deniedBy.id,
                  pluginId: gateResult.deniedBy.pluginId
                }
              }
            };
            state.addToolResult(call, blockedResult);
            this.publish({ type: AgentEventType.ToolResult, runId, turn, call, result: blockedResult });
            continue;
          }
        }

        const tool = this.registry.getTool(call.name);
        if (!tool) {
          return this.fail(
            runId,
            eventStartIndex,
            new CoreError("TOOL_NOT_FOUND", `Tool not registered: ${call.name}`, { toolCall: call }),
            "tool_missing"
          );
        }

        const result = await executeTool(call, (input, context) => tool.execute(input, context), options.signal);
        state.addToolResult(call, result);
        this.publish({ type: AgentEventType.ToolResult, runId, turn, call, result });
      }
    }

    return this.fail(
      runId,
      eventStartIndex,
      new CoreError("MAX_TURNS_EXCEEDED", `Agent loop exceeded max turns: ${maxTurns}`, { maxTurns }),
      "max_turns_exceeded"
    );
  }

  private fail(runId: string, eventStartIndex: number, error: CoreError, reason: string): AgentRunFailure {
    this.publish({
      type: AgentEventType.Error,
      runId,
      code: error.code,
      message: error.message,
      details: error.details
    });
    this.publish({ type: AgentEventType.RunFinished, runId, status: "failed", reason });
    return {
      ok: false,
      runId,
      error: { code: error.code, message: error.message, details: error.details },
      events: this.eventsForRun(eventStartIndex)
    };
  }

  private eventsForRun(eventStartIndex: number): AgentEvent[] {
    return this.eventBus.events.slice(eventStartIndex);
  }

  private publish(event: AgentEvent): void {
    this.eventBus.publish(event);
  }
}

async function executeTool(
  call: ToolCall,
  execute: (input: unknown, context: ToolExecutionContext) => Promise<ToolResult> | ToolResult,
  signal?: AbortSignal
): Promise<ToolResult> {
  try {
    const context: ToolExecutionContext = { call };
    if (signal) {
      context.signal = signal;
    }
    return await execute(call.input, context);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "TOOL_EXECUTION_FAILED",
        message: error instanceof Error ? error.message : "Tool execution failed",
        details: error
      }
    };
  }
}

function toCoreError(error: unknown): CoreError {
  return error instanceof CoreError
    ? error
    : new CoreError("PROVIDER_FAILED", error instanceof Error ? error.message : "Unknown provider failure", error);
}
