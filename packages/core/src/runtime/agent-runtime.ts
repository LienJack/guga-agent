import type { AgentEvent } from "../contracts/events";
import type { Provider } from "../contracts/provider";
import type { AgentRunOptions, AgentRunResult, AgentRuntime as AgentRuntimeContract } from "../contracts/runtime";
import type { ToolDefinition } from "../contracts/tools";
import { EventBus } from "../events/event-bus";
import { AgentLoop } from "../loop/agent-loop";
import { CapabilityRegistry } from "../registry/capability-registry";

export class AgentRuntime implements AgentRuntimeContract {
  private readonly registry = new CapabilityRegistry();
  private readonly eventBus = new EventBus();

  registerProvider(provider: Provider): void {
    this.registry.registerProvider(provider);
  }

  registerTool(tool: ToolDefinition): void {
    this.registry.registerTool(tool);
  }

  onEvent(listener: (event: AgentEvent) => void): () => void {
    return this.eventBus.subscribe(listener);
  }

  run(options: AgentRunOptions): Promise<AgentRunResult> {
    return new AgentLoop({ registry: this.registry, eventBus: this.eventBus }).run(options);
  }

  dispose(): void {
    this.eventBus.dispose();
  }
}
