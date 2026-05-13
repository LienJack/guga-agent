# 常见问题 (FAQ)

> OpenCode 使用过程中的常见问题解答。

---

## 📋 目录

- [概念理解](#概念理解)
- [使用问题](#使用问题)
- [配置与安装](#配置与安装)
- [开发问题](#开发问题)
- [故障排查](#故障排查)

---

## 概念理解

### Q1: Agent 和 Plugin 的区别是什么？

**Agent (智能代理)** 是思考的大脑，负责：
- 🧠 理解你的需求
- 📋 制定执行计划
- 🔄 调用工具完成任务
- 🔧 决策和重试

**Plugin (插件)** 是扩展能力的接口，负责：
- 🔌 定义新的工具
- 🎣 钩子到 Agent 的生命周期
- 📦 封装外部服务

**关系**：
```
Agent (大脑) → 调用 → Plugin 提供的工具 (手脚)
```

**示例**：
- Agent: "我需要读取文件" → 调用 `read` 工具
- Plugin: 提供 `read` 工具的实现

---

### Q2: MCP 和 ACP 的关系是什么？

| 协议 | 全称 | 用途 | 位置 |
|------|------|------|------|
| **ACP** | Agent Context Protocol | 编辑器与 Agent 通信 | 编辑器层 |
| **MCP** | Model Context Protocol | Agent 与工具服务器通信 | 工具层 |
| **LSP** | Language Server Protocol | 编辑器与代码智能服务通信 | 代码层 |

**架构关系**：
```
IDE (Zed/VS Code)
  ↓ ACP
OpenCode Agent
  ↓ MCP
MCP Servers (Filesystem, Database, Slack...)
```

**简单理解**：
- ACP: 让 IDE 控制 Agent
- MCP: 让 Agent 访问工具
- LSP: 让 IDE 获取代码智能

---

### Q3: Session 和 Project 的区别是什么？

**Session (会话)** 是一次对话：
- 💬 包含消息历史
- 🛠️ 包含工具调用记录
- 📊 临时状态，可以删除
- 🔄 可以暂停和恢复

**Project (项目)** 是工作上下文：
- 📁 指定工作目录
- 📝 包含配置文件 (opencode.json)
- 🔧 包含插件和 MCP Servers
- 🎯 持久化，长期存在

**关系**：
```
一个 Project 可以包含多个 Sessions

Project: /path/to/my-app
├── opencode.json
├── Session 1: "重构登录功能"
└── Session 2: "添加单元测试"
```

---

### Q4: 什么是 Worktree？为什么要用它？

**Worktree (工作树)** 是 Git 的一个特性，允许你：
- 🌳 在同一仓库的多个工作目录中工作
- 🔒 隔离不同任务的修改
- 🚀 并行处理多个任务

**OpenCode 的使用场景**：
```
主工作目录: /my-app (当前稳定版本)
Worktree: /my-app-worktree (AI 正在修改的版本)
```

**好处**：
- ✅ AI 修改不影响你的主工作区
- ✅ 可以随时回滚到 Worktree 之前的版本
- ✅ 并行开发，AI 修改时你可以继续工作

---

## 使用问题

### Q5: 如何切换模型？

**方法 1: 命令行参数**
```bash
opencode run --model anthropic/claude-sonnet-4
opencode run --model openai/gpt-4-turbo
opencode run --model ollama/llama3  # 本地模型
```

**方法 2: 配置文件**
```json
// opencode.json
{
  "model": {
    "providerID": "anthropic",
    "modelID": "claude-sonnet-4-20250514"
  }
}
```

**方法 3: 在会话中切换**
```
> /model anthropic/claude-3-5-sonnet-20241022
```

**可用模型列表**：
```bash
opencode models
```

---

### Q6: 如何禁用某个工具？

**方法 1: Agent 权限配置**
```json
// opencode.json
{
  "agent": {
    "build": {
      "permission": {
        "delete": "deny",  // 禁止删除
        "bash": "ask"      // 执行命令需要批准
      }
    }
  }
}
```

**方法 2: 插件卸载**
```bash
opencode plugin uninstall plugin-name
```

**方法 3: 临时禁用 MCP Server**
```bash
opencode run --no-mcp
```

---

### Q7: 如何查看会话历史？

**方法 1: 命令行**
```bash
opencode history

# 查看特定会话
opencode history <session-id>
```

**方法 2: 在会话中**
```
> /history
```

**方法 3: 文件系统**
```bash
# 会话存储在 ~/.opencode/sessions/
ls ~/.opencode/sessions/
```

---

### Q8: 如何分享会话？

**方法 1: 生成分享链接**
```bash
opencode share <session-id>

# 输出: https://opencode.ai/share/xxx
```

**方法 2: 导出会话**
```bash
opencode export <session-id> --output session.json
```

**方法 3: 复制到新项目**
```bash
opencode session copy <session-id> --directory /new/project
```

**注意**：分享功能需要配置云端服务。

---

### Q9: 如何使用 `/plan` 模式？

`/plan` 模式让 Agent 只生成计划，不实际修改代码：

```bash
opencode run

> /plan 设计一个 RESTful API

# Agent 会在 .opencode/plan/ 创建计划文件
# 不会修改任何实际代码
```

**查看计划**：
```bash
cat .opencode/plan/latest.md
```

**执行计划**：
```
> /plan execute
```

---

### Q10: 如何并行执行任务？

OpenCode 的 `general` Agent 可以并行执行子任务：

```
> 同时检查 frontend 和 backend 的依赖版本，并生成报告
```

Agent 会：
1. 🔄 创建多个子 Agent
2. ⚡ 并行执行任务
3. 📊 汇总结果

**限制**：
- 默认最多 3 个并行任务
- 可在配置中调整
```json
{
  "agent": {
    "general": {
      "options": {
        "maxParallel": 5
      }
    }
  }
}
```

---

## 配置与安装

### Q11: 系统要求是什么？

**最低要求**：
- OS: macOS 12+, Linux, Windows 10+
- RAM: 8GB (推荐 16GB)
- 存储: 500MB
- CPU: 2 核 (推荐 4 核)

**推荐配置**：
- RAM: 16GB+
- 存储: 5GB+ (包括依赖)
- 网络: 宽带 (如果使用在线 LLM)

**本地模型要求**：
- RAM: 16GB (llama3-70b 需要 32GB+)
- GPU: 可选，但推荐

---

### Q12: 如何获取 API Key？

**Anthropic (Claude)**:
1. 访问 https://console.anthropic.com/
2. 创建账户
3. 进入 API Keys 页面
4. 创建新的 API Key
5. 配置到 OpenCode:
   ```bash
   opencode config set anthropic.api-key YOUR_KEY
   ```

**OpenAI (GPT)**:
1. 访问 https://platform.openai.com/
2. 创建账户
3. 进入 API Keys 页面
4. 创建新的 API Key
5. 配置到 OpenCode:
   ```bash
   opencode config set openai.api-key YOUR_KEY
   ```

**本地模型 (Ollama)**:
```bash
# 安装 Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 下载模型
ollama pull llama3

# 不需要 API Key
opencode run --model ollama/llama3
```

---

### Q13: 如何更新 OpenCode？

**方法 1: 自动更新**
```bash
opencode update
```

**方法 2: 重新安装**
```bash
curl -fsSL https://opencode.ai/install | bash
```

**方法 3: 从源码构建**
```bash
git clone https://github.com/anomalyco/opencode.git
cd opencode
git pull
bun install
bun run build
```

---

### Q14: 如何卸载 OpenCode？

**macOS/Linux**:
```bash
# 删除可执行文件
rm /usr/local/bin/opencode

# 删除配置和数据
rm -rf ~/.opencode

# 删除缓存
rm -rf ~/Library/Caches/opencode  # macOS
rm -rf ~/.cache/opencode          # Linux
```

**Windows**:
```powershell
# 删除可执行文件
Remove-Item "$env:USERPROFILE\.local\bin\opencode.exe"

# 删除配置和数据
Remove-Item -Recurse -Force "$env:USERPROFILE\.opencode"
```

---

## 开发问题

### Q15: 如何调试 Agent 的思考过程？

**方法 1: 启用调试日志**
```bash
opencode run --debug
```

**方法 2: 查看详细日志**
```bash
opencode run --log-level debug
```

**方法 3: 单步调试** (需要源码)
```bash
git clone https://github.com/anomalyco/opencode.git
cd opencode
bun install

# 使用 Node.js 调试器
node --inspect-brk packages/opencode/dist/cli.js run
```

**方法 4: 查看 Agent 的 Prompt**
```bash
opencode session <session-id> --show-prompt
```

---

### Q16: 如何添加自定义工具？

**方法 1: 通过 Plugin**
```typescript
// my-plugin.ts
import { z } from "zod"

export default async function plugin({ client, $ }) {
  return {
    tool: {
      "my-tool": {
        description: "我的自定义工具",
        parameters: z.object({
          input: z.string()
        }),
        async execute({ input }) {
          return `处理结果: ${input}`
        }
      }
    }
  }
}
```

**方法 2: 通过 MCP Server**
```typescript
// my-mcp-server.ts
import { Server } from "@modelcontextprotocol/sdk/server"

const server = new Server(
  { name: "my-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
)

server.setRequestHandler("tools/list", async () => ({
  tools: [{
    name: "my-tool",
    description: "我的工具",
    inputSchema: {
      type: "object",
      properties: { input: { type: "string" } }
    }
  }]
}))
```

**详细教程**: 👉 [Cookbook - 集成 MCP Server](./cookbook/02-integrate-mcp-server.md)

---

### Q17: 如何创建自定义 Agent？

**方法 1: 通过配置文件**
```json
// opencode.json
{
  "agent": {
    "my-agent": {
      "description": "专门处理 TypeScript",
      "model": "anthropic/claude-sonnet-4-20250514",
      "temperature": 0.3,
      "prompt": "你是一个 TypeScript 专家...",
      "permission": {
        "*": "allow"
      }
    }
  }
}
```

**方法 2: 通过 Markdown**
```markdown
---
description: 专门处理 TypeScript 代码
model: anthropic/claude-sonnet-4-20250514
temperature: 0.3
---

# TypeScript Expert

你是一个 TypeScript 专家，专注于类型安全和最佳实践...
```

保存为 `.opencode/agent/my-agent.md`

**详细教程**: 👉 [Cookbook - 创建自定义 Agent](./cookbook/01-create-custom-agent.md)

---

### Q18: 如何贡献代码？

**步骤 1: Fork 并克隆**
```bash
git clone https://github.com/YOUR_USERNAME/opencode.git
cd opencode
git remote add upstream https://github.com/anomalyco/opencode.git
```

**步骤 2: 创建分支**
```bash
git checkout -b feature/my-feature
```

**步骤 3: 开发和测试**
```bash
bun install
bun test
bun dev
```

**步骤 4: 提交和推送**
```bash
git add .
git commit -m "feat: add my feature"
git push origin feature/my-feature
```

**步骤 5: 创建 Pull Request**
访问 https://github.com/anomalyco/opencode/pulls

---

### Q19: 如何编写测试？

OpenCode 使用 Bun Test：

```typescript
// my-tool.test.ts
import { describe, expect, it } from "bun:test"
import { MyTool } from "./my-tool"

describe("MyTool", () => {
  it("should process input correctly", async () => {
    const tool = new MyTool()
    const result = await tool.execute({ input: "test" })
    expect(result).toBe("处理结果: test")
  })
})
```

**运行测试**:
```bash
bun test

# 运行单个测试文件
bun test my-tool.test.ts
```

---

## 故障排查

### Q20: Agent 一直在 "Thinking"，怎么办？

**检查 1: 模型 API 是否正常**
```bash
# 测试 API 连接
opencode test --model anthropic/claude-sonnet-4
```

**检查 2: Prompt 是否过长**
```bash
opencode session <session-id> --stats
# 查看 token 使用量
```

**检查 3: 工具调用是否卡住**
```bash
opencode session <session-id> --show-tools
```

**解决方案**:
- 按 `Ctrl+C` 中止
- 使用更快的模型 (如 claude-3-haiku)
- 减少上下文长度

---

### Q21: 权限请求一直弹出，怎么办？

**临时解决**:
```
> /permission --allow-all
```

**永久解决**:
```json
// opencode.json
{
  "agent": {
    "build": {
      "permission": {
        "*": "allow"
      }
    }
  }
}
```

**注意**: 仅在受信任的项目中使用

---

### Q22: 如何恢复被删除的文件？

**方法 1: 使用快照**
```bash
opencode snapshot list
opencode snapshot restore <snapshot-id>
```

**方法 2: 使用 Git**
```bash
git checkout HEAD~1 -- deleted-file.ts
```

**方法 3: 查看工作树**
```bash
opencode worktree list
opencode worktree restore <worktree-id>
```

---

### Q23: 如何提高响应速度？

**方法 1: 使用更快的模型**
```bash
opencode run --model anthropic/claude-3-haiku
```

**方法 2: 减少上下文**
```json
{
  "agent": {
    "build": {
      "options": {
        "maxContextTokens": 32000
      }
    }
  }
}
```

**方法 3: 使用本地模型**
```bash
opencode run --model ollama/llama3
```

**方法 4: 禁用不必要的工具**
```json
{
  "agent": {
    "build": {
      "permission": {
        "codesearch": "deny"
      }
    }
  }
}
```

---

### Q24: 如何联系技术支持？

**方法 1: GitHub Issues**
https://github.com/anomalyco/opencode/issues

**方法 2: GitHub Discussions**
https://github.com/anomalyco/opencode/discussions

**方法 3: Discord 社区**
https://discord.gg/opencode

**方法 4: 邮件**
support@opencode.ai

---

## 📚 相关文档

- [快速入门](./getting-started.md) - 从零开始
- [学习路径](./learning_paths.md) - 系统学习
- [Cookbook](./cookbook/) - 实战案例
- [故障排查](./troubleshooting.md) - 更多问题

---

**还有问题？** 👉 [在 GitHub 提问](https://github.com/anomalyco/opencode/discussions)
