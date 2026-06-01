# @guga-agent/extension-sdk Usage

## Purpose

`@guga-agent/extension-sdk` is the authoring facade for trusted Guga extensions. It turns an extension definition into a normal core `LocalPlugin` while attaching extension metadata to every registered capability.

Use it when a package contributes optional runtime capabilities such as tools, providers, skills, hooks, context policies, or operations.

## Import

```ts
import { defineExtension, ExtensionSdkError } from "@guga-agent/extension-sdk";
```

## Main APIs

- `defineExtension(definition)`: returns a core-compatible `LocalPlugin`.
- `ExtensionDefinition`: extension metadata plus `setup()` and optional `shutdown()`.
- `ExtensionSetupContext`: registration facade with `provider()`, `model()`, `tool()`, `skill()`, `hook()`, `contextPolicy()`, and `operation()` aliases.
- `ExtensionShutdownContext`: lifecycle context passed to `shutdown()`.
- `ExtensionSdkError`: thrown for inactive contexts or unsupported registration features.

## Common Usage

```ts
export const extension = defineExtension({
  id: "example-extension",
  source: { kind: "first-party", packageName: "@guga-agent/example-extension" },
  namespace: "example",
  declaredEffects: ["hook.observe"],
  setup(context) {
    context.tool(exampleTool, { source: "plugin" });
    context.operation("example.health", { source: "plugin" });
  },
  shutdown() {
    // Release extension-scoped resources here.
  }
});
```

Pass the returned value to `createAgentRuntime({ plugins: [extension] })`.

## Parameters

- `defineExtension(definition)`: `definition.id`, `definition.source`, and `definition.setup(context)` are required. `name`, `version`, `namespace`, `owner`, `declaredEffects`, `permissionRequirements`, `dependencies`, `lifecycle`, and `shutdown(context)` are optional metadata and lifecycle fields.
- `definition.source`: `kind` is required. `packageName` and `location` are optional and identify where the extension came from.
- `setup(context)`: `context` is active only during setup. Use `context.provider()`, `context.model()`, `context.tool()`, `context.skill()`, `context.hook()`, `context.contextPolicy()`, or `context.operation()` to register capabilities. Each registration takes the capability as the required first argument and optional extension capability options as the second argument.
- `shutdown(context)`: optional cleanup hook. The `context` exposes extension metadata and active-state helpers, but registration after setup has completed is not supported.

## Notes

- Extension capability `source` may be `"plugin"` or `"mcp"`; it cannot claim `"host"` or `"built-in"`.
- Setup and shutdown contexts are invalidated after their lifecycle method returns. Late async registration throws `ExtensionSdkError`.
- The SDK enriches registrations with `layer: "extension"`, owner metadata, namespace, lifecycle metadata, declared effects, permission requirements, and dependencies.

## Related Packages

- `@guga-agent/core` provides the plugin context and capability contracts.
- `@guga-agent/plugin-mcp` and `@guga-agent/plugin-web-search` use this shape for optional extensions.
