# @guga-agent/plugin-skills

First-party skills plugin for Guga Agent.

This package discovers `SKILL.md` files from configured roots and registers only skill metadata with core. Full skill bodies and assets are loaded through explicit APIs so default model context stays small.

```ts
import { createAgentRuntime } from "@guga-agent/core";
import { createSkillsPlugin } from "@guga-agent/plugin-skills";

const runtime = createAgentRuntime({
  plugins: [
    createSkillsPlugin({
      roots: [{ path: ".guga/skills", namespace: "project" }]
    })
  ]
});
```

## Loading Model

- Metadata: `name`, `description`, optional `namespace`, `tags`, and `location`.
- Body: loaded on demand with `loadSkillBody(discoveredSkill)`.
- Assets: resolved at execution time with `resolveSkillAssetPath(discoveredSkill, relativePath)`.

The plugin does not scan global user directories unless the host explicitly passes them as roots.
