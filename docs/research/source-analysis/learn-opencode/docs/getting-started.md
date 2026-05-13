# 快速入门指南 (Getting Started)

> 30分钟了解 OpenCode，从零开始你的 AI 编程助手之旅。

---

## 🎯 你会学到什么

通过本指南，你将：
- ✅ 理解 OpenCode 是什么，解决什么问题
- ✅ 在本地运行 OpenCode 并完成第一次对话
- ✅ 掌握核心概念：Agent、Session、Tool
- ✅ 了解如何进一步深入学习

预计时间：**30-40分钟**

---

## 1. OpenCode 是什么？

### 1.1 一句话定义

**OpenCode** 是一个**本地优先、完全掌控**的 AI 编程助手。

它不是云端 SaaS，而是运行在你电脑上的智能代理，通过本地文件访问、Git 操作和终端命令来理解并修改你的代码。

### 1.2 解决什么问题？

| 痛点 | 传统方案 | OpenCode 方案 |
|------|---------|---------------|
| 🔐 **代码隐私** | 上传到云端 | 🏠 100% 本地处理 |
| 🚫 **工具限制** | 只能查看代码 | 🛠️ 可执行任何命令 |
| 💰 **使用成本** | 按订阅收费 | 💸 只需 API 费用 |
| 🔧 **扩展能力** | 固定功能集 | 🔌 无限 MCP 插件 |
| 🌐 **网络依赖** | 离线不可用 | 📡 本地运行，可选在线模型 |

### 1.3 与其他工具对比

| 特性 | OpenCode | Cursor | GitHub Copilot | Aider |
|------|----------|--------|---------------|-------|
| **本地优先** | ✅ | ❌ | ❌ | ✅ |
| **可执行命令** | ✅ | ⚠️ 有限 | ❌ | ✅ |
| **多 Agent 系统** | ✅ | ❌ | ❌ | ❌ |
| **权限控制** | ✅ | ⚠️ 基础 | ❌ | ❌ |
| **插件生态 (MCP)** | ✅ | ❌ | ❌ | ⚠️ 有限 |
| **开源** | ✅ | ❌ | ❌ | ✅ |

**核心差异**：
- Cursor: 优秀的 IDE 集成，但数据上传云端
- GitHub Copilot: 自动补全强，但无法执行复杂任务
- Aider: 命令行工具，但缺乏 Agent 编排能力
- **OpenCode**: 本地优先 + Agent 编排 + 权限控制 + 插件生态

---

## 2. 30秒快速体验

### 2.1 安装（如果还没有）

```bash
# macOS/Linux
curl -fsSL https://opencode.ai/install | bash

# Windows (PowerShell)
irm https://opencode.ai/install.ps1 | iex
```

### 2.2 运行你的第一次对话

```bash
# 启动 OpenCode
opencode run

# 看到提示后，输入：
帮我创建一个 hello.txt 文件，内容是 "Hello OpenCode!"
```

**你会看到**：
```
🤖 OpenCode is thinking...
📝 Writing to hello.txt...
✅ Done! File created.
```

### 2.3 验证结果

```bash
# 查看创建的文件
cat hello.txt
# 输出: Hello OpenCode!

# 查看 Git 状态
git status
# 应该看到 hello.txt 已创建
```

**恭喜！你刚刚让 AI 帮你完成了第一个编程任务！** 🎉

---

## 3. 核心概念速览

在深入学习之前，先理解 4 个核心概念。

### 3.1 Agent (智能代理) 🤖

**Agent 是 OpenCode 的"大脑"**，负责：
- 🧠 理解你的需求
- 📋 制定执行计划
- 🔄 调用工具完成任务

**内置 Agent 类型**：

| Agent | 用途 | 示例场景 |
|------|------|---------|
| **build** | 默认 Agent，完整权限 | "重构这个函数" |
| **explore** | 代码探索，只读 | "帮我理解这个模块" |
| **plan** | 仅编辑计划文件 | "/plan 创建架构设计" |
| **general** | 并行子任务 | Agent 委派的小任务 |

### 3.2 Session (会话) 💬

**Session 是一次完整的对话**，包含：
- 📝 所有消息历史
- 🔧 所有工具调用记录
- 📊 会话状态和元数据

**类比**：
- 就像你和一个开发者的聊天记录
- 可以随时暂停、恢复、分享

### 3.3 Tool (工具) 🛠️

**Tool 是 Agent 的"手脚"**，用于：
- 📁 读取和写入文件
- 💻 执行终端命令
- 🔍 搜索代码库
- 🌐 获取网络资源

**内置工具**：
```
- read    读取文件
- write   写入文件
- bash    执行命令
- grep    搜索代码
- glob    查找文件
- webfetch 网络请求
```

### 3.4 Permission (权限) 🔒

**Permission 确保你对代码的完全掌控**：
- ✅ **允许**：某些工具自动执行（如读取文件）
- ❓ **询问**：危险操作需要批准（如删除文件）
- ❌ **拒绝**：某些操作默认禁止（如读取 .env）

**示例**：
```
Opencode: 我想删除 node_modules/
You: [Allow Once] [Allow Always] [Reject]
```

---

