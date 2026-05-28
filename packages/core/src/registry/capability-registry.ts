import { CoreError } from "../contracts/errors";
import type { ContextPolicy } from "../contracts/context";
import type { ArtifactStore, EventStore, ReplayCapability, SessionStore } from "../contracts/persistence";
import type { ModelMetadata, Provider } from "../contracts/provider";
import type {
  CapabilityDiff,
  CapabilityDescriptor,
  CapabilityLayer,
  CapabilityOverrideDeclaration,
  CapabilityOverrideDescriptor,
  CapabilityRegistrationOptions,
  CapabilitySource,
  CapabilityStatus,
  PluginCapabilityKind,
  SkillMetadata
} from "../contracts/plugins";
import type { ToolDefinition } from "../contracts/tools";

const DEFAULT_PERSISTENCE_CAPABILITY_ID = "default";
const DEFAULT_CAPABILITY_SOURCE: CapabilitySource = "host";

export type ToolRegistryOptions = Omit<CapabilityRegistrationOptions, "override"> & {
  override?: false | CapabilityOverrideDeclaration;
};

type CapabilityKindForRegistry =
  | "provider"
  | "model"
  | "tool"
  | "skill"
  | "hook"
  | "context-policy"
  | "event-store"
  | "session-store"
  | "artifact-store"
  | "replay"
  | "operation";

type DescriptorInput = CapabilityRegistrationOptions & {
  reason?: string;
  status?: CapabilityStatus;
};

export class CapabilityRegistry {
  private readonly providers = new Map<string, Provider>();
  private readonly models = new Map<string, ModelMetadata>();
  private readonly tools = new Map<string, ToolDefinition>();
  private readonly skills = new Map<string, SkillMetadata>();
  private readonly contextPolicies = new Map<string, ContextPolicy>();
  private readonly eventStores = new Map<string, EventStore>();
  private readonly sessionStores = new Map<string, SessionStore>();
  private readonly artifactStores = new Map<string, ArtifactStore>();
  private readonly replayCapabilities = new Map<string, ReplayCapability>();
  private readonly descriptors = new Map<string, CapabilityDescriptor>();

  registerProvider(provider: Provider, options: CapabilityRegistrationOptions = {}): void {
    if (this.providers.has(provider.id)) {
      throw new CoreError("CAPABILITY_ALREADY_REGISTERED", `Provider already registered: ${provider.id}`, {
        providerId: provider.id
      });
    }
    this.providers.set(provider.id, provider);
    this.recordDescriptor("provider", provider.id, options);
  }

  registerTool(tool: ToolDefinition, options: ToolRegistryOptions = {}): void {
    if (this.tools.has(tool.name)) {
      if (options.override && options.override.replaces === tool.name) {
        this.assertToolOverrideAllowed(tool.name, options);
        this.tools.set(tool.name, tool);
        this.recordDescriptor("tool", tool.name, toolDescriptorInput(options));
        return;
      }
      throw new CoreError("CAPABILITY_ALREADY_REGISTERED", `Tool already registered: ${tool.name}`, {
        toolName: tool.name
      });
    }
    this.tools.set(tool.name, tool);
    this.recordDescriptor("tool", tool.name, toolDescriptorInput(options));
  }

  registerModel(model: ModelMetadata, options: CapabilityRegistrationOptions = {}): void {
    const key = modelKey(model.providerId, model.modelId);
    if (this.models.has(key)) {
      throw new CoreError("CAPABILITY_ALREADY_REGISTERED", `Model already registered: ${key}`, {
        providerId: model.providerId,
        modelId: model.modelId
      });
    }
    this.models.set(key, model);
    this.recordDescriptor("model", key, options);
  }

  registerSkill(skill: SkillMetadata, options: CapabilityRegistrationOptions = {}): void {
    if (this.skills.has(skill.name)) {
      throw new CoreError("CAPABILITY_ALREADY_REGISTERED", `Skill already registered: ${skill.name}`, {
        skillName: skill.name
      });
    }
    this.skills.set(skill.name, skill);
    this.recordDescriptor("skill", skill.name, {
      ...options,
      ...(skill.namespace ?? options.namespace ? { namespace: skill.namespace ?? options.namespace } : {}),
      ...(options.ownerPluginId ? { ownerPluginId: options.ownerPluginId } : {}),
      ...(options.source ? { source: options.source } : {})
    });
  }

