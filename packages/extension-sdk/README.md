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
    context.tool(exampleTool);
    context.operation("example.health");
  }
});
```

The setup context injects:

- `layer: "extension"`;
- extension owner metadata;
- extension manifest metadata;
- declared effects, permission requirements, dependencies, and lifecycle metadata.

Contexts become inactive after setup or shutdown returns. Late registration throws `ExtensionSdkError` so stale async callbacks cannot re-add callable capabilities after unload/reload.
