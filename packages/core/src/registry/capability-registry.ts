import { CoreError } from "../contracts/errors";
import type { ModelMetadata, Provider } from "../contracts/provider";
import type { ToolDefinition } from "../contracts/tools";

export type ToolRegistryOptions = {
  override?: false | {
    replaces: string;
    reason: string;
  };
};

export class CapabilityRegistry {
  private readonly providers = new Map<string, Provider>();
  private readonly models = new Map<string, ModelMetadata>();
  private readonly tools = new Map<string, ToolDefinition>();

  registerProvider(provider: Provider): void {
    if (this.providers.has(provider.id)) {
      throw new CoreError("CAPABILITY_ALREADY_REGISTERED", `Provider already registered: ${provider.id}`, {
        providerId: provider.id
      });
    }
    this.providers.set(provider.id, provider);
  }

  registerTool(tool: ToolDefinition, options: ToolRegistryOptions = {}): void {
    if (this.tools.has(tool.name)) {
      if (options.override && options.override.replaces === tool.name) {
        this.tools.set(tool.name, tool);
        return;
      }
      throw new CoreError("CAPABILITY_ALREADY_REGISTERED", `Tool already registered: ${tool.name}`, {
        toolName: tool.name
      });
    }
    this.tools.set(tool.name, tool);
  }

  registerModel(model: ModelMetadata): void {
    const key = modelKey(model.providerId, model.modelId);
    if (this.models.has(key)) {
      throw new CoreError("CAPABILITY_ALREADY_REGISTERED", `Model already registered: ${key}`, {
        providerId: model.providerId,
        modelId: model.modelId
      });
    }
    this.models.set(key, model);
  }

  getProvider(id: string): Provider | undefined {
    return this.providers.get(id);
  }

  removeProvider(id: string): void {
    this.providers.delete(id);
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

  getModel(providerId: string, modelId: string): ModelMetadata | undefined {
    return this.models.get(modelKey(providerId, modelId));
  }

  removeModel(providerId: string, modelId: string): void {
    this.models.delete(modelKey(providerId, modelId));
  }

  removeTool(name: string): void {
    this.tools.delete(name);
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

  listModels(): ModelMetadata[] {
    return [...this.models.values()];
  }
}

function modelKey(providerId: string, modelId: string): string {
  return `${providerId}/${modelId}`;
}
