import { CoreError } from "../contracts/errors";
import { AgentEventType } from "../contracts/events";
import type { ContextPolicy } from "../contracts/context";
import type { HookRegistration } from "../contracts/hooks";
import type { ArtifactStore, EventStore, ReplayCapability, SessionStore } from "../contracts/persistence";
import {
  type LocalPlugin,
  type CapabilityRegistrationOptions,
  type PluginFailure,
  type PluginShutdownResult,
  type SkillMetadata,
  type ToolRegistrationOptions
} from "../contracts/plugins";
import type { AgentPersistenceCapabilities } from "../contracts/runtime";
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
  persistence?: AgentPersistenceCapabilities;
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
  skills: string[];
  hooks: string[];
  contextPolicies: string[];
  eventStores: string[];
  sessionStores: string[];
  artifactStores: string[];
  replayCapabilities: string[];
  operations: string[];
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
  private readonly persistence: PluginHostConstructorOptions["persistence"];
  private readonly contributions: PluginContribution[] = [];
  private readonly initializedPlugins: LocalPlugin[] = [];
  private initialized = false;

  constructor(options: PluginHostConstructorOptions) {
    this.plugins = options.plugins ?? [];
    this.registry = options.registry;
    this.hookKernel = options.hookKernel;
    this.eventBus = options.eventBus;
    this.persistence = options.persistence;
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
        skills: [],
        hooks: [],
        contextPolicies: [],
        eventStores: [],
        sessionStores: [],
        artifactStores: [],
        replayCapabilities: [],
        operations: []
      };
      this.contributions.push(contribution);

      try {
        await plugin.init({
          pluginId: plugin.id,
          registerProvider: (provider, providerOptions) =>
            this.registerProvider(options.runId, plugin.id, provider, contribution, providerOptions),
          registerModel: (model, modelOptions) =>
            this.registerModel(options.runId, plugin.id, model, contribution, modelOptions),
          registerTool: (tool, toolOptions) =>
            this.registerTool(options.runId, plugin.id, tool, contribution, toolOptions),
          registerSkill: (skill, skillOptions) =>
            this.registerSkill(options.runId, plugin.id, skill, contribution, skillOptions),
          registerHook: (hook, hookOptions) =>
            this.registerHook(options.runId, plugin.id, pluginLoadIndex, hook, contribution, hookOptions),
          registerContextPolicy: (policy, policyOptions) =>
            this.registerContextPolicy(options.runId, plugin.id, policy, contribution, policyOptions),
          registerEventStore: (store) => this.registerEventStore(options.runId, plugin.id, store, contribution),
          registerSessionStore: (store) => this.registerSessionStore(options.runId, plugin.id, store, contribution),
          registerArtifactStore: (store) => this.registerArtifactStore(options.runId, plugin.id, store, contribution),
          registerReplayCapability: (capability) =>
            this.registerReplayCapability(options.runId, plugin.id, capability, contribution),
          registerOperation: (name, operationOptions) =>
            this.registerOperation(options.runId, plugin.id, name, contribution, operationOptions),
          getEventStore: () => this.persistence?.eventStore ?? this.registry.getEventStore(),
          getSessionStore: () => this.persistence?.sessionStore ?? this.registry.getSessionStore(),
          getArtifactStore: () => this.persistence?.artifactStore ?? this.registry.getArtifactStore()
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
    contribution: PluginContribution,
    options: CapabilityRegistrationOptions = {}
  ): void {
    this.registry.registerProvider(provider, pluginCapabilityOptions(pluginId, options));
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

    this.registry.registerTool(tool, { ...options, source: options?.source ?? "plugin", ownerPluginId: pluginId });
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
    contribution: PluginContribution,
    options: CapabilityRegistrationOptions = {}
  ): void {
    this.registry.registerModel(model, pluginCapabilityOptions(pluginId, options));
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
    contribution: PluginContribution,
    options: CapabilityRegistrationOptions = {}
  ): void {
    this.hookKernel.registerHook(pluginId, pluginLoadIndex, hook);
    this.registry.registerHookCapability(hook.id, pluginCapabilityOptions(pluginId, options));
    contribution.hooks.push(hook.id);
    this.eventBus.publish({
      type: AgentEventType.PluginCapabilityRegistered,
      runId,
      pluginId,
      capability: "hook",
      name: hook.id
    });
  }

  private registerSkill(
    runId: string,
    pluginId: string,
    skill: SkillMetadata,
    contribution: PluginContribution,
    options: CapabilityRegistrationOptions = {}
  ): void {
    this.registry.registerSkill(skill, {
      ...pluginCapabilityOptions(pluginId, options),
      ...(skill.namespace ? { namespace: skill.namespace } : {})
    });
    contribution.skills.push(skill.name);
    this.eventBus.publish({
      type: AgentEventType.PluginCapabilityRegistered,
      runId,
      pluginId,
      capability: "skill",
      name: skill.name
    });
  }

  private registerContextPolicy(
    runId: string,
    pluginId: string,
    policy: ContextPolicy,
    contribution: PluginContribution,
    options: CapabilityRegistrationOptions = {}
  ): void {
    const registeredPolicy = {
      ...policy,
      auditIdentity: {
        ...policy.auditIdentity,
        pluginId: policy.auditIdentity.pluginId ?? pluginId
      }
    };
    this.registry.registerContextPolicy(registeredPolicy, pluginCapabilityOptions(pluginId, options));
    this.hookKernel.registerContextPolicy(pluginId, registeredPolicy);
    contribution.contextPolicies.push(policy.id);
    this.eventBus.publish({
      type: AgentEventType.PluginCapabilityRegistered,
      runId,
      pluginId,
      capability: "context-policy",
      name: policy.id
    });
  }

  private registerEventStore(
    runId: string,
    pluginId: string,
    store: EventStore,
    contribution: PluginContribution
  ): void {
    this.registry.registerEventStore(store, "default", { source: "plugin", ownerPluginId: pluginId });
    contribution.eventStores.push("default");
    this.eventBus.publish({
      type: AgentEventType.PluginCapabilityRegistered,
      runId,
      pluginId,
      capability: "event-store",
      name: "default"
    });
  }

  private registerSessionStore(
    runId: string,
    pluginId: string,
    store: SessionStore,
    contribution: PluginContribution
  ): void {
    this.registry.registerSessionStore(store, "default", { source: "plugin", ownerPluginId: pluginId });
    contribution.sessionStores.push("default");
    this.eventBus.publish({
      type: AgentEventType.PluginCapabilityRegistered,
      runId,
      pluginId,
      capability: "session-store",
      name: "default"
    });
  }

  private registerArtifactStore(
    runId: string,
    pluginId: string,
    store: ArtifactStore,
    contribution: PluginContribution
  ): void {
    this.registry.registerArtifactStore(store, "default", { source: "plugin", ownerPluginId: pluginId });
    contribution.artifactStores.push("default");
    this.eventBus.publish({
      type: AgentEventType.PluginCapabilityRegistered,
      runId,
      pluginId,
      capability: "artifact-store",
      name: "default"
    });
  }

  private registerReplayCapability(
    runId: string,
    pluginId: string,
    capability: ReplayCapability,
    contribution: PluginContribution
  ): void {
    this.registry.registerReplayCapability(capability, "default", { source: "plugin", ownerPluginId: pluginId });
    contribution.replayCapabilities.push("default");
    this.eventBus.publish({
      type: AgentEventType.PluginCapabilityRegistered,
      runId,
      pluginId,
      capability: "replay",
      name: "default"
    });
  }

  private registerOperation(
    runId: string,
    pluginId: string,
    name: string,
    contribution: PluginContribution,
    options: CapabilityRegistrationOptions = {}
  ): void {
    this.registry.registerOperationCapability(name, {
      ...options,
      source: options.source ?? "plugin",
      ownerPluginId: options.ownerPluginId ?? pluginId
    });
    contribution.operations.push(name);
    this.eventBus.publish({
      type: AgentEventType.PluginCapabilityRegistered,
      runId,
      pluginId,
      capability: "operation",
      name
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
      for (const skillName of contribution.skills) {
        this.registry.removeSkill(skillName);
      }
      for (const hookId of contribution.hooks) {
        this.registry.removeHookCapability(hookId, { ownerPluginId: contribution.pluginId });
      }
      for (const policyId of contribution.contextPolicies) {
        this.registry.removeContextPolicy(policyId);
      }
      for (const eventStoreId of contribution.eventStores) {
        this.registry.removeEventStore(eventStoreId);
      }
      for (const sessionStoreId of contribution.sessionStores) {
        this.registry.removeSessionStore(sessionStoreId);
      }
      for (const artifactStoreId of contribution.artifactStores) {
        this.registry.removeArtifactStore(artifactStoreId);
      }
      for (const replayCapabilityId of contribution.replayCapabilities) {
        this.registry.removeReplayCapability(replayCapabilityId);
      }
      for (const operationId of contribution.operations) {
        this.registry.removeOperationCapability(operationId, { ownerPluginId: contribution.pluginId });
      }
      this.hookKernel.removeContextPolicy(contribution.pluginId);
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

function pluginCapabilityOptions(
  pluginId: string,
  options: CapabilityRegistrationOptions = {}
): CapabilityRegistrationOptions {
  return {
    ...options,
    source: options.source ?? "plugin",
    ownerPluginId: options.ownerPluginId ?? pluginId
  };
}
