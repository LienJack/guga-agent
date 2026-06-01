# @guga-agent/plugin-web-search 用法

## 用途

`@guga-agent/plugin-web-search` 贡献可选的 `web_search` 工具。它是一种搜索发现能力：返回 URL、标题、摘要、时间戳、排名和审计元数据。它不会抓取任意页面、渲染浏览器或截图。

## 导入

```ts
import {
  createBraveSearchBackend,
  createMockWebSearchBackend,
  createWebSearchPlugin,
  createWebSearchTool
} from "@guga-agent/plugin-web-search";
```

## 主要 API

- `createWebSearchPlugin(options)`：将 `web_search` 工具注册为扩展能力。
- `createWebSearchTool(options)`：直接创建工具定义。
- 后端：`createMockWebSearchBackend()` 和 `createBraveSearchBackend()`。
- 输入/schema 辅助项：`parseWebSearchInput()`、`webSearchInputSchema` 以及默认/最大值常量。
- 域名辅助函数：`applyDomainPolicy()`、`domainMatches()`、`hostForUrl()`、`normalizeDomainFilter()` 和 `normalizeDomainFilters()`。
- 格式化：`formatWebSearchResult()`。
- 常量：`WEB_SEARCH_PACKAGE_NAME`、`WEB_SEARCH_PLUGIN_ID` 和 `WEB_SEARCH_TOOL_NAME`。
- 用于后端请求/响应、权限选项、输入、格式化输出、域名诊断和提供方 id 的类型。

## 常见用法

```ts
const runtime = createAgentRuntime({
  plugins: [
    createWebSearchPlugin({
      backend: createBraveSearchBackend({
        apiKeyEnv: "BRAVE_SEARCH_API_KEY"
      })
    })
  ]
});
```

工具输入形态：

```ts
{
  query: string;
  maxResults?: number;
  allowedDomains?: string[];
  blockedDomains?: string[];
  recencyDays?: number;
  searchType?: "web" | "news";
  contextMaxCharacters?: number;
}
```

## 参数说明

- `createWebSearchPlugin(options)` 与 `createWebSearchTool(options)` 使用 `WebSearchPluginOptions`/`CreateWebSearchToolOptions`。`backend` 是实际搜索后端；只传 `providerId` 时工具会暴露为缺少后端而不可用。`availability` 可显式设置或按运行时上下文计算可用性；`permission.defaultAction` 与 `permission.trustedSessionAction` 覆盖权限默认动作；`timeoutMs` 默认 `15000`；`resultBudget` 默认以 reference 策略限制 `12000` 字符；`now` 便于测试固定 `fetchedAt`。
- `WebSearchPluginOptions.pluginId` 可选，默认使用 `WEB_SEARCH_PLUGIN_ID`。插件注册的是固定工具名 `WEB_SEARCH_TOOL_NAME`，即 `"web_search"`。
- `WebSearchInput.query` 必填，不能为空且最多 400 字符。`maxResults` 是 `1` 到 `MAX_WEB_SEARCH_RESULTS` 的整数，默认 `DEFAULT_WEB_SEARCH_MAX_RESULTS`；`contextMaxCharacters` 是 `1` 到 `MAX_WEB_SEARCH_CONTEXT_MAX_CHARACTERS` 的整数，默认 `DEFAULT_WEB_SEARCH_CONTEXT_MAX_CHARACTERS`。
- `allowedDomains` 和 `blockedDomains` 是域名字符串数组，会通过 `normalizeDomainFilters()` 标准化；允许传裸域名、URL 或 `*.example.com` 形式。域名策略会在后端查询前写入 Brave query，并在后端返回后再次过滤。
- `recencyDays` 可选，必须是 `1` 到 `365` 的整数；Brave 后端会映射为 freshness 参数。`searchType` 可选，只能是 `"web"` 或 `"news"`，默认 `"web"`。
- `createBraveSearchBackend(options)` 支持 `apiKey`、`apiKeyEnv`、`env`、`endpoint`、`fetch` 和 `providerId`。省略 `apiKey` 时会从 `apiKeyEnv` 指定的环境变量读取，默认环境变量名为 `"BRAVE_SEARCH_API_KEY"`；`fetch` 可注入测试实现。
- `createMockWebSearchBackend(options)` 支持 `providerId`、静态或函数式 `results` 以及 `metadata`，用于 hermetic 测试或本地演示。

## 注意事项

- `GUGA_WEB_SEARCH` 等 CLI 环境开关属于宿主级配置。此包提供工具和后端；它本身不会读取所有宿主配置环境变量。
- 域名过滤会在后端调用前后执行。
- Brave 后端使用可注入的 fetch 路径，因此测试不需要真实 API key。
- `web_fetch` 有意作为单独的未来能力，不属于此包。

## 相关包

- `@guga-agent/core` 通过常规 schema、hook、权限、超时、事件和结果预算路径执行该工具。
- `@guga-agent/extension-sdk` 提供扩展元数据注册。