## 4. 第一次完整的编程任务

让我们完成一个稍微复杂一点的任务，感受 OpenCode 的能力。

### 4.1 场景：创建一个简单的 Web 服务器

**需求**：创建一个 Node.js HTTP 服务器，响应 "Hello World"

**步骤 1：启动 OpenCode**
```bash
opencode run
```

**步骤 2：输入需求**
```
创建一个 Node.js HTTP 服务器，监听 3000 端口，返回 "Hello World"
```

**步骤 3：观察 Agent 的工作**

你将看到类似这样的流程：
```
🧠 Agent: 我需要创建一个 server.js 文件...

🛠️ Tool: write file
   Path: server.js
   Content:
   ```
   const http = require('http');
   const server = http.createServer((req, res) => {
     res.writeHead(200, {'Content-Type': 'text/plain'});
     res.end('Hello World');
   });
   server.listen(3000);
   ```

✅ Agent: 文件已创建！现在测试一下...

🛠️ Tool: bash command
   Command: node server.js

✅ Agent: 服务器已启动！你可以在 http://localhost:3000 访问。
```

**步骤 4：验证结果**

```bash
# 新开一个终端，测试服务器
curl http://localhost:3000
# 输出: Hello World
```

### 4.2 如果出错了怎么办？

OpenCode 会自动重试：

```
❌ Agent: 服务器启动失败，端口被占用。

🧠 Agent: 让我尝试使用不同的端口...

🛠️ Tool: edit file
   修改 server.js: 3000 → 3001

🛠️ Tool: bash command
   Command: node server.js

✅ Agent: 现在成功了！http://localhost:3001
```

---

## 5. 高级功能预览

### 5.1 使用 `/plan` 模式

```bash
opencode run

# 输入：
/plan 创建一个 RESTful API

# Agent 会生成一个计划文件（只编辑 .opencode/plan/）
# 不会实际修改代码
```

### 5.2 并行执行任务

```bash
# Agent 可以同时执行多个子任务
同时检查 frontend 和 backend 的依赖版本，并生成报告
```

### 5.3 会话持久化

```bash
# 会话自动保存
opencode run

# 恢复上次会话
opencode run --resume
```

### 5.4 切换模型

```bash
# 使用不同的 LLM 模型
opencode run --model anthropic/claude-sonnet-4

# 或在 opencode.json 中配置
{
  "model": "anthropic/claude-sonnet-4"
}
```

---

## 6. 常见问题 (FAQ)

### Q1: OpenCode 需要什么系统要求？

**最低要求**：
- OS: macOS 12+, Linux, Windows 10+
- RAM: 8GB (推荐 16GB)
- 存储: 500MB
- 网络: 可选（如果使用在线 LLM）

### Q2: 数据会上传到云端吗？

**不会！** OpenCode 默认：
- ✅ 100% 本地处理
- ✅ 代码不上传
- ⚠️ 只有 LLM 调用会发送到 API（如果使用在线模型）

### Q3: 如何获取 LLM API Key？

OpenCode 支持多种模型提供商：
- **Anthropic**: https://console.anthropic.com/
- **OpenAI**: https://platform.openai.com/
- **本地模型**: 通过 Ollama

配置方式：
```bash
opencode config set anthropic.api-key YOUR_KEY
```

### Q4: 可以离线使用吗？

**可以！** 如果使用本地模型（Ollama）：
```bash
# 安装 Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 下载模型
ollama pull llama3

# OpenCode 使用本地模型
opencode run --model ollama/llama3
```

### Q5: 如何退出？

```bash
# 按 Ctrl+C 退出
```

---

## 7. 下一步去哪里？

完成快速入门后，你有几个选择：

### 选项 A：快速了解 (1-2小时)
👉 [查看系统架构图](./architecture/README.md)
👉 [阅读 Agent 生命周期](./flow/agent_lifecycle.md)

### 选项 B：深入开发 (1-2天)
👉 [开始学习路径 B](./learning_paths.md#路径-b-深入开发)
👉 [阅读核心包分析](./packages/opencode/README.md)

### 选项 C：实战应用 (半天)
👉 [浏览 Cookbook 案例](./cookbook/)
👉 [创建自定义 Agent](./cookbook/01-create-custom-agent.md)

---

## 8. 检查你的理解 ✅

在继续之前，确保你能回答以下问题：

- [ ] OpenCode 与其他 AI 编程助手的核心区别是什么？
- [ ] Agent、Session、Tool 这三个概念的关系是什么？
- [ ] 权限系统如何保护你的代码？
- [ ] 如何创建一个简单的文件？
- [ ] 如果工具执行失败，Agent 会怎么做？

**如果你能回答所有问题，恭喜！你已经掌握了 OpenCode 的基础！** 🎓

---

## 📚 相关文档

- [完整学习路径](./learning_paths.md) - 从入门到精通的路线图
- [系统架构总览](./architecture/README.md) - 理解整体设计
- [Agent 深入解析](./internals/agent.md) - Agent 的工作原理
- [FAQ 完整版](./faq.md) - 更多常见问题

---

**准备开始深入学习了？** 👉 [查看学习路径](./learning_paths.md)
