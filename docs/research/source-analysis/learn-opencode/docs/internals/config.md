# 内部模块: Config (配置系统)

> opencode.json 配置加载和管理。

## 1. 概览 (Overview)
- **路径**: `packages/opencode/src/config/`
- **定位**: 加载和合并多层级配置文件。
- **核心文件**: `config.ts`, `markdown.ts`

## 2. 配置层级

OpenCode 的配置采用 **多层合并** 策略，按以下优先级加载（后者覆盖前者）：

| 优先级 | 配置源 | 路径/方式 | 说明 |
|--------|--------|-----------|------|
| 1 (最低) | 全局配置 | `~/.opencode/opencode.json` | 用户级默认配置 |
| 2 | 项目配置 | `<项目根>/opencode.json` | 项目级配置 |
| 3 | 目录配置 | `.opencode/opencode.json` | 当前目录配置 |
| 4 | 环境变量 | `OPENCODE_CONFIG_CONTENT` | 运行时注入 |
| 5 (最高) | 命令行参数 | `--config <path>` | 显式指定配置文件 |

**合并规则**:
- 普通字段：后加载的值**覆盖**先前的值
- 数组字段：后加载的值**合并**到先前的数组（不替换）

## 3. 配置文件搜索

```typescript
export const state = Instance.state(async () => {
  let result = await global()  // 全局配置

  // 自定义配置文件
  if (Flag.OPENCODE_CONFIG) {
    result = mergeConfigConcatArrays(result, await loadFile(Flag.OPENCODE_CONFIG))
  }

  // 搜索项目中的配置文件
  for (const file of ["opencode.jsonc", "opencode.json"]) {
    const found = await Filesystem.findUp(file, Instance.directory, Instance.worktree)
    for (const resolved of found.toReversed()) {
      result = mergeConfigConcatArrays(result, await loadFile(resolved))
    }
  }

  // 环境变量内容
  if (Flag.OPENCODE_CONFIG_CONTENT) {
    result = mergeConfigConcatArrays(result, JSON.parse(Flag.OPENCODE_CONFIG_CONTENT))
  }

  return { config: result, directories }
})
```

## 4. 配置结构

### 4.1 主要配置项

```typescript
export const Info = z.object({
  // 界面
  theme: z.string().optional(),
  keybinds: Keybinds.optional(),
  tui: TUI.optional(),
  
  // 服务器
  server: Server.optional(),
  
  // Agent & 命令
  agent: z.record(z.string(), Agent).optional(),
  command: z.record(z.string(), Command).optional(),
  
  // 模型提供商
  provider: z.record(z.string(), Provider).optional(),
  disabled_providers: z.array(z.string()).optional(),
  
  // MCP
  mcp: z.record(z.string(), Mcp).optional(),
  
  // 权限 & 安全
  permission: Permission.optional(),
  
  // 插件
  plugin: z.string().array().optional(),
  
  // 功能开关
  snapshot: z.boolean().optional(),
  share: z.enum(["manual", "auto", "disabled"]).optional(),
  autoupdate: z.union([z.boolean(), z.literal("notify")]).optional(),
  
  // 用户信息
  username: z.string().optional(),
})
```

### 4.2 权限配置

```typescript
export const Permission = z.object({
  read: PermissionRule.optional(),
  edit: PermissionRule.optional(),
  bash: PermissionRule.optional(),
  // ...
}).catchall(PermissionRule)

// PermissionRule 可以是简单值或对象
const rule = "allow"  // 简单
const rule = { 
  "*": "allow",
  "*.env": "deny" 
}  // 按模式
```

### 4.3 Agent 配置

```typescript
export const Agent = z.object({
  model: z.string().optional(),
  temperature: z.number().optional(),
  prompt: z.string().optional(),
  description: z.string().optional(),
  mode: z.enum(["subagent", "primary", "all"]).optional(),
  permission: Permission.optional(),
  steps: z.number().int().positive().optional(),
})
```

### 4.4 MCP 配置

```typescript
// 本地 MCP
{
  "mcp": {
    "filesystem": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-filesystem"],
      "enabled": true
    }
  }
}

// 远程 MCP
{
  "mcp": {
    "my-server": {
      "type": "remote",
      "url": "https://mcp.example.com/sse",
      "headers": { "Authorization": "Bearer xxx" }
    }
  }
}
```

## 5. 动态配置加载

### 5.1 Command 加载

从 `.opencode/command/*.md` 加载命令：

```typescript
const COMMAND_GLOB = new Bun.Glob("{command,commands}/**/*.md")

async function loadCommand(dir: string) {
  for await (const item of COMMAND_GLOB.scan({ cwd: dir })) {
    const md = await ConfigMarkdown.parse(item)
    result[name] = { template: md.content, ...md.data }
  }
}
```

### 5.2 Agent 加载

从 `.opencode/agent/*.md` 加载 Agent：

```typescript
const AGENT_GLOB = new Bun.Glob("{agent,agents}/**/*.md")

async function loadAgent(dir: string) {
  for await (const item of AGENT_GLOB.scan({ cwd: dir })) {
    const md = await ConfigMarkdown.parse(item)
    result[name] = { prompt: md.content, ...md.data }
  }
}
```

### 5.3 Plugin 加载

从 `.opencode/plugin/*.{ts,js}` 加载插件：

```typescript
const PLUGIN_GLOB = new Bun.Glob("{plugin,plugins}/*.{ts,js}")

async function loadPlugin(dir: string) {
  for await (const item of PLUGIN_GLOB.scan({ cwd: dir })) {
    plugins.push(pathToFileURL(item).href)
  }
}
```

## 6. 配置目录结构

```
.opencode/
├── opencode.json       # 主配置
├── agent/              # Agent 定义
│   └── my-agent.md
├── command/            # 命令定义
│   └── deploy.md
├── plugin/             # 插件
│   └── my-plugin.ts
├── skill/              # 技能
│   └── SKILL.md
└── tool/               # 自定义工具
    └── my-tool.ts
```

## 7. 配置示例

```json
{
  "$schema": "https://opencode.ai/opencode.schema.json",
  "theme": "dark",
  "default_agent": "build",
  "provider": {
    "anthropic": {
      "options": {
        "apiKey": "${ANTHROPIC_API_KEY}"
      }
    }
  },
  "agent": {
    "build": {
      "model": "anthropic/claude-sonnet-4-20250514",
      "temperature": 0.3
    }
  },
  "permission": {
    "*": "allow",
    "read": {
      "*.env": "deny"
    }
  },
  "mcp": {
    "filesystem": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-filesystem"]
    }
  }
}
```

## 8. 总结

Config 模块是 OpenCode **可定制性** 的基础：
- **多层合并**: 全局 → 项目 → 目录 → 环境变量
- **多种格式**: JSON/JSONC + Markdown frontmatter
- **热加载**: 动态扫描 Agent/Command/Plugin
- **类型安全**: 完整的 Zod Schema 验证
