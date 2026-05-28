import type {
  CapabilityRegistrationOptions,
  ExtensionLifecycleBehavior,
  ExtensionSourceDescriptor,
  ExtensionSpecMetadata,
  HookRegistration,
  LocalPlugin,
  PluginContext,
  PluginShutdownContext,
  SkillMetadata,
  ToolDefinition,
  ToolRegistrationOptions
} from "@guga-agent/core";

export type ExtensionDefinition = Omit<ExtensionSpecMetadata, "owner"> & {
  owner?: ExtensionSpecMetadata["owner"];
  setup(context: ExtensionSetupContext): Promise<void> | void;
  shutdown?(context: ExtensionShutdownContext): Promise<void> | void;
};

export type ExtensionCapabilityOptions = Omit<CapabilityRegistrationOptions, "override">;

export type ExtensionToolOptions = ToolRegistrationOptions & ExtensionCapabilityOptions;

export type ExtensionLifecycleContext = {
  readonly pluginId: string;
  readonly extension: ExtensionSpecMetadata;
  isActive(): boolean;
  assertActive(): void;
};

export type ExtensionSetupContext = ExtensionLifecycleContext & {
  tool(tool: ToolDefinition, options?: ExtensionToolOptions): void;
  skill(skill: SkillMetadata, options?: ExtensionCapabilityOptions): void;
  hook(hook: HookRegistration, options?: ExtensionCapabilityOptions): void;
  operation(name: string, options?: ExtensionCapabilityOptions): void;
  registerTool(tool: ToolDefinition, options?: ExtensionToolOptions): void;
  registerSkill(skill: SkillMetadata, options?: ExtensionCapabilityOptions): void;
  registerHook(hook: HookRegistration, options?: ExtensionCapabilityOptions): void;
  registerOperation(name: string, options?: ExtensionCapabilityOptions): void;
};

export type ExtensionShutdownContext = ExtensionLifecycleContext;

export class ExtensionSdkError extends Error {
  readonly code: "EXTENSION_CONTEXT_INACTIVE" | "EXTENSION_CONTEXT_UNSUPPORTED";
  readonly details?: unknown;

