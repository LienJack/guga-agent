# @guga-agent/plugin-skills 用法

## 用途

`@guga-agent/plugin-skills` 从配置的 root 中发现 `SKILL.md` 文件，并向运行时注册 skill metadata。它只在需要时加载完整 skill body 和 asset，因此默认模型上下文会保持较小。

## 导入

```ts
import {
  createSkillsPlugin,
  discoverSkills,
  loadSkillBody,
  resolveSkillAssetPath
} from "@guga-agent/plugin-skills";
```

## 主要 API

- `createSkillsPlugin(options)`: 发现 skill，并通过 plugin context 注册 metadata。
- `discoverSkills(options)`: 返回已发现的 skill、无效 skill 和名称冲突。
- `loadSkillBody(skill)`: 在需要时加载已发现的 skill body。
- `resolveSkillAssetPath(skill, relativePath)`: 解析 skill asset，同时防止路径逃逸。
- `parseSkillFileContent()`、`parseSkillFrontmatter()` 和 `parseSkillMetadataFrontmatter()`: frontmatter parsing helper。
- 类型：`SkillsPluginOptions`、`DiscoveredSkill`、`InvalidSkill`、`SkillDiscoveryResult`、`SkillNameConflict`、`SkillRoot` 和 `ParsedSkillFile`。

## 常见用法

```ts
const runtime = createAgentRuntime({
  plugins: [
    createSkillsPlugin({
      roots: [{ path: ".guga/skills", namespace: "project" }]
    })
  ]
});
```

只有当选中的 skill 将被使用时，才加载 body：

```ts
const result = await discoverSkills({
  roots: [{ path: ".guga/skills", namespace: "project" }]
});
const body = await loadSkillBody(result.skills[0]);
```

## 参数说明

- `createSkillsPlugin(options)` 使用 `SkillsPluginOptions`。`roots` 为必填数组，列出要扫描的 skill 根目录；`pluginId` 可选，用于覆盖默认插件 id。
- `SkillRoot` 的 `path` 为必填字段，指向包含 `SKILL.md` 的目录树；`namespace` 可选，会在 skill frontmatter 未声明 namespace 时作为默认 namespace。
- `discoverSkills(roots)` 接收 `SkillRoot[]`，返回 `SkillDiscoveryResult`，其中 `skills` 是有效 skill，`invalid` 是无效文件记录，`conflicts` 是重复名称冲突。
- `loadSkillBody(skill)` 接收 `DiscoveredSkill`，读取并返回去掉 frontmatter 后的正文。
- `resolveSkillAssetPath(skill, relativePath)` 接收 `DiscoveredSkill` 和相对路径，返回解析后的 asset 路径，并阻止路径逃逸。
- `parseSkillFileContent()`、`parseSkillFrontmatter()` 和 `parseSkillMetadataFrontmatter()` 接收字符串内容，用于解析 skill frontmatter 和 metadata。

## 注意事项

- Frontmatter parser 有意保持小型，并不是完整的 YAML parser。
- Discovery 只读取每个 skill file 的前部以获取 metadata。
- Duplicate skill name 会保留排序更早的 entry，并在 `discoverSkills()` 结果中报告 conflict。
- 除非 host 传入这些 root，否则该插件不会扫描全局用户目录。

## 相关包

- `@guga-agent/core` 定义 skill metadata 和 plugin registration。
- `@guga-agent/profile-code-agent` 可以在 coding-agent bundle 中包含该插件。
