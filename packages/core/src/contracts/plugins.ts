import type { HookRegistration } from "./hooks";
import type { ContextPolicy } from "./context";
import type { TrustDescriptor } from "./operations";
import type { ArtifactStore, EventStore, ReplayCapability, SessionStore } from "./persistence";
import type { ModelIdentifier, ModelMetadata, Provider } from "./provider";
import type { ToolDefinition } from "./tools";

export type ToolRegistrationOptions = {
  override?: false | CapabilityOverrideDeclaration;
  source?: CapabilitySource;
  layer?: CapabilityLayer;
  namespace?: string;
  ownerPluginId?: string;
  owner?: CapabilityOwnerDescriptor;
  trust?: TrustDescriptor;
  declaredEffects?: CapabilityDeclaredEffect[];
  permissionRequirements?: CapabilityPermissionRequirement[];
};

export type CapabilitySource = "host" | "plugin" | "mcp" | "built-in";

export type CapabilityLayer = "core-kernel" | "built-in-core" | "extension" | "host";

export type CapabilityOwnerKind = "core" | "host" | "extension";

export type CapabilityOwnerDescriptor = {
  kind: CapabilityOwnerKind;
  id: string;
  packageName?: string;
};

export type CapabilityDeclaredEffect =
  | "filesystem.read"
  | "filesystem.write"
  | "process.spawn"
  | "network.access"
  | "git.read"
  | "git.write"
  | "model.invoke"
  | "context.read"
  | "context.write"
  | "hook.observe"
  | "hook.mutate"
  | "runtime.operation";

export type CapabilityPermissionRequirement = {
  subject: string;
  actions: string[];
  reason?: string;
};

export type CapabilityDependency = {
  kind: "capability" | "package" | "executable" | "service";
  name: string;
  optional?: boolean;
  versionRange?: string;
};

export type ExtensionLifecycleBehavior = {
  load?: "eager" | "lazy";
  unload?: "remove-contributions" | "runtime-shutdown-only";
  reload?: "supported" | "unsupported";
  shutdownTimeoutMs?: number;
};

export type ExtensionSourceDescriptor = {
  kind: "first-party" | "workspace" | "external" | "mcp-config" | "host-provided";
  packageName?: string;
  location?: string;
};

export type ExtensionSpecMetadata = {
  id: string;
  name?: string;
  version?: string;
  source: ExtensionSourceDescriptor;
  namespace?: string;
  owner: CapabilityOwnerDescriptor;
  declaredEffects?: CapabilityDeclaredEffect[];
  permissionRequirements?: CapabilityPermissionRequirement[];
  dependencies?: CapabilityDependency[];
  lifecycle?: ExtensionLifecycleBehavior;
};

export type CapabilityOverrideTarget = {
  type: PluginCapabilityKind;
  name: string;
  layer?: CapabilityLayer;
};

export type CapabilityOverrideDeclaration = {
  replaces: string;
  reason: string;
  mode?: "override" | "restore";
  target?: CapabilityOverrideTarget;
  declaredEffects?: CapabilityDeclaredEffect[];
  trust?: TrustDescriptor;
};

export type CapabilityOverrideDescriptor = {
  status: "active" | "restored" | "denied";
  target: CapabilityOverrideTarget;
  reason: string;
  owner?: CapabilityOwnerDescriptor;
};

export type CapabilityRegistrationOptions = {
  source?: CapabilitySource;
  layer?: CapabilityLayer;
  namespace?: string;
  ownerPluginId?: string;
  owner?: CapabilityOwnerDescriptor;
  trust?: TrustDescriptor;
  declaredEffects?: CapabilityDeclaredEffect[];
  permissionRequirements?: CapabilityPermissionRequirement[];
  dependencies?: CapabilityDependency[];
  lifecycle?: ExtensionLifecycleBehavior;
  extension?: ExtensionSpecMetadata;
  override?: CapabilityOverrideDescriptor;
};

export type SkillMetadata = {
  name: string;
  description: string;
  location?: string;
  namespace?: string;
  tags?: string[];
};

export type CapabilityStatus = "registered" | "skipped-conflict" | "rejected-conflict" | "unavailable";

export type CapabilityDescriptor = {
  type: PluginCapabilityKind;
  name: string;
  source: CapabilitySource;
  status: CapabilityStatus;
  layer?: CapabilityLayer;
  namespace?: string;
  ownerPluginId?: string;
  owner?: CapabilityOwnerDescriptor;
  trust?: TrustDescriptor;
  declaredEffects?: CapabilityDeclaredEffect[];
  permissionRequirements?: CapabilityPermissionRequirement[];
  dependencies?: CapabilityDependency[];
  lifecycle?: ExtensionLifecycleBehavior;
  extension?: ExtensionSpecMetadata;
  override?: CapabilityOverrideDescriptor;
  reason?: string;
};

export type CapabilityDiff = {
  added: CapabilityDescriptor[];
  removed: CapabilityDescriptor[];
  changed: Array<{
    before: CapabilityDescriptor;
    after: CapabilityDescriptor;
  }>;
  skippedConflicts: CapabilityDescriptor[];
  rejectedConflicts: CapabilityDescriptor[];
};

export type PluginContext = {
  pluginId: string;
  registerProvider(provider: Provider, options?: CapabilityRegistrationOptions): void;
  registerModel?(model: ModelMetadata, options?: CapabilityRegistrationOptions): void;
  registerTool(tool: ToolDefinition, options?: ToolRegistrationOptions): void;
  registerSkill?(skill: SkillMetadata, options?: CapabilityRegistrationOptions): void;
  registerHook(hook: HookRegistration, options?: CapabilityRegistrationOptions): void;
  registerContextPolicy?(policy: ContextPolicy, options?: CapabilityRegistrationOptions): void;
  registerEventStore?(store: EventStore): void;
  registerSessionStore?(store: SessionStore): void;
  registerArtifactStore?(store: ArtifactStore): void;
  registerReplayCapability?(capability: ReplayCapability): void;
  registerOperation?(name: string, options?: CapabilityRegistrationOptions): void;
  getEventStore?(): EventStore | undefined;
  getSessionStore?(): SessionStore | undefined;
  getArtifactStore?(): ArtifactStore | undefined;
};

export type PluginShutdownContext = {
  pluginId: string;
};

export type LocalPlugin = {
  id: string;
  name?: string;
  init(context: PluginContext): Promise<void> | void;
  shutdown?(context: PluginShutdownContext): Promise<void> | void;
};

export type LocalModelPlugin = LocalPlugin & {
  model: ModelIdentifier;
};

export type PluginCapabilityKind =
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

export type PluginFailureKind = "init" | "hook" | "shutdown";

export type PluginFailure = {
  code: "PLUGIN_INIT_FAILED" | "PLUGIN_SHUTDOWN_FAILED" | "HOOK_FAILED";
  message: string;
  details?: unknown;
};

export type PluginHostOptions = {
  plugins?: LocalPlugin[];
};

export type PluginShutdownResult = {
  ok: boolean;
  failures: Array<{
    pluginId: string;
    error: PluginFailure;
  }>;
};