  registerContextPolicy(policy: ContextPolicy, options: CapabilityRegistrationOptions = {}): void {
    if (this.contextPolicies.has(policy.id)) {
      throw new CoreError("CAPABILITY_ALREADY_REGISTERED", `Context policy already registered: ${policy.id}`, {
        contextPolicyId: policy.id
      });
    }
    this.contextPolicies.set(policy.id, policy);
    this.recordDescriptor("context-policy", policy.id, options);
  }

  registerEventStore(
    store: EventStore,
    id = DEFAULT_PERSISTENCE_CAPABILITY_ID,
    options: CapabilityRegistrationOptions = {}
  ): void {
    if (this.eventStores.has(id)) {
      throw new CoreError("CAPABILITY_ALREADY_REGISTERED", `Event store already registered: ${id}`, {
        eventStoreId: id
      });
    }
    this.eventStores.set(id, store);
    this.recordDescriptor("event-store", id, options);
  }

  registerSessionStore(
    store: SessionStore,
    id = DEFAULT_PERSISTENCE_CAPABILITY_ID,
    options: CapabilityRegistrationOptions = {}
  ): void {
    if (this.sessionStores.has(id)) {
      throw new CoreError("CAPABILITY_ALREADY_REGISTERED", `Session store already registered: ${id}`, {
        sessionStoreId: id
      });
    }
    this.sessionStores.set(id, store);
    this.recordDescriptor("session-store", id, options);
  }

  registerArtifactStore(
    store: ArtifactStore,
    id = DEFAULT_PERSISTENCE_CAPABILITY_ID,
    options: CapabilityRegistrationOptions = {}
  ): void {
    if (this.artifactStores.has(id)) {
      throw new CoreError("CAPABILITY_ALREADY_REGISTERED", `Artifact store already registered: ${id}`, {
        artifactStoreId: id
      });
    }
    this.artifactStores.set(id, store);
    this.recordDescriptor("artifact-store", id, options);
  }

  registerReplayCapability(
    capability: ReplayCapability,
    id = DEFAULT_PERSISTENCE_CAPABILITY_ID,
    options: CapabilityRegistrationOptions = {}
  ): void {
    if (this.replayCapabilities.has(id)) {
      throw new CoreError("CAPABILITY_ALREADY_REGISTERED", `Replay capability already registered: ${id}`, {
        replayCapabilityId: id
      });
    }
    this.replayCapabilities.set(id, capability);
    this.recordDescriptor("replay", id, options);
  }

  getProvider(id: string): Provider | undefined {
    return this.providers.get(id);
  }

  removeProvider(id: string): void {
    this.providers.delete(id);
    this.removeDescriptor("provider", id);
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
    const key = modelKey(providerId, modelId);
    this.models.delete(key);
    this.removeDescriptor("model", key);
  }

  removeTool(name: string): void {
    this.tools.delete(name);
    this.removeDescriptor("tool", name);
  }

  removeContextPolicy(id: string): void {
    this.contextPolicies.delete(id);
    this.removeDescriptor("context-policy", id);
  }

  getEventStore(id = DEFAULT_PERSISTENCE_CAPABILITY_ID): EventStore | undefined {
    return this.eventStores.get(id);
  }

  getSessionStore(id = DEFAULT_PERSISTENCE_CAPABILITY_ID): SessionStore | undefined {
    return this.sessionStores.get(id);
  }

  getArtifactStore(id = DEFAULT_PERSISTENCE_CAPABILITY_ID): ArtifactStore | undefined {
    return this.artifactStores.get(id);
  }

  getReplayCapability(id = DEFAULT_PERSISTENCE_CAPABILITY_ID): ReplayCapability | undefined {
    return this.replayCapabilities.get(id);
  }

  removeEventStore(id = DEFAULT_PERSISTENCE_CAPABILITY_ID): void {
    this.eventStores.delete(id);
    this.removeDescriptor("event-store", id);
  }

  removeSessionStore(id = DEFAULT_PERSISTENCE_CAPABILITY_ID): void {
    this.sessionStores.delete(id);
    this.removeDescriptor("session-store", id);
  }

  removeArtifactStore(id = DEFAULT_PERSISTENCE_CAPABILITY_ID): void {
    this.artifactStores.delete(id);
    this.removeDescriptor("artifact-store", id);
  }

  removeReplayCapability(id = DEFAULT_PERSISTENCE_CAPABILITY_ID): void {
    this.replayCapabilities.delete(id);
    this.removeDescriptor("replay", id);
  }

