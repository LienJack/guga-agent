# Module 3: 手脚 - 工具与原子能力

> **目标**: 探索强大的工具箱 (`src/tool/`)，正是它们使 OpenCode 能够与你的代码库和世界交互。

---

## 1. 完整原生工具集 (Native Toolset)

OpenCode 内置 **20+ 原生工具**，按功能分类：

### 1.1 文件操作工具

| 工具 | 功能 | 源码 | 使用场景 |
| :--- | :--- | :--- | :--- |
| **`read`** | 读取文件内容 | `src/tool/read.ts` | 查看代码、配置文件 |
| **`write`** | 覆盖写入文件 | `src/tool/write.ts` | 创建新文件 |
| **`edit`** | 智能搜索替换编辑 | `src/tool/edit.ts` | 修改现有代码 |
| **`multiedit`** | 批量编辑多个文件 | `src/tool/multiedit.ts` | 跨文件重构 |
| **`patch`** | 应用 Git 补丁 | `src/tool/patch.ts` | 应用代码修改 |
| **`ls`** | 列出目录内容 | `src/tool/ls.ts` | 浏览文件结构 |

### 1.2 搜索工具

| 工具 | 功能 | 源码 | 使用场景 |
| :--- | :--- | :--- | :--- |
| **`glob`** | 文件名模式匹配 | `src/tool/glob.ts` | 查找 `**/*.ts` |
| **`grep`** | 文件内容搜索 | `src/tool/grep.ts` | 查找字符串/正则 |
| **`codesearch`** | LSP 代码符号搜索 | `src/tool/codesearch.ts` | 查找类/函数定义 |

### 1.3 命令执行

| 工具 | 功能 | 源码 | 使用场景 |
| :--- | :--- | :--- | :--- |
| **`bash`** | 执行 Shell 命令 | `src/tool/bash.ts` | 运行测试、构建 |
| **`batch`** | 批量执行操作 | `src/tool/batch.ts` | 并行处理多个任务 |

### 1.4 网络工具

| 工具 | 功能 | 源码 | 使用场景 |
| :--- | :--- | :--- | :--- |
| **`webfetch`** | 获取网页内容 | `src/tool/webfetch.ts` | 抓取文档、API 响应 |
| **`websearch`** | 网络搜索 | `src/tool/websearch.ts` | 搜索技术问题 |

### 1.5 交互工具

| 工具 | 功能 | 源码 | 使用场景 |
| :--- | :--- | :--- | :--- |
| **`question`** | 询问用户 | `src/tool/question.ts` | 获取用户输入 |
| **`task`** | 委托子任务给子 Agent | `src/tool/task.ts` | 并行处理复杂任务 |

### 1.6 项目管理

| 工具 | 功能 | 源码 | 使用场景 |
| :--- | :--- | :--- | :--- |
| **`todo`** (TodoRead/TodoWrite) | 待办事项管理 | `src/tool/todo.ts` | 追踪任务进度 |

### 1.7 LSP 工具

| 工具 | 功能 | 源码 | 使用场景 |
| :--- | :--- | :--- | :--- |
| **`lsp`** | LSP 操作 | `src/tool/lsp.ts` | 跳转定义、查找引用 |

### 1.8 系统工具

| 工具 | 功能 | 源码 | 使用场景 |
| :--- | :--- | :--- | :--- |
| **`invalid`** | 错误处理工具 | `src/tool/invalid.ts` | 处理无效工具调用 |

### 代码一瞥：`Tool` 的解剖学

所有的原生工具都是使用 `Tool.define` 定义的。以 `ReadTool` 为例，看看它如何优雅地处理权限请求：

```typescript
// src/tool/read.ts
export const ReadTool = Tool.define("read", {
  description: DESCRIPTION,
  // 1. 使用 Zod 定义输入参数，自动生成 JSON Schema
  parameters: z.object({
    filePath: z.string().describe("The path to the file to read"),
    offset: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
  }),
  async execute(params, ctx) {
    // ... 路径解析逻辑 ...
    
    // 2. 动态权限申请：这是一个阻塞调用！
    // 如果用户在 opencode.json 中配置了 "ask"，CLI 会在这里暂停等待用户 Y/N
    await ctx.ask({
      permission: "read",
      patterns: [filepath], // 检查是否有对该文件的读取权限
      always: ["*"],
    })

    // 3. 执行核心逻辑
    const file = Bun.file(filepath)
    // ... 读取并返回 ...
  }
})
```

### 1.9 重点工具详解

#### `edit` - 智能补丁编辑

**功能**: 使用搜索替换逻辑替换代码块，而不是重写整个文件

```typescript
// 使用示例
edit({
  filePath: "src/auth.ts",
  oldString: "function login()",
  newString: "async function login()",
})
```

**优势**: 
- ✅ 只修改必要的部分
- ✅ 保留代码格式
- ✅ 减少 token 使用

#### `multiedit` - 批量编辑

**功能**: 一次性编辑多个文件的多个位置

