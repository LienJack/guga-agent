import { CoreError } from "../contracts/errors";
import { AgentEventType } from "../contracts/events";
import type { HookRegistration } from "../contracts/hooks";
import {
  type LocalPlugin,
  type PluginFailure,
  type PluginShutdownResult,
  type ToolRegistrationOptions
} from "../contracts/plugins";
import type { ModelMetadata, Provider } from "../contracts/provider";
import type { ToolDefinition } from "../contracts/tools";
import { EventBus } from "../events/event-bus";
import { HookKernel } from "../hooks/hook-kernel";
import { CapabilityRegistry } from "../registry/capability-registry";

export type PluginHostConstructorOptions = {
  plugins?: LocalPlugin[];
  registry: CapabilityRegistry;
  hookKernel: HookKernel;
  eventBus: EventBus;
};

export type PluginHostInitializeOptions = {
  runId: string;
};

export type PluginHostInitializeResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: CoreError;
    };

export type PluginHostShutdownOptions = {
  runId: string;
};

type PluginContribution = {
  pluginId: string;
  providers: string[];
  models: Array<Pick<ModelMetadata, "providerId" | "modelId">>;
  tools: PluginToolContribution[];
  hooks: string[];
};

type PluginToolContribution =
  | {
      type: "registered";
      name: string;
    }
  | {
      type: "overrode";
      name: string;
      previous: ToolDefinition;
    };

export class PluginHost {
  private readonly plugins: LocalPlugin[];
  private readonly registry: CapabilityRegistry;
  private readonly hookKernel: HookKernel;
  private readonly eventBus: EventBus;
  private readonly contributions: PluginContribution[] = [];
  private readonly initializedPlugins: LocalPlugin[] = [];
  private initialized = false;

  constructor(options: PluginHostConstructorOptions) {
    this.plugins = options.plugins ?? [];
    this.registry = options.registry;
    this.hookKernel = options.hookKernel;
    this.eventBus = options.eventBus;
  }

  async initialize(options: PluginHostInitializeOptions): Promise<PluginHostInitializeResult> {
    if (this.initialized) {
      return { ok: true };
    }

    for (const [pluginLoadIndex, plugin] of this.plugins.entries()) {
      const contribution: PluginContribution = {
        pluginId: plugin.id,
        providers: [],
        models: [],
        tools: [],
        hooks: []
      };
      this.contributions.push(contribution);

      try {
        await plugin.init({
          pluginId: plugin.id,
          registerProvider: (provider) => this.registerProvider(options.runId, plugin.id, provider, contribution),
          registerModel: (model) => this.registerModel(options.runId, plugin.id, model, contribution),
          registerTool: (tool, toolOptions) => this.registerTool(options.runId, plugin.id, tool, contribution, toolOptions),
          registerHook: (hook) =>
            this.registerHook(options.runId, plugin.id, pluginLoadIndex, hook, contribution)
        });
        this.initializedPlugins.push(plugin);
        this.eventBus.publish({
          type: AgentEventType.PluginInitialized,
          runId: options.runId,
          pluginId: plugin.id,
          ...(plugin.name ? { pluginName: plugin.name } : {})
        });
      } catch (error) {
        const coreError = toInitError(error);
        this.eventBus.publish({
          type: AgentEventType.PluginFailure,
          runId: options.runId,
          pluginId: plugin.id,
          failure: "init",
          code: coreError.code,
          message: coreError.message,
          details: coreError.details
        });
        await this.shutdownInitializedPlugins({ runId: options.runId });
        this.cleanupContributions();
        return { ok: false, error: coreError };
      }
    }

    this.initialized = true;
    return { ok: true };
  }

  async shutdown(options: PluginHostShutdownOptions): Promise<PluginShutdownResult> {
    const failures: PluginShutdownResult["failures"] = [];

    const hookResult = await this.hookKernel.runRuntimeShutdown({ runId: options.runId });
    for (const failure of hookResult.failures) {
      failures.push({
        pluginId: failure.hook.pluginId,
        error: {
          code: "HOOK_FAILED",
          message: failure.error.message,
          details: failure.error.details
        }
      });
    }

    const pluginFailures = await this.shutdownInitializedPlugins({ runId: options.runId });
    failures.push(...pluginFailures);
    this.cleanupContributions();
    this.initialized = false;

    return {
      ok: failures.length === 0,
      failures
    };
  }

