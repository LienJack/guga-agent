# @guga-agent/plugin-skills Usage

## Purpose

`@guga-agent/plugin-skills` discovers `SKILL.md` files from configured roots and registers skill metadata with the runtime. It loads full skill bodies and assets only on demand so default model context stays small.

## Import

```ts
import {
  createSkillsPlugin,
  discoverSkills,
  loadSkillBody,
  resolveSkillAssetPath
} from "@guga-agent/plugin-skills";
```

## Main APIs

- `createSkillsPlugin(options)`: discovers skills and registers metadata through the plugin context.
- `discoverSkills(options)`: returns discovered skills, invalid skills, and name conflicts.
- `loadSkillBody(skill)`: loads a discovered skill body when needed.
- `resolveSkillAssetPath(skill, relativePath)`: resolves skill assets while preventing path escape.
- `parseSkillFileContent()`, `parseSkillFrontmatter()`, and `parseSkillMetadataFrontmatter()`: frontmatter parsing helpers.
- Types: `SkillsPluginOptions`, `DiscoveredSkill`, `InvalidSkill`, `SkillDiscoveryResult`, `SkillNameConflict`, `SkillRoot`, and `ParsedSkillFile`.

## Common Usage

```ts
const runtime = createAgentRuntime({
  plugins: [
    createSkillsPlugin({
      roots: [{ path: ".guga/skills", namespace: "project" }]
    })
  ]
});
```

Load a body only when a selected skill is going to be used:

```ts
const result = await discoverSkills({
  roots: [{ path: ".guga/skills", namespace: "project" }]
});
const body = await loadSkillBody(result.skills[0]);
```

## Notes

- The frontmatter parser is intentionally small and is not a complete YAML parser.
- Discovery reads only the front part of each skill file for metadata.
- Duplicate skill names keep the earlier sorted entry and report conflicts in `discoverSkills()` results.
- The plugin does not scan global user directories unless the host passes those roots.

## Related Packages

- `@guga-agent/core` defines skill metadata and plugin registration.
- `@guga-agent/profile-code-agent` can include this plugin in coding-agent bundles.
