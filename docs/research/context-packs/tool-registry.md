# Tool Registry Context Pack

## 问题边界

本 Context Pack 回答以下问题：
- 工具如何注册、发现、组装为可用工具池？
- 工具 Schema 如何定义（JSON Schema / Zod / 装饰器）？
- 权限模型如何与工具执行耦合（allow / ask / deny 三态）？
- 工具执行的完整流水线（校验→权限→hooks→call→结果回流）
- MCP 工具如何与内建工具统一融合？
- Skills 系统如何作为"渐进式知识加载"补充工具能力？

## 参考项目与版本

| 项目 | Commit | 语言 |
|------|--------|------|
| claude-code | `3d7b32f` | TypeScript |
| hermes-agent | `dd0923b` | Python |
| opencode | `caf1151` | TypeScript (Bun) |
| deer-flow | `84f88b6` | Python (LangGraph) |

## 必读分析材料

| 路径 | 主题 |
|------|------|
| `docs/research/source-analysis/claude-code-analysis/analysis/04b-tool-call-implementation.md` | Claude Code 工具执行管线 |
| `docs/research/source-analysis/claude-code-analysis/analysis/04d-mcp-implementation.md` | Claude Code MCP 集成 |
| `docs/research/source-analysis/hermes-agent-anatomy/docs/03-Tool-Registry.md` | Hermes 朴素注册表设计 |
| `docs/research/source-analysis/hermes-wiki/concepts/tool-registry-architecture.md` | Hermes 注册表架构文档 |
| `docs/research/source-analysis/hermes-wiki/concepts/skills-system-architecture.md` | Hermes Skills 渐进式披露 |
| `docs/research/source-analysis/learn-opencode/docs/internals/tool.md` | OpenCode 工具系统 |
| `docs/research/source-analysis/learn-opencode/docs/flow/tool_execution.md` | OpenCode 执行流程 |
| `docs/research/source-analysis/learn-opencode/docs/internals/permission.md` | OpenCode 权限 |
| `docs/research/source-analysis/deerflow-book/chapters/15-builtin-tools.md` | DeerFlow 工具加载 |
| `docs/research/source-analysis/deerflow-book/chapters/17-skills-system.md` | DeerFlow Skills 三层加载 |

## 必读源码文件

### Claude Code (TypeScript)
| 文件 | Token 量 | 职责 |
|------|----------|------|
| `src/Tool.ts` | — | Tool 接口协议（安全属性、并发声明、UI 渲染） |
| `src/tools.ts` | — | `getAllBaseTools()` + `assembleToolPool()` 工具池组装 |
| `src/services/tools/toolOrchestration.ts` | — | `partitionToolCalls()` 并发分批 |
| `src/services/tools/toolExecution.ts` | — | `runToolUse()` 主干执行 |
| `src/services/tools/toolHooks.ts` | — | PreToolUse / PostToolUse Hooks |
| `src/services/mcp/client.ts` | — | MCP 四协议连接 + memoize |
| `src/services/mcp/mcpStringUtils.ts` | — | `mcp__server__tool` 命名规则 |

### Hermes Agent (Python)
| 文件 | Token 量 | 职责 |
|------|----------|------|
| `tools/registry.py` | ~10KB | ToolEntry + ToolRegistry 单例 |
| `model_tools.py` | 7,878 | `_discover_tools()` + `handle_function_call()` + `coerce_tool_args()` |
| `toolsets.py` | 6,496 | Toolset 分组定义 |
| `tools/mcp_tool.py` | ~2,176行 | MCP 服务器连接与调用 |
| `tools/skills_tool.py` | 1,378行 | Skills 发现与加载 |
| `hermes_cli/plugins.py` | — | Plugin 钩子系统 |
| `agent/prompt_builder.py` | 15,698 | Skills 索引构建与条件激活 |

