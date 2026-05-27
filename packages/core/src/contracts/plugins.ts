import type { HookRegistration } from "./hooks";
import type { ContextPolicy } from "./context";
import type { ArtifactStore, EventStore, ReplayCapability, SessionStore } from "./persistence";
import type { ModelIdentifier, ModelMetadata, Provider } from "./provider";
import type { ToolDefinition } from "./tools";

export type ToolRegistrationOptions = {
  override?: false | {
    replaces: string;
    reason: string;
  };
  source?: CapabilitySource;
  namespace?: string;
  ownerPluginId?: string;
};

export type CapabilitySource = "host" | "plugin" | "mcp" | "built-in";

export type CapabilityRegistrationOptions = {
  source?: CapabilitySource;
  namespace?: string;
  ownerPluginId?: string;
};

export type SkillMetadata = {
  name: string;
  description: string;
  location?: string;
  namespace?: string;
  tags?: string[];
};

export type CapabilityStatus = "registered" | "skipped-conflict";

export type CapabilityDescriptor = {
  type: PluginCapabilityKind;
  name: string;
  source: CapabilitySource;
  status: CapabilityStatus;
  namespace?: string;
  ownerPluginId?: string;
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
};

export type PluginContext = {
  pluginId: string;
  registerProvider(provider: Provider): void;
  registerModel?(model: ModelMetadata): void;
  registerTool(tool: ToolDefinition, options?: ToolRegistrationOptions): void;
  registerSkill?(skill: SkillMetadata): void;
  registerHook(hook: HookRegistration): void;
  registerContextPolicy?(policy: ContextPolicy): void;
  registerEventStore?(store: EventStore): void;
  registerSessionStore?(store: SessionStore): void;
  registerArtifactStore?(store: ArtifactStore): void;
  registerReplayCapability?(capability: ReplayCapability): void;
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
  | "replay";

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