  requireTool(name: string): ToolDefinition {
    const tool = this.getTool(name);
    if (!tool) {
      throw new CoreError("TOOL_NOT_FOUND", `Tool not registered: ${name}`, { toolName: name });
    }
    return tool;
  }

  getSkill(name: string): SkillMetadata | undefined {
    return this.skills.get(name);
  }

  removeSkill(name: string): void {
    this.skills.delete(name);
    this.removeDescriptor("skill", name);
  }

  registerHookCapability(id: string, options: CapabilityRegistrationOptions = {}): void {
    this.recordDescriptor("hook", id, options);
  }

  removeHookCapability(id: string, options: CapabilityRegistrationOptions = {}): void {
    this.removeDescriptor("hook", id, options);
  }

  registerOperationCapability(id: string, options: CapabilityRegistrationOptions = {}): void {
    this.recordDescriptor("operation", id, options);
  }

  recordCapabilityConflict(
    type: PluginCapabilityKind,
    name: string,
    input: CapabilityRegistrationOptions & {
      status: "skipped-conflict" | "rejected-conflict";
      reason: string;
    }
  ): CapabilityDescriptor {
    this.recordDescriptor(type, name, input);
    return this.descriptors.get(descriptorKey(type, name, input)) as CapabilityDescriptor;
  }

  removeOperationCapability(id: string, options: CapabilityRegistrationOptions = {}): void {
    this.removeDescriptor("operation", id, options);
  }

  requireEventStore(id = DEFAULT_PERSISTENCE_CAPABILITY_ID): EventStore {
    const store = this.getEventStore(id);
    if (!store) {
      throw new CoreError("PERSISTENCE_CAPABILITY_NOT_FOUND", `Event store not registered: ${id}`, {
        eventStoreId: id
      });
    }
    return store;
  }

  requireSessionStore(id = DEFAULT_PERSISTENCE_CAPABILITY_ID): SessionStore {
    const store = this.getSessionStore(id);
    if (!store) {
      throw new CoreError("PERSISTENCE_CAPABILITY_NOT_FOUND", `Session store not registered: ${id}`, {
        sessionStoreId: id
      });
    }
    return store;
  }

  requireArtifactStore(id = DEFAULT_PERSISTENCE_CAPABILITY_ID): ArtifactStore {
    const store = this.getArtifactStore(id);
    if (!store) {
      throw new CoreError("PERSISTENCE_CAPABILITY_NOT_FOUND", `Artifact store not registered: ${id}`, {
        artifactStoreId: id
      });
    }
    return store;
  }

  requireReplayCapability(id = DEFAULT_PERSISTENCE_CAPABILITY_ID): ReplayCapability {
    const capability = this.getReplayCapability(id);
    if (!capability) {
      throw new CoreError("PERSISTENCE_CAPABILITY_NOT_FOUND", `Replay capability not registered: ${id}`, {
        replayCapabilityId: id
      });
    }
    return capability;
  }

