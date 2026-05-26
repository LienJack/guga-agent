# Cookbook - 实战案例集

> 从实战中学习，解决真实问题。

---

## 🎯 什么是 Cookbook？

Cookbook 是一系列**可复现的实战案例**，每个案例包含：

- ✅ **场景**: 实际应用场景
- ✅ **步骤**: 详细的操作步骤
- ✅ **代码**: 完整可运行的代码
- ✅ **原理**: 为什么这样设计

## 📚 案例列表

| 案例 | 难度 | 时间 | 主题 |
|------|------|------|------|
| **01. 创建自定义 Agent** | ⭐ | 20min | Agent 扩展 |
| **02. 集成 MCP Server** | ⭐⭐ | 30min | 工具扩展 |
| **03. 调试会话问题** | ⭐⭐ | 20min | 故障排查 |
| **04. 开发自定义工具** | ⭐⭐ | 30min | Plugin 开发 |
| **05. 构建 ACP 客户端** | ⭐⭐⭐ | 40min | 协议集成 |
| **06. 实现权限策略** | ⭐⭐⭐ | 30min | 安全控制 |
| **07. 优化 Agent 性能** | ⭐⭐⭐ | 30min | 性能优化 |
| **08. 测试 Agent 行为** | ⭐⭐ | 20min | 单元测试 |

---

## 🚀 快速开始

选择一个适合你当前水平的案例开始：

**初学者** (⭐):
- 👉 [01. 创建自定义 Agent](./01-create-custom-agent.md)
- 👉 [03. 调试会话问题](./03-debug-session.md)

**进阶开发者** (⭐⭐):
- 👉 [02. 集成 MCP Server](./02-integrate-mcp-server.md)
- 👉 [04. 开发自定义工具](./04-develop-custom-tool.md)
- 👉 [08. 测试 Agent 行为](./08-test-agent-behavior.md)

**高级开发者** (⭐⭐⭐):
- 👉 [05. 构建 ACP 客户端](./05-build-acp-client.md)
- 👉 [06. 实现权限策略](./06-implement-permission-policy.md)
- 👉 [07. 优化 Agent 性能](./07-optimize-agent-performance.md)

---

## 💡 学习建议

### 推荐学习顺序

**路径 1: Agent 扩展专家**
1. 创建自定义 Agent
2. 实现权限策略
3. 优化 Agent 性能

**路径 2: 工具开发专家**
1. 开发自定义工具
2. 集成 MCP Server
3. 构建 ACP 客户端

**路径 3: 完整实战**
1. 按顺序完成所有案例
2. 综合应用所学知识
3. 开发自己的插件

---

## 📖 每个案例的结构

每个案例都遵循相同的结构，方便你快速学习：

```markdown
# 案例 XX: [标题]

## 场景
实际应用场景描述

## 目标
学完本案例后，你将能够...

## 前置知识
需要了解的概念...

## 步骤 1: [步骤名]
详细的操作步骤

## 步骤 2: [步骤名]
详细的操作步骤

...

## 完整代码
可运行的完整代码

## 原理解析
为什么这样设计

## 扩展阅读
相关文档链接
```

---

## 🛠️ 准备工作

在开始之前，请确保：

```bash
# 1. 安装 OpenCode
curl -fsSL https://opencode.ai/install | bash

# 2. 初始化项目
mkdir my-opencode-project
cd my-opencode-project
opencode init

# 3. 配置 API Key (如果使用在线模型)
opencode config set anthropic.api-key YOUR_KEY

# 4. 验证安装
opencode run
```

---

## 💬 反馈和贡献

**发现问题？**
- 检查代码是否有误
- 查看相关文档
- 在 [GitHub Issues](https://github.com/anomalyco/opencode/issues) 提问

**想要贡献？**
- 提交新的案例 PR
- 改进现有案例
- 添加更多语言版本

---

## 📚 相关文档

- [快速入门](../getting-started.md) - 从零开始
- [学习路径](../learning_paths.md) - 系统学习
- [FAQ](../faq.md) - 常见问题
- [完整文档索引](../index.md) - 所有文档

---

**准备好开始实战了？** 👉 [第一个案例: 创建自定义 Agent](./01-create-custom-agent.md)
