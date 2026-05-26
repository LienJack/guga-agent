import { CoreError } from "../contracts/errors";
import type { Provider } from "../contracts/provider";
import type { ToolDefinition } from "../contracts/tools";

export class CapabilityRegistry {
  private readonly providers = new Map<string, Provider>();
  private readonly tools = new Map<string, ToolDefinition>();

  registerProvider(provider: Provider): void {
    if (this.providers.has(provider.id)) {
      throw new CoreError("CAPABILITY_ALREADY_REGISTERED", `Provider already registered: ${provider.id}`, {
        providerId: provider.id
      });
    }
    this.providers.set(provider.id, provider);
  }

  registerTool(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new CoreError("CAPABILITY_ALREADY_REGISTERED", `Tool already registered: ${tool.name}`, {
        toolName: tool.name
      });
    }
    this.tools.set(tool.name, tool);
  }

  getProvider(id: string): Provider | undefined {
    return this.providers.get(id);
  }

  requireProvider(id: string): Provider {
    const provider = this.getProvider(id);
    if (!provider) {
      throw new CoreError("PROVIDER_NOT_FOUND", `Provider not registered: ${id}`, { providerId: id });
    }
    return provider;
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  requireTool(name: string): ToolDefinition {
    const tool = this.getTool(name);
    if (!tool) {
      throw new CoreError("TOOL_NOT_FOUND", `Tool not registered: ${name}`, { toolName: name });
    }
    return tool;
  }

  listTools(): ToolDefinition[] {
    return [...this.tools.values()];
  }
}
