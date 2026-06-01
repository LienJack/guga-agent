# @guga-agent/extension-sdk 用法

## 用途

`@guga-agent/extension-sdk` 是可信 Guga extensions 的编写 facade。它会把 extension definition 转换成普通 core `LocalPlugin`，同时把 extension metadata 附加到每个已注册的 capability 上。

当某个包提供可选运行时能力时使用它，例如 tools、providers、skills、hooks、context policies 或 operations。

## 导入

```ts
import { defineExtension, ExtensionSdkError } from "@guga-agent/extension-sdk";
```

## 主要 API

- `defineExtension(definition)`：返回与 core 兼容的 `LocalPlugin`。
- `ExtensionDefinition`：extension metadata，加上 `setup()` 和可选的 `shutdown()`。
- `ExtensionSetupContext`：注册 facade，带有 `provider()`、`model()`、`tool()`、`skill()`、`hook()`、`contextPolicy()` 和 `operation()` 别名。
- `ExtensionShutdownContext`：传给 `shutdown()` 的生命周期上下文。
- `ExtensionSdkError`：在上下文已失效或注册特性不受支持时抛出。

## 常见用法

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

将返回值传给 `createAgentRuntime({ plugins: [extension] })`。

## 参数说明

- `defineExtension(definition: ExtensionDefinition)`：`id`、`source` 和 `setup(context)` 为必填；`source.kind` 描述来源，`source.packageName` 或 `source.location` 可补充包或位置；`owner` 可省略，默认按 extension `id` 推导；`name`、`version`、`namespace`、`declaredEffects`、`permissionRequirements`、`dependencies`、`lifecycle` 和 `shutdown(context)` 均为可选元数据或生命周期钩子。
- `setup(context: ExtensionSetupContext)`：`context.provider()`、`model()`、`tool()`、`skill()`、`hook()`、`contextPolicy()` 和 `operation()` 的第一个参数是要注册的能力对象或 operation name；第二个参数是 options，常用字段包括 `source`、`namespace`、`trust`、`declaredEffects`、`permissionRequirements`、`dependencies` 和 `lifecycle`。
- `ExtensionCapabilityOptions`：`source` 只能是 `"plugin"` 或 `"mcp"`，省略时默认为 `"plugin"`；`namespace` 省略时继承 extension 的 `namespace`；`declaredEffects`、`permissionRequirements`、`dependencies`、`lifecycle` 省略时继承 extension 元数据。
- `ExtensionToolOptions`：除通用 capability options 外，还支持 `override`，用于声明工具覆盖关系；其他能力注册不会开放 `override`。
- `ExtensionShutdownContext`：提供 `pluginId`、`extension`、`isActive()` 和 `assertActive()`；生命周期方法返回后上下文会失效，因此不要在延迟异步任务中继续注册能力。

## 注意事项

- Extension capability 的 `source` 可以是 `"plugin"` 或 `"mcp"`；它不能声明为 `"host"` 或 `"built-in"`。
- Setup 和 shutdown 上下文会在其生命周期方法返回后失效。延迟的异步注册会抛出 `ExtensionSdkError`。
- SDK 会用 `layer: "extension"`、owner metadata、namespace、lifecycle metadata、declared effects、permission requirements 和 dependencies 丰富注册信息。

## 相关包

- `@guga-agent/core` 提供 plugin context 和 capability contracts。
- `@guga-agent/plugin-mcp` 和 `@guga-agent/plugin-web-search` 使用这种形态提供可选 extensions。
