# @guga-agent/plugin-context-default 用法

## 用途

`@guga-agent/plugin-context-default` 为 Guga 运行时提供默认 context policy 和 context 生命周期 hook。它覆盖资源发现、context 组装、预算决策、截断、压缩、重新注入以及相关 context 阶段。

## 导入

```ts
import {
  DEFAULT_CONTEXT_POLICY_ID,
  createDefaultContextPlugin,
  defaultContextHooks,
  defaultContextPolicy
} from "@guga-agent/plugin-context-default";
```

## 主要 API

- `createDefaultContextPlugin(options)`: 注册默认 context policy 和 hook。
- `defaultContextPolicy(pluginId)`: 直接创建 policy 对象。
- `defaultContextHooks(pluginId)`: 直接创建 hook 注册项。
- `DEFAULT_CONTEXT_POLICY_ID`: 稳定的 policy id。
- 类型：`DefaultContextPluginOptions`。

## 常见用法

```ts
const runtime = createAgentRuntime({
  plugins: [createDefaultContextPlugin()]
});
```

高级测试可以在需要独立检查或注册这些部分时，直接调用 `defaultContextPolicy()` 或 `defaultContextHooks()`。

## 参数说明

- `createDefaultContextPlugin(options)` 使用 `DefaultContextPluginOptions`。`pluginId` 可选，用于覆盖默认插件 id；该 id 也会传给默认 policy 和 hook，便于诊断与归属。
- `defaultContextPolicy(pluginId)` 接收 policy 的 `pluginId` 字符串，返回可直接注册的 context policy 对象。
- `defaultContextHooks(pluginId)` 接收 hook 的 `pluginId` 字符串，返回一组可直接注册的 hook 定义。
- `DEFAULT_CONTEXT_POLICY_ID` 是稳定常量，不需要参数，适合 host 或测试引用默认 policy id。

## 注意事项

- 该插件会在可用时使用 `registerContextPolicy`，并通过常规 hook 路径注册 hook。
- 使用该插件的 host 必须支持 hook 注册。
- 该包不存储 context 历史；它只为运行时贡献 policy 和 hook 行为。

## 相关包

- `@guga-agent/core` 定义 context policy 和 hook 契约。
- Host/profile 包可以在需要第一方默认 context 行为时安装该插件。