  private registerProvider(
    runId: string,
    pluginId: string,
    provider: Provider,
    contribution: PluginContribution
  ): void {
    this.registry.registerProvider(provider);
    contribution.providers.push(provider.id);
    this.eventBus.publish({
      type: AgentEventType.PluginCapabilityRegistered,
      runId,
      pluginId,
      capability: "provider",
      name: provider.id
    });
  }

  private registerTool(
    runId: string,
    pluginId: string,
    tool: ToolDefinition,
    contribution: PluginContribution,
    options?: ToolRegistrationOptions
  ): void {
    const previousTool =
      options?.override && options.override.replaces === tool.name ? this.registry.getTool(tool.name) : undefined;

    this.registry.registerTool(tool, options);
    contribution.tools.push(
      previousTool ? { type: "overrode", name: tool.name, previous: previousTool } : { type: "registered", name: tool.name }
    );
    this.eventBus.publish({
      type: AgentEventType.PluginCapabilityRegistered,
      runId,
      pluginId,
      capability: "tool",
      name: tool.name
    });
  }

  private registerModel(
    runId: string,
    pluginId: string,
    model: ModelMetadata,
    contribution: PluginContribution
  ): void {
    this.registry.registerModel(model);
    contribution.models.push({ providerId: model.providerId, modelId: model.modelId });
    this.eventBus.publish({
      type: AgentEventType.PluginCapabilityRegistered,
      runId,
      pluginId,
      capability: "model",
      name: `${model.providerId}/${model.modelId}`
    });
  }

  private registerHook(
    runId: string,
    pluginId: string,
    pluginLoadIndex: number,
    hook: HookRegistration,
    contribution: PluginContribution
  ): void {
    this.hookKernel.registerHook(pluginId, pluginLoadIndex, hook);
    contribution.hooks.push(hook.id);
    this.eventBus.publish({
      type: AgentEventType.PluginCapabilityRegistered,
      runId,
      pluginId,
      capability: "hook",
      name: hook.id
    });
  }

  private async shutdownInitializedPlugins(options: PluginHostShutdownOptions): Promise<PluginShutdownResult["failures"]> {
    const failures: PluginShutdownResult["failures"] = [];

    for (const plugin of [...this.initializedPlugins].reverse()) {
      try {
        await plugin.shutdown?.({ pluginId: plugin.id });
        this.eventBus.publish({
          type: AgentEventType.PluginShutdown,
          runId: options.runId,
          pluginId: plugin.id,
          status: "completed"
        });
      } catch (error) {
        const failure = toShutdownFailure(error);
        failures.push({ pluginId: plugin.id, error: failure });
        this.eventBus.publish({
          type: AgentEventType.PluginFailure,
          runId: options.runId,
          pluginId: plugin.id,
          failure: "shutdown",
          code: failure.code,
          message: failure.message,
          details: failure.details
        });
        this.eventBus.publish({
          type: AgentEventType.PluginShutdown,
          runId: options.runId,
          pluginId: plugin.id,
          status: "failed"
        });
      }
    }

    this.initializedPlugins.length = 0;
    return failures;
  }

  private cleanupContributions(): void {
    for (const contribution of [...this.contributions].reverse()) {
      for (const providerId of contribution.providers) {
        this.registry.removeProvider(providerId);
      }
      for (const model of contribution.models) {
        this.registry.removeModel(model.providerId, model.modelId);
      }
      for (const tool of [...contribution.tools].reverse()) {
        if (tool.type === "overrode") {
          this.registry.registerTool(tool.previous, {
            override: { replaces: tool.name, reason: `restore plugin override from ${contribution.pluginId}` }
          });
        } else {
          this.registry.removeTool(tool.name);
        }
      }
    }
    this.contributions.length = 0;
    this.hookKernel.clear();
  }
}

function toInitError(error: unknown): CoreError {
  if (error instanceof CoreError) {
    return error;
  }

  return new CoreError(
    "PLUGIN_INIT_FAILED",
    error instanceof Error ? error.message : "Plugin initialization failed",
    error
  );
}

function toShutdownFailure(error: unknown): PluginFailure {
  return {
    code: "PLUGIN_SHUTDOWN_FAILED",
    message: error instanceof Error ? error.message : "Plugin shutdown failed",
    details: error
  };
}
