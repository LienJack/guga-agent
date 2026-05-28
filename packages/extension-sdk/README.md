# @guga-agent/extension-sdk

Authoring facade for optional Guga runtime extensions.

`defineExtension()` returns a normal `LocalPlugin`, so extensions use the existing `PluginHost` lifecycle while receiving extension metadata automatically.

```ts
import { defineExtension } from "@guga-agent/extension-sdk";

export const extension = defineExtension({
  id: "example-extension",
  source: { kind: "first-party", packageName: "@guga-agent/example-extension" },
  namespace: "example",
  declaredEffects: ["hook.observe"],
  setup(context) {
    context.provider(exampleProvider);
    context.model(exampleModel);
    context.tool(exampleTool);
    context.skill(exampleSkill);
    context.hook(exampleHook);
    context.contextPolicy(exampleContextPolicy);
    context.operation("example.health");
  }
});
```

The setup context exposes runtime capability registration only:

- `provider()` / `model()`;
- `tool()`;
- `skill()`;
- `hook()`;
- `contextPolicy()`;
- `operation()`.

Every registration is routed through the core plugin context and injects:

- `layer: "extension"`;
- extension owner metadata;
- extension manifest metadata;
- declared effects, permission requirements, dependencies, and lifecycle metadata.

Extension capabilities may use `source: "plugin"` or `source: "mcp"`; they cannot claim `source: "host"` or `source: "built-in"`.

Contexts become inactive after setup or shutdown returns. Late registration throws `ExtensionSdkError` so stale async callbacks cannot re-add callable capabilities after unload/reload.