  constructor(
    code: ExtensionSdkError["code"],
    message: string,
    details?: unknown
  ) {
    super(message);
    this.name = "ExtensionSdkError";
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export function defineExtension(definition: ExtensionDefinition): LocalPlugin {
  const extension = normalizeExtensionMetadata(definition);

  return {
    id: extension.id,
    ...(extension.name ? { name: extension.name } : {}),
    async init(coreContext) {
      const context = createSetupContext(extension, coreContext);
      try {
        await definition.setup(context);
      } finally {
        context.invalidate();
      }
    },
    ...(definition.shutdown ? {
      async shutdown(coreContext) {
        const context = createShutdownContext(extension, coreContext);
        try {
          await definition.shutdown?.(context);
        } finally {
          context.invalidate();
        }
      }
    } : {})
  };
}

function normalizeExtensionMetadata(definition: ExtensionDefinition): ExtensionSpecMetadata {
  const owner = definition.owner ?? {
    kind: "extension" as const,
    id: definition.id,
    ...(definition.source.packageName ? { packageName: definition.source.packageName } : {})
  };

  return {
    id: definition.id,
    ...(definition.name ? { name: definition.name } : {}),
    ...(definition.version ? { version: definition.version } : {}),
    source: normalizeSource(definition.source),
    ...(definition.namespace ? { namespace: definition.namespace } : {}),
    owner,
    ...(definition.declaredEffects ? { declaredEffects: definition.declaredEffects } : {}),
    ...(definition.permissionRequirements ? { permissionRequirements: definition.permissionRequirements } : {}),
    ...(definition.dependencies ? { dependencies: definition.dependencies } : {}),
    ...(definition.lifecycle ? { lifecycle: normalizeLifecycle(definition.lifecycle) } : {})
  };
}

function normalizeSource(source: ExtensionSourceDescriptor): ExtensionSourceDescriptor {
  return {
    kind: source.kind,
    ...(source.packageName ? { packageName: source.packageName } : {}),
    ...(source.location ? { location: source.location } : {})
  };
}

function normalizeLifecycle(lifecycle: ExtensionLifecycleBehavior): ExtensionLifecycleBehavior {
  return {
    ...(lifecycle.load ? { load: lifecycle.load } : {}),
    ...(lifecycle.unload ? { unload: lifecycle.unload } : {}),
    ...(lifecycle.reload ? { reload: lifecycle.reload } : {}),
    ...(lifecycle.shutdownTimeoutMs !== undefined ? { shutdownTimeoutMs: lifecycle.shutdownTimeoutMs } : {})
  };
}

type MutableLifecycleContext = ExtensionLifecycleContext & {
  invalidate(): void;
};

function createBaseContext(extension: ExtensionSpecMetadata, pluginId = extension.id): MutableLifecycleContext {
  let active = true;
  const assertActive = () => {
    if (!active) {
      throw new ExtensionSdkError("EXTENSION_CONTEXT_INACTIVE", `Extension context is no longer active: ${extension.id}`, {
        extensionId: extension.id,
        pluginId
      });
    }
  };

  return {
    pluginId,
    extension,
    isActive: () => active,
    assertActive,
    invalidate() {
      active = false;
    }
  };
}

function createSetupContext(
  extension: ExtensionSpecMetadata,
  coreContext: PluginContext
): ExtensionSetupContext & MutableLifecycleContext {
  const base = createBaseContext(extension, coreContext.pluginId);

  const registerTool = (tool: ToolDefinition, options?: ExtensionToolOptions) => {
    base.assertActive();
    const enrichedOptions = enrichToolOptions(extension, coreContext.pluginId, options);
    coreContext.registerTool(tool, enrichedOptions);
  };

  const registerSkill = (skill: SkillMetadata, options?: ExtensionCapabilityOptions) => {
    base.assertActive();
    if (!coreContext.registerSkill) {
      throw unsupported("registerSkill", extension.id);
    }
    const metadata = {
      ...skill,
      ...(skill.namespace ?? options?.namespace ?? extension.namespace
        ? { namespace: skill.namespace ?? options?.namespace ?? extension.namespace }
        : {})
    };
    callWithCapabilityOptions(coreContext.registerSkill, metadata, enrichCapabilityOptions(extension, coreContext.pluginId, options));
  };

  const registerHook = (hook: HookRegistration, options?: ExtensionCapabilityOptions) => {
    base.assertActive();
    callWithCapabilityOptions(coreContext.registerHook, hook, enrichCapabilityOptions(extension, coreContext.pluginId, options));
  };

  const registerOperation = (name: string, options?: ExtensionCapabilityOptions) => {
    base.assertActive();
    if (!coreContext.registerOperation) {
      throw unsupported("registerOperation", extension.id);
    }
    coreContext.registerOperation(name, enrichCapabilityOptions(extension, coreContext.pluginId, options));
  };

  return {
    ...base,
    tool: registerTool,
    skill: registerSkill,
    hook: registerHook,
    operation: registerOperation,
    registerTool,
    registerSkill,
    registerHook,
    registerOperation
  };
}

function createShutdownContext(
  extension: ExtensionSpecMetadata,
  coreContext: PluginShutdownContext
): ExtensionShutdownContext & MutableLifecycleContext {
  return createBaseContext(extension, coreContext.pluginId);
}

function enrichCapabilityOptions(
  extension: ExtensionSpecMetadata,
  pluginId: string,
  options: ExtensionCapabilityOptions = {}
): ExtensionCapabilityOptions {
  return {
    ...options,
    source: options.source ?? "plugin",
    layer: "extension",
    ownerPluginId: pluginId,
    owner: extension.owner,
    ...(options.namespace ?? extension.namespace ? { namespace: options.namespace ?? extension.namespace } : {}),
    ...(options.declaredEffects ?? extension.declaredEffects
      ? { declaredEffects: options.declaredEffects ?? extension.declaredEffects }
      : {}),
    ...(options.permissionRequirements ?? extension.permissionRequirements
      ? { permissionRequirements: options.permissionRequirements ?? extension.permissionRequirements }
      : {}),
    ...(options.dependencies ?? extension.dependencies ? { dependencies: options.dependencies ?? extension.dependencies } : {}),
    ...(options.lifecycle ?? extension.lifecycle ? { lifecycle: options.lifecycle ?? extension.lifecycle } : {}),
    extension
  };
}

function enrichToolOptions(
  extension: ExtensionSpecMetadata,
  pluginId: string,
  options?: ExtensionToolOptions
): ExtensionToolOptions {
  const { override, ...metadataOptions } = options ?? {};
  const enrichedOptions = enrichCapabilityOptions(extension, pluginId, metadataOptions);
  return {
    ...enrichedOptions,
    ...(override !== undefined ? { override } : {})
  };
}

function callWithCapabilityOptions<T>(
  register: (value: T, options?: CapabilityRegistrationOptions) => void,
  value: T,
  options: CapabilityRegistrationOptions
): void {
  register(value, options);
}

function unsupported(method: string, extensionId: string): ExtensionSdkError {
  return new ExtensionSdkError("EXTENSION_CONTEXT_UNSUPPORTED", `Plugin context does not support ${method}`, {
    extensionId,
    method
  });
}