### OpenCode (TypeScript/Bun)
| 文件 | Token 量 | 职责 |
|------|----------|------|
| `packages/opencode/src/tool/` | 48,828 | 全部工具实现 |
| `packages/opencode/src/tool/registry.ts` | — | ToolRegistry namespace + state |
| `packages/opencode/src/permission/` | 4,700 | 权限规则匹配 |
| `packages/opencode/src/mcp/` | 13,202 | MCP Client 实现 |
| `packages/opencode/src/skill/` | 6,736 | Skill 扫描与解析 |
| `packages/opencode/src/plugin/` | 20,355 | Plugin 系统 |

## 关键抽象

### 1. 工具注册模式（三种范式）

| 范式 | 代表 | 注册方式 | 优劣 |
|------|------|---------|------|
| **协议对象** | Claude Code | `buildTool(def)` 构造，包含安全/并发/UI 声明 | 重但完备，Fail-Closed |
| **字典单例** | Hermes | 模块级 `registry.register(name, schema, handler)` | 朴素零摩擦，10 秒加工具 |
| **Init 工厂** | OpenCode | `Tool.Info = { id, init(ctx) → Definition }` | 延迟初始化，运行时动态 |

### 2. 工具池组装（统一入口 + 多源融合）

所有项目都遵循同一模式：
```
内建工具 + MCP 工具 + 插件工具 → 统一工具池 → 模型看到平坦列表
```

- **Claude Code**: `assembleToolPool(permCtx, mcpTools)` — 内建优先 `uniqBy`，MCP 同名被丢弃
- **Hermes**: 三层洋葱发现 `_discover_tools()` → `discover_mcp_tools()` → `discover_plugins()`
- **OpenCode**: `ToolRegistry.all()` 合并 builtin + custom(config dir) + plugin tools
- **DeerFlow**: `get_available_tools(groups, include_mcp)` — `resolve_variable` 反射加载

### 3. 权限三态模型

四个项目都收敛到 **allow / ask / deny** 三态：

| 项目 | 权限判定位置 | 规则来源 |
|------|-------------|---------|
| Claude Code | `tool.checkPermissions()` + PreToolUse Hooks | 工具自声明 `isReadOnly` / `isDestructive` |
| Hermes | Agent Loop 层 `_AGENT_LOOP_TOOLS` 拦截 | Toolset 启用/禁用 |
| OpenCode | `Permission.check(agentId, toolId, args)` | Agent 配置 ruleset 规则匹配 |
| DeerFlow | 无显式权限层（信任 Sandbox） | 沙箱隔离代替权限 |

### 4. 并发安全声明

- **Claude Code**: 工具显式声明 `isConcurrencySafe(input)`，`partitionToolCalls()` 按声明分批（safe 并发 / unsafe 串行）
- **Hermes**: 无内置并发控制，`delegate_task` 工具在 worker 线程跑并行
- **OpenCode**: `canExecuteParallel(toolCalls)` 检查后决定 `Promise.all` 或顺序

### 5. MCP 集成共性

| 维度 | Claude Code | Hermes | OpenCode |
|------|------------|--------|----------|
| 命名规则 | `mcp__server__tool` | `server:tool` | `mcp_server_tool` |
| 传输协议 | stdio / sse / ws / http | stdio / http | stdio |
| 工具描述截断 | 2048 字符 | 无 | 无 |
| 动态重载 | 无（启动时） | `deregister()` + 重注册 | 启动时 |
| 并发连接 | 本地 3 / 远程 20 | 无限制 | 无限制 |

### 6. Skills = 渐进式知识加载

三个项目（Hermes / DeerFlow / OpenCode）都实现了 Skills：

| 维度 | 核心共识 |
|------|---------|
| 载体 | `SKILL.md`（YAML frontmatter + Markdown 正文） |
| 发现 | 目录扫描 `~/.xxx/skills/` 或项目级 `.xxx/skills/` |
| 加载策略 | 三层渐进：元数据(始终)→正文(按需)→资源(执行时) |
| 触发 | description 字段匹配用户意图，Agent 自主决定加载 |
| 不占 System Prompt | 只有 name+description 常驻，正文按需读取 |

## 已确认事实

