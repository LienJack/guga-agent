import { CoreError } from "../contracts/errors";
import type { AgentEvent } from "../contracts/events";
import { AgentEventType } from "../contracts/events";
import type { Provider } from "../contracts/provider";
import type {
  AgentRunFailure,
  AgentRunOptions,
  AgentRunResult,
  AgentRuntime as AgentRuntimeContract,
  AgentRuntimeOptions,
  AgentRuntimeShutdownResult
} from "../contracts/runtime";
import type { ToolDefinition } from "../contracts/tools";
import { EventBus } from "../events/event-bus";
import { HookKernel } from "../hooks/hook-kernel";
import { AgentLoop } from "../loop/agent-loop";
import { PluginHost } from "../plugin-host/plugin-host";
import { CapabilityRegistry } from "../registry/capability-registry";

export class AgentRuntime implements AgentRuntimeContract {
  private readonly registry = new CapabilityRegistry();
  private readonly eventBus = new EventBus();
  private readonly hookKernel: HookKernel;
  private readonly pluginHost: PluginHost;
  private disposed = false;

  constructor(options: AgentRuntimeOptions = {}) {
    this.hookKernel = new HookKernel({ eventBus: this.eventBus });
    this.pluginHost = new PluginHost({
      plugins: options.plugins ?? [],
      registry: this.registry,
      hookKernel: this.hookKernel,
      eventBus: this.eventBus
    });
  }

  registerProvider(provider: Provider): void {
    this.assertNotDisposed();
    this.registry.registerProvider(provider);
  }

  registerTool(tool: ToolDefinition): void {
    this.assertNotDisposed();
    this.registry.registerTool(tool);
  }

  onEvent(listener: (event: AgentEvent) => void): () => void {
    return this.eventBus.subscribe(listener);
  }

  async run(options: AgentRunOptions): Promise<AgentRunResult> {
    const runId = options.runId ?? crypto.randomUUID();
    const eventStartIndex = this.eventBus.events.length;

    if (this.disposed) {
      return this.failRuntime(
        runId,
        eventStartIndex,
        new CoreError("RUNTIME_DISPOSED", "Runtime has been disposed"),
        "runtime_disposed"
      );
    }

    const initializeResult = await this.pluginHost.initialize({ runId });
    if (!initializeResult.ok) {
      return this.failRuntime(runId, eventStartIndex, initializeResult.error, "plugin_init_failed");
    }

    const startHooks = await this.hookKernel.runRuntimeStart({ runId });
    if (startHooks.failures.length > 0) {
      const [failure] = startHooks.failures;
      return this.failRuntime(
        runId,
        eventStartIndex,
        new CoreError("HOOK_FAILED", failure?.error.message ?? "Runtime start hook failed", failure),
        "hook_failed"
      );
    }

    return new AgentLoop({
      registry: this.registry,
      eventBus: this.eventBus,
      eventStartIndex,
      hookKernel: this.hookKernel
    }).run({ ...options, runId });
  }

  async dispose(): Promise<AgentRuntimeShutdownResult> {
    if (this.disposed) {
      return {
        ok: true,
        runId: "runtime-dispose",
        failures: [],
        events: []
      };
    }

    const runId = `runtime-shutdown-${crypto.randomUUID()}`;
    const eventStartIndex = this.eventBus.events.length;
    const shutdownResult = await this.pluginHost.shutdown({ runId });
    const events = this.eventBus.events.slice(eventStartIndex);
    this.eventBus.dispose();
    this.disposed = true;

    return {
      ok: shutdownResult.ok,
      runId,
      failures: shutdownResult.failures.map((failure) => failure.error),
      events
    };
  }

  private failRuntime(runId: string, eventStartIndex: number, error: CoreError, reason: string): AgentRunFailure {
    this.eventBus.publish({
      type: AgentEventType.Error,
      runId,
      code: error.code,
      message: error.message,
      details: error.details
    });
    this.eventBus.publish({ type: AgentEventType.RunFinished, runId, status: "failed", reason });

    return {
      ok: false,
      runId,
      error: { code: error.code, message: error.message, details: error.details },
      events: this.eventBus.events.slice(eventStartIndex)
    };
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new CoreError("RUNTIME_DISPOSED", "Runtime has been disposed");
    }
  }
}