  listTools(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  listSkills(): SkillMetadata[] {
    return [...this.skills.values()];
  }

  listModels(): ModelMetadata[] {
    return [...this.models.values()];
  }

  listContextPolicies(): ContextPolicy[] {
    return [...this.contextPolicies.values()].sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0));
  }

  listEventStores(): EventStore[] {
    return [...this.eventStores.values()];
  }

  listSessionStores(): SessionStore[] {
    return [...this.sessionStores.values()];
  }

  listArtifactStores(): ArtifactStore[] {
    return [...this.artifactStores.values()];
  }

  listReplayCapabilities(): ReplayCapability[] {
    return [...this.replayCapabilities.values()];
  }

  listCapabilityDescriptors(): CapabilityDescriptor[] {
    return [...this.descriptors.values()].sort((left, right) =>
      left.type === right.type ? left.name.localeCompare(right.name) : left.type.localeCompare(right.type)
    );
  }

  private recordDescriptor(type: CapabilityKindForRegistry, name: string, input: DescriptorInput = {}): void {
    const descriptor = normalizeDescriptor({
      type,
      name,
      source: input.source ?? DEFAULT_CAPABILITY_SOURCE,
      status: input.status ?? "registered",
      ...(input.layer ? { layer: input.layer } : {}),
      ...(input.namespace ? { namespace: input.namespace } : {}),
      ...(input.ownerPluginId ? { ownerPluginId: input.ownerPluginId } : {}),
      ...(input.owner ? { owner: input.owner } : {}),
      ...(input.trust ? { trust: input.trust } : {}),
      ...(input.declaredEffects ? { declaredEffects: input.declaredEffects } : {}),
      ...(input.permissionRequirements ? { permissionRequirements: input.permissionRequirements } : {}),
      ...(input.dependencies ? { dependencies: input.dependencies } : {}),
      ...(input.lifecycle ? { lifecycle: input.lifecycle } : {}),
      ...(input.extension ? { extension: input.extension } : {}),
      ...(input.override ? { override: normalizeOverrideDescriptor(type, name, input.override) } : {}),
      ...(input.reason ? { reason: input.reason } : {})
    } satisfies CapabilityDescriptor);
    this.descriptors.set(descriptorKey(type, name, descriptor), descriptor);
  }

  private removeDescriptor(type: CapabilityKindForRegistry, name: string, input: CapabilityRegistrationOptions = {}): void {
    this.descriptors.delete(descriptorKey(type, name, input));
  }

  private assertToolOverrideAllowed(name: string, options: ToolRegistryOptions): void {
    const existing = this.descriptors.get(descriptorKey("tool", name));
    if (!existing) {
      return;
    }

    const replacementSource = options.source ?? DEFAULT_CAPABILITY_SOURCE;
    const replacementIsExtension = replacementSource === "plugin" || replacementSource === "mcp";
    if (replacementIsExtension && existing.source === "built-in") {
      throw new CoreError("CAPABILITY_OVERRIDE_DENIED", `Extension cannot override built-in tool without host policy: ${name}`, {
        toolName: name,
        source: replacementSource,
        target: existing
      });
    }

    if (replacementIsExtension && existing.override?.status === "active") {
      throw new CoreError("CAPABILITY_OVERRIDE_DENIED", `Chained tool override is not supported: ${name}`, {
        toolName: name,
        source: replacementSource,
        target: existing
      });
    }
  }
}

function modelKey(providerId: string, modelId: string): string {
  return `${providerId}/${modelId}`;
}

function toolDescriptorInput(options: ToolRegistryOptions): DescriptorInput {
  const { override, ...descriptorOptions } = options;
  return {
    ...descriptorOptions,
    ...(override ? normalizedToolOverrideInput(override) : {})
  };
}

function normalizedToolOverrideInput(override: CapabilityOverrideDeclaration): Pick<DescriptorInput, "reason" | "override"> {
  return {
    reason: override.reason,
    override: normalizeOverrideDescriptor("tool", override.replaces, override)
  };
}

function descriptorKey(type: CapabilityKindForRegistry, name: string, input: CapabilityRegistrationOptions = {}): string {
  const status = (input as { status?: CapabilityStatus }).status;
  if (status === "skipped-conflict" || status === "rejected-conflict") {
    return `${type}:${status}:${input.source ?? ""}:${input.ownerPluginId ?? ""}:${input.namespace ?? ""}:${name}`;
  }
  if (type === "hook") {
    return `${type}:${input.ownerPluginId ?? ""}:${name}`;
  }
  return `${type}:${name}`;
}

export function diffCapabilityDescriptors(
  before: CapabilityDescriptor[],
  after: CapabilityDescriptor[]
): CapabilityDiff {
  const beforeByKey = new Map(before.map((descriptor) => [descriptorIdentity(descriptor), descriptor]));
  const afterByKey = new Map(after.map((descriptor) => [descriptorIdentity(descriptor), descriptor]));
  const added: CapabilityDescriptor[] = [];
  const removed: CapabilityDescriptor[] = [];
  const changed: CapabilityDiff["changed"] = [];

  for (const [key, afterDescriptor] of afterByKey) {
    const beforeDescriptor = beforeByKey.get(key);
    if (!beforeDescriptor) {
      added.push(afterDescriptor);
      continue;
    }
    if (!descriptorEquals(beforeDescriptor, afterDescriptor)) {
      changed.push({ before: beforeDescriptor, after: afterDescriptor });
    }
  }

  for (const [key, beforeDescriptor] of beforeByKey) {
    if (!afterByKey.has(key)) {
      removed.push(beforeDescriptor);
    }
  }

  return {
    added: sortDescriptors(added),
    removed: sortDescriptors(removed),
    changed: changed.sort((left, right) =>
      descriptorIdentity(left.before).localeCompare(descriptorIdentity(right.before))
    ),
    skippedConflicts: sortDescriptors(after.filter((descriptor) => descriptor.status === "skipped-conflict")),
    rejectedConflicts: sortDescriptors(after.filter((descriptor) => descriptor.status === "rejected-conflict"))
  };
}