1. **内建工具优先**：所有项目在名称冲突时都保留内建工具，防止 MCP 恶意覆盖
2. **Fail-Closed 安全默认**：Claude Code `buildTool()` 默认 `isConcurrencySafe=false`, `isReadOnly=false`；OpenCode 默认 `deny`
3. **Schema = JSON Schema**：所有项目最终输出 OpenAI function calling 格式的 JSON Schema 给模型
4. **错误返回模型**：工具执行失败不抛异常终止，而是将错误信息作为 `tool_result` 返回给 LLM 自行纠正
5. **check_fn 动态可见性**：Hermes 的 `check_fn` 让缺少 API Key 的工具从模型视野中消失，而非运行时报错
6. **Hook 系统**：Claude Code (PreToolUse/PostToolUse) 和 Hermes (pre_tool_call/post_tool_call) 都支持拦截/修改/审计
7. **输出截断**：OpenCode 50KB 限制 + 持久化到文件；Hermes `max_result_size_chars` 100K 限制 + 摘要化
8. **类型修正**：Hermes `coerce_tool_args()` 在入口统一修复 LLM 的类型错误（`"42"` → `42`）

## Guga 迁移判断

### 采纳 (Adopt)

| 模式 | 理由 |
|------|------|
| **字典注册表 + 模块级 register()** | Hermes 方案。朴素、零摩擦、循环导入安全。Guga 初期工具数量 <30，不需要 Claude Code 那么重的协议对象 |
| **allow/ask/deny 三态权限** | 所有项目的共识。OpenCode 的 ruleset 规则匹配最适合多 Agent 场景 |
| **统一工具池 = builtin + MCP + plugin** | 模型无需区分工具来源，统一 Schema 输出 |
| **check_fn 动态可见性** | 比运行时报错优雅很多，减少 LLM 无用调用 |
| **错误返回模型而非终止** | 所有项目的共识，让 LLM 自我纠正 |
| **SKILL.md 渐进式加载** | DeerFlow 三层策略最优雅：元数据常驻、正文按需、资源执行时读 |
| **coerce_tool_args 类型修正** | 简单有效，在入口统一修复 LLM 类型错误 |

### 适配 (Adapt)

| 模式 | 如何适配 |
|------|---------|
| **Claude Code 并发分批** | 简化为工具声明 `readonly: boolean`，readonly 工具并发执行，非 readonly 串行 |
| **Claude Code PreToolUse Hook** | Guga 不需要复杂的 Hook 链，但需要一个 `beforeExecute` 钩子做权限检查和参数验证 |
| **MCP 命名规则** | 采用 `mcp__server__tool` 格式（Claude Code 方案），清晰且已成事实标准 |
| **Hermes Toolset 分组** | 简化为 tag 标记，按 Agent 角色过滤可用工具而非全量暴露 |

### 跳过 (Skip)

| 模式 | 理由 |
|------|------|
| Claude Code 完整 Tool 协议（UI 渲染、中断行为等） | 过度工程，Guga 不是 CLI 产品 |
| Hermes 持久化 event loop 异步桥接 | Go/Rust 实现不需要 Python asyncio 的 hack |
| Hermes Curator / Background Skill Review | 复杂的自进化机制，V1 不需要 |
| DeerFlow `resolve_variable` 反射加载 | 运行时反射不如显式注册安全 |
| Claude Code 四种 MCP 传输协议 | V1 只支持 stdio 即可 |

## 待验证问题

1. **Guga 的实现语言**：如果是 Go，工具注册可能需要接口 + 注册函数模式（类似 Hermes 但强类型）；如果是 TypeScript，可直接参考 OpenCode 的 `Tool.Info` 工厂模式
2. **权限规则存储**：OpenCode 用 Agent 配置内嵌 ruleset，Hermes 用 toolset 启用/禁用——Guga 的多 Agent 场景需要确认哪种粒度合适
3. **工具输出大小限制**：具体阈值需要根据 Guga 的目标模型 context window 决定（50KB? 100KB?）
4. **MCP 重连策略**：Claude Code 有 session 过期检测 + 认证雪崩防护，Guga V1 是否需要这个级别的健壮性
5. **Skills 与 Agent Prompt 的集成方式**：是注入 System Prompt 还是通过工具调用按需读取（DeerFlow 用前者的元数据 + 后者的正文）