```typescript
// 跨文件重命名
multiedit({
  edits: [
    { filePath: "a.ts", oldString: "oldName", newString: "newName" },
    { filePath: "b.ts", oldString: "oldName", newString: "newName" },
  ]
})
```

#### `codesearch` - LSP 代码搜索

**功能**: 使用 LSP 进行语义代码搜索（精确定位符号定义）

```typescript
// 查找 AuthService 类
codesearch({ query: "AuthService", kind: "class" })
// 返回: { file: "src/auth/service.ts", line: 10, type: "class" }
```

**vs grep 的优势**:
- ✅ 理解代码结构（区分定义和引用）
- ✅ 支持跨文件跳转
- ✅ 准确率 100%

#### `task` - 子任务委托

**功能**: 创建子会话并行处理任务

```typescript
// Agent 将复杂任务分解
task({
  description: "Generate unit tests for AuthService",
  prompt: "Create comprehensive tests for all methods"
})
// 创建子 Agent 执行，结果汇总到主会话
```

#### `todo` - 待办管理

**功能**: Agent 追踪任务进度

```typescript
// Agent 创建任务列表
TodoWrite({
  todos: [
    { id: "1", content: "实现登录", status: "in_progress", priority: "high" },
    { id: "2", content: "写测试", status: "pending", priority: "medium" },
  ]
})

// 读取进度
TodoRead()
```

---

## 2. 高级能力：智能代码搜索 (LSP)

OpenCode 不仅仅是 "grep" 文本；它 **理解** 代码结构。

**模块**: `src/lsp/`

**工作原理**:
1.  **检测**: 它检测你的项目语言（如 Python, TypeScript, Go）。
2.  **Server 管理**: 它在后台隐式启动一个 Language Server (LSP) 进程（如 `pyright`, `gopls`）。
3.  **查询**: 当你问“`AuthService` 定义在哪里？”时，Agent 调用 `codesearch` 工具。
    -   这会转化为一个 LSP `textDocument/definition` 调用。
    -   结果是精确的位置数据（文件、行号），而不仅仅是松散的文本匹配。

这使得 OpenCode 能够像开发者在 VS Code 中一样进行“转到定义”和“查找引用”。

---

## 3. 高级能力：沙箱 (Worktrees)

OpenCode 通过 **Git Worktrees** 实现安全的实验。

**模块**: `src/worktree/`

**"安全网" 工作流**:
1.  你要求 Agent 执行一个高风险的重构。
2.  OpenCode 检测到任务很复杂。
3.  它执行 `git worktree add ...` 创建一个链接到新临时分支的并行目录（例如 `opencode/refactor-auth`）。
4.  Agent 在这个隔离目录中执行所有编辑和测试。
5.  你的主工作目录保持不变。
6.  只有当任务验证通过后，它才会提议将更改合并回来，或者直接删除 worktree。

---

## 4. 工具注册表 (The Tool Registry)

所有工具（原生、插件或 MCP）都由 `ToolRegistry` (`src/tool/registry.ts`) 统一管理。

它为 LLM 发现工具提供了一个统一的接口：
-   **发现**: 将 TypeScript 定义转换为 OpenAI Functions 的 JSON Schema。
-   **执行**: 使用 `before` 和 `after` 钩子包装每个工具调用（用于日志记录和权限检查）。
-   **过滤**: 根据当前 Agent 的权限隐藏工具（例如，`explore` Agent 会看到排除 `write` 的过滤列表）。
97: 
98: ## 5. 工具适配层 (Tool Adaptation Layer)
99: 
100: 你可能好奇：这些工具是如何与 Vercel AI SDK 集成的？
101: 
102: OpenCode 采用了一个**适配器模式**：开发者使用 OpenCode 自己的 `Tool.define` API 来获得更丰富的上下文支持（如 `sessionID`, `ask()` 等），然后在运行时动态转换为 Vercel SDK 的标准格式。
103: 
104: ```typescript
105: // src/session/prompt.ts (简化版)
106: for (const item of await ToolRegistry.tools(input.model.providerID)) {
107:   // 1. 包装为 Vercel AI SDK Tool
108:   tools[item.id] = tool({
109:     id: item.id,
110:     description: item.description,
111:     inputSchema: jsonSchema(item.parameters), 
112:     
113:     // 2. 注入 OpenCode 上下文 (Context)
114:     async execute(args, options) {
115:       // 构建包含 ask(), abort, sessionID 的高级上下文
116:       const ctx = context(args, options) 
117:       
118:       // 执行原生的 OpenCode 工具逻辑
119:       return await item.execute(args, ctx)
120:     },
121:   })
122: }
123: ```
124: 
125: 这种设计既保留了 Vercel SDK 对所有大模型的各种奇葩 Tool Call 格式的兼容性，又保留了 OpenCode 对系统底层（权限、文件系统）的深度控制能力。

## 下一步 (Next Step)
如果这些工具还不够怎么办？让我们验证如何使用标准协议扩展 OpenCode。
👉 [Module 4: 生态 - MCP 与 ACP 协议](./04-extensions-protocols.md)
