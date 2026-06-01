# @guga-agent/plugin-context-default Usage

## Purpose

`@guga-agent/plugin-context-default` provides the default context policy and context lifecycle hooks for Guga runtimes. It covers resource discovery, context assembly, budget decisions, truncation, compaction, reinjection, and related context phases.

## Import

```ts
import {
  DEFAULT_CONTEXT_POLICY_ID,
  createDefaultContextPlugin,
  defaultContextHooks,
  defaultContextPolicy
} from "@guga-agent/plugin-context-default";
```

## Main APIs

- `createDefaultContextPlugin(options)`: registers the default context policy and hooks.
- `defaultContextPolicy(pluginId)`: creates the policy object directly.
- `defaultContextHooks(pluginId)`: creates hook registrations directly.
- `DEFAULT_CONTEXT_POLICY_ID`: stable policy id.
- Type: `DefaultContextPluginOptions`.

## Common Usage

```ts
const runtime = createAgentRuntime({
  plugins: [createDefaultContextPlugin()]
});
```

Advanced tests can call `defaultContextPolicy()` or `defaultContextHooks()` directly when they need to inspect or register the pieces independently.

## Parameters

- `createDefaultContextPlugin(options)` takes an optional `pluginId`; omit it to use `guga-default-context`. The id is also passed into the registered policy and hooks for audit identity and hook contribution metadata.
- `defaultContextPolicy(pluginId)` requires the plugin id to embed in the policy audit identity. It returns the stable `DEFAULT_CONTEXT_POLICY_ID` policy with the built-in context phases, timeout, permission scope, and compaction metadata.
- `defaultContextHooks(pluginId)` requires the same plugin id and returns hook registrations that annotate or patch the default context lifecycle phases.

## Notes

- The plugin uses `registerContextPolicy` when available and registers hooks through the normal hook path.
- Hosts using this plugin must support hook registration.
- This package does not store context history; it contributes policy and hook behavior to the runtime.

## Related Packages

- `@guga-agent/core` defines context policy and hook contracts.
- Host/profile packages can install this plugin when they want the first-party default context behavior.
