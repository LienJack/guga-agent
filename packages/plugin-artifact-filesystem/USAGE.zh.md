# @guga-agent/plugin-artifact-filesystem 用法

## 用途

`@guga-agent/plugin-artifact-filesystem` 为 Guga 运行时提供基于文件系统的 `ArtifactStore`。它将 artifact 内容存储到磁盘，记录 manifest，在读取时校验哈希，并支持 tombstone 状态转换。

## 导入

```ts
import {
  FilesystemArtifactStore,
  createFilesystemArtifactPlugin
} from "@guga-agent/plugin-artifact-filesystem";
```

## 主要 API

- `createFilesystemArtifactPlugin(options)`: 将文件系统 artifact store 注册到核心插件上下文。
- `FilesystemArtifactStore`: 供希望自行管理注册流程的 host 直接使用的 store 实现。
- 类型：`FilesystemArtifactPluginOptions`、`FilesystemArtifactStoreOptions`、`ArtifactManifest` 和 `ArtifactManifestTransitionRecord`。

## 常见用法

```ts
const runtime = createAgentRuntime({
  plugins: [
    createFilesystemArtifactPlugin({
      rootDir: ".guga/artifacts"
    })
  ]
});
```

高级 host 可以实例化 `new FilesystemArtifactStore({ rootDir })`，并通过自定义插件注册它。

## 参数说明

- `createFilesystemArtifactPlugin(options)` 使用 `FilesystemArtifactPluginOptions`。`rootDir` 为必填字段，指定 artifact 内容和 manifest 的落盘根目录；`pluginId` 为可选字段，用于覆盖默认插件 id；`now` 为可选时间函数，主要用于测试或可重复时间戳。
- `new FilesystemArtifactStore(options)` 使用 `FilesystemArtifactStoreOptions`。`rootDir` 必填；`now` 可选，默认返回当前 ISO 时间字符串。
- `FilesystemArtifactStore.putArtifact(options)` 使用 core 的 `PutArtifactOptions`。常见字段包括 `data`（要写入的内容，必填）、`artifactId`（可选，缺省生成随机 id）、`mimeType`、`label`、`privacyTags`、`retention`、`actor` 和 `metadata`。

## 注意事项

- Artifact 内容和 manifest 会分开存储；读取时会校验记录的 SHA-256 哈希。
- 缺失、已 tombstone 和哈希不匹配的 artifact 会返回结构化诊断。
- 当前公共 API 暴露 tombstone 行为，而不是单独的公共 redaction helper。
- 该包不会自动持久化原始 provider payload；host 必须决定要写入哪些 artifact。

## 相关包

- `@guga-agent/core` 定义 `ArtifactStore` 契约。
- `@guga-agent/plugin-replay-audit` 可以在 replay 期间读取 artifact 引用。
- `@guga-agent/plugin-session-jsonl` 存储可能指向 artifact 的持久事件引用。