function descriptorIdentity(descriptor: CapabilityDescriptor): string {
  if (descriptor.status === "skipped-conflict" || descriptor.status === "rejected-conflict") {
    return [
      descriptor.type,
      descriptor.name,
      descriptor.status,
      descriptor.source,
      descriptor.namespace ?? "",
      descriptor.ownerPluginId ?? "",
      descriptor.reason ?? ""
    ].join(":");
  }
  return `${descriptor.type}:${descriptor.name}`;
}

function descriptorEquals(left: CapabilityDescriptor, right: CapabilityDescriptor): boolean {
  return left.type === right.type
    && left.name === right.name
    && left.source === right.source
    && left.status === right.status
    && left.layer === right.layer
    && left.namespace === right.namespace
    && left.ownerPluginId === right.ownerPluginId
    && JSON.stringify(left.owner ?? null) === JSON.stringify(right.owner ?? null)
    && JSON.stringify(left.trust ?? null) === JSON.stringify(right.trust ?? null)
    && JSON.stringify(left.declaredEffects ?? null) === JSON.stringify(right.declaredEffects ?? null)
    && JSON.stringify(left.permissionRequirements ?? null) === JSON.stringify(right.permissionRequirements ?? null)
    && JSON.stringify(left.dependencies ?? null) === JSON.stringify(right.dependencies ?? null)
    && JSON.stringify(left.lifecycle ?? null) === JSON.stringify(right.lifecycle ?? null)
    && JSON.stringify(left.extension ?? null) === JSON.stringify(right.extension ?? null)
    && JSON.stringify(left.override ?? null) === JSON.stringify(right.override ?? null)
    && left.reason === right.reason;
}

function sortDescriptors(descriptors: CapabilityDescriptor[]): CapabilityDescriptor[] {
  return [...descriptors].sort((left, right) => descriptorIdentity(left).localeCompare(descriptorIdentity(right)));
}

function normalizeDescriptor(descriptor: CapabilityDescriptor): CapabilityDescriptor {
  const layer = descriptor.layer ?? defaultLayerForSource(descriptor.source);
  const normalized = {
    ...descriptor,
    ...(layer === "built-in-core" ? { layer } : {}),
    ...(descriptor.source === "built-in" && !descriptor.owner ? { owner: { kind: "core" as const, id: "guga-core" } } : {})
  };

  assertValidDescriptor(normalized);
  return normalized;
}

function defaultLayerForSource(source: CapabilitySource): CapabilityLayer | undefined {
  if (source === "built-in") {
    return "built-in-core";
  }
  return undefined;
}

function assertValidDescriptor(descriptor: CapabilityDescriptor): void {
  if (descriptor.source === "built-in") {
    if (descriptor.ownerPluginId || descriptor.owner?.kind === "extension") {
      throw new CoreError("INVALID_CAPABILITY_DESCRIPTOR", "Built-in capabilities cannot be owned by an extension", {
        type: descriptor.type,
        name: descriptor.name
      });
    }
    if (descriptor.layer && descriptor.layer !== "built-in-core") {
      throw new CoreError("INVALID_CAPABILITY_DESCRIPTOR", "Built-in capabilities must use the built-in-core layer", {
        type: descriptor.type,
        name: descriptor.name,
        layer: descriptor.layer
      });
    }
  }

  if ((descriptor.source === "plugin" || descriptor.source === "mcp") && descriptor.layer === "built-in-core") {
    throw new CoreError("INVALID_CAPABILITY_DESCRIPTOR", "Extension capabilities cannot use the built-in-core layer", {
      type: descriptor.type,
      name: descriptor.name,
      source: descriptor.source
    });
  }
}

function normalizeOverrideDescriptor(
  type: CapabilityKindForRegistry,
  name: string,
  override: CapabilityOverrideDeclaration | CapabilityOverrideDescriptor
): CapabilityOverrideDescriptor {
  if ("status" in override) {
    return override;
  }

  return {
    status: override.reason.startsWith("restore ") ? "restored" : "active",
    target: override.target ?? { type, name },
    reason: override.reason
  };
}
