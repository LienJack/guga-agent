# 文档索引 (Documentation Index)

> OpenCode 学习文档的完整索引。

---

## 🚀 快速导航

- **[快速入门](./getting-started.md)** - 30分钟了解 OpenCode
- **[学习路径](./learning_paths.md)** - 从入门到精通的系统路线
- **[FAQ](./faq.md)** - 常见问题解答
- **[Cookbook](./cookbook/)** - 实战案例集

---

## 📚 按学习阶段分类

### 🌱 入门 (Getting Started)

| 文档 | 时间 | 描述 |
|------|------|------|
| **[快速入门](./getting-started.md)** | 30min | 从零开始，第一次对话 |
| **[FAQ](./faq.md)** | 按需 | 常见问题解答 |

### 📖 学习路径 (Learning Paths)

| 路径 | 时间 | 难度 | 适合人群 |
|------|------|------|---------|
| **[路径 A: 快速了解](./learning_paths.md#路径-a-快速了解)** | 1-2h | ⭐ | PM/评估者 |
| **[路径 B: 深入开发](./learning_paths.md#路径-b-深入开发)** | 1-2天 | ⭐⭐⭐ | 工程师 |
| **[路径 C: 扩展生态](./learning_paths.md#路径-c-扩展生态)** | 半天 | ⭐⭐ | 插件开发者 |

---

## 📦 按模块分类

### 架构与设计 (Architecture & Design)

| 文档 | 难度 | 描述 |
|------|------|------|
| **[系统架构](./architecture/README.md)** | ⭐ | Monorepo 结构解析 |
| **[ACP 协议](./concepts/acp.md)** | ⭐⭐ | 编辑器集成协议 |
| **[MCP 协议](./concepts/mcp.md)** | ⭐⭐ | 工具扩展协议 |
| **[LSP 协议](./concepts/lsp.md)** | ⭐⭐ | 代码智能协议 |

### 核心包 (Core Packages)

| 包 | 文档 | 难度 | 优先级 |
|------|------|------|--------|
| **opencode** | [📄](./packages/opencode/README.md) | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **sdk** | [📄](./packages/sdk/README.md) | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **plugin** | [📄](./packages/plugin/README.md) | ⭐⭐⭐ | ⭐⭐ |
| **console** | [📄](./packages/console/README.md) | ⭐⭐⭐ | ⭐⭐ |
| **app** | [📄](./packages/app/README.md) | ⭐⭐⭐ | ⭐⭐ |
| **desktop** | [📄](./packages/desktop/README.md) | ⭐⭐⭐ | ⭐⭐ |
| **ui** | [📄](./packages/ui/README.md) | ⭐⭐ | ⭐⭐ |
| **slack** | [📄](./packages/slack/README.md) | ⭐⭐ | ⭐ |
| **extensions** | [📄](./packages/extensions/README.md) | ⭐⭐ | ⭐ |
| **enterprise** | [📄](./packages/enterprise/README.md) | ⭐⭐ | ⭐ |
| **web** | [📄](./packages/web/README.md) | ⭐ | ⭐ |
| **util** | [📄](./packages/util/README.md) | ⭐ | ⭐ |
| **function** | [📄](./packages/function/README.md) | ⭐ | ⭐ |

### 内部模块 (Internals)

| 模块 | 文档 | 难度 | 优先级 |
|------|------|------|--------|
| **agent** | [📄](./internals/agent.md) | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **config** | [📄](./internals/config.md) | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **permission** | [📄](./internals/permission.md) | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **session** | [📄](./internals/session.md) | ⭐⭐⭐ | ⭐⭐⭐ |
| **snapshot** | [📄](./internals/snapshot.md) | ⭐⭐⭐ | ⭐⭐⭐ |
| **skill** | [📄](./internals/skill.md) | ⭐⭐ | ⭐⭐ |
| **share** | [📄](./internals/share.md) | ⭐⭐ | ⭐⭐ |
| **pty** | [📄](./internals/pty.md) | ⭐⭐⭐ | ⭐⭐⭐ |
| **bus** | [📄](./internals/bus.md) | ⭐⭐ | ⭐⭐⭐ |
| **project** | [📄](./internals/project.md) | ⭐⭐ | ⭐⭐⭐ |
| **tool** | [📄](./internals/tool.md) | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **cli** | [📄](./internals/cli.md) | ⭐⭐⭐ | ⭐⭐⭐ |
| **utilities** | [📄](./internals/utilities.md) | ⭐ | ⭐ |

### 协议实现 (Protocol Implementations)

| 模块 | 文档 | 难度 | 优先级 |
|------|------|------|--------|
| **MCP 实现** | [📄](./internals/mcp-implementation.md) | ⭐⭐⭐ | ⭐⭐⭐ |
| **LSP 实现** | [📄](./internals/lsp-implementation.md) | ⭐⭐⭐ | ⭐⭐⭐ |
| **ACP 实现** | [📄](./internals/acp-implementation.md) | ⭐⭐⭐ | ⭐⭐⭐ |

### 关键流程 (Key Workflows)

| 流程 | 文档 | 难度 | 描述 |
|------|------|------|------|
| **Agent 生命周期** | [📄](./flow/agent_lifecycle.md) | ⭐⭐⭐ | 从 Prompt 到 Code |
| **状态同步** | [📄](./flow/state_sync.md) | ⭐⭐⭐ | 实时更新机制 |
| **插件加载** | [📄](./flow/plugin_loading.md) | ⭐⭐ | 插件系统流程 |
| **工具执行** | [📄](./flow/tool_execution.md) | ⭐⭐⭐⭐ | 工具调用详解 |
| **权限流程** | [📄](./flow/permission_flow.md) | ⭐⭐⭐ | 权限检查机制 |
| **快照回滚** | [📄](./flow/snapshot_rollback.md) | ⭐⭐ | Git 变更追踪 |
| **错误处理** | [📄](./flow/error_handling.md) | ⭐⭐ | 错误恢复策略 |

### 集成与生态 (Integrations)

| 集成 | 文档 | 难度 |
|------|------|------|
| **VS Code** | [📄](./editors/vscode.md) | ⭐⭐ |
| **GitHub Action** | [📄](./integrations/github-action.md) | ⭐⭐ |

### 实战案例 (Cookbook)

| 案例 | 文档 | 难度 | 时间 |
|------|------|------|------|
| **创建自定义 Agent** | [📄](./cookbook/01-create-custom-agent.md) | ⭐ | 20min |
| **集成 MCP Server** | [📄](./cookbook/02-integrate-mcp-server.md) | ⭐⭐ | 30min |
| **调试会话问题** | [📄](./cookbook/03-debug-session.md) | ⭐⭐ | 20min |

---

## 🔍 按关键词索引

### A

- **Agent**: [定义](./internals/agent.md), [生命周期](./flow/agent_lifecycle.md), [自定义 Agent](./cookbook/01-create-custom-agent.md)
- **ACP**: [协议详解](./concepts/acp.md)
- **Architecture**: [系统架构](./architecture/README.md)

### C

- **CLI**: [opencode 包](./packages/opencode/README.md)
- **Config**: [配置系统](./internals/config.md)
- **Console**: [管理后台](./packages/console/README.md)

### E

- **Error Handling**: [错误处理](./flow/error_handling.md), [故障排查](./cookbook/03-debug-session.md)

### M

- **MCP**: [协议详解](./concepts/mcp.md), [集成 MCP Server](./cookbook/02-integrate-mcp-server.md)
- **Model**: [Provider 系统](./internals/provider.md)

### P

- **Permission**: [权限系统](./internals/permission.md), [权限流程](./flow/permission_flow.md)
- **Plugin**: [插件系统](./packages/plugin/README.md), [插件加载](./flow/plugin_loading.md)
- **PTY**: [终端模拟](./internals/pty.md)

### S

- **Session**: [会话管理](./internals/session.md), [会话调试](./cookbook/03-debug-session.md)
- **Snapshot**: [快照系统](./internals/snapshot.md), [快照回滚](./flow/snapshot_rollback.md)
- **SDK**: [SDK 包](./packages/sdk/README.md)
- **Skill**: [技能系统](./internals/skill.md)

### T

- **Tool**: [工具注册表](./internals/tool.md), [工具执行](./flow/tool_execution.md)

---

## 📊 文档统计

| 类别 | 文档数量 | 总字数 |
|------|---------|--------|
| 入门指南 | 2 | ~15,000 |
| 学习路径 | 1 | ~5,000 |
| 架构设计 | 4 | ~20,000 |
| 核心包 | 12 | ~30,000 |
| 内部模块 | 10 | ~25,000 |
| 关键流程 | 7 | ~20,000 |
| 集成 | 2 | ~5,000 |
| 实战案例 | 3 | ~15,000 |
| **总计** | **41** | **~135,000** |

---

## 🎯 学习建议

### 第一次学习？

1. 👉 **[快速入门](./getting-started.md)** (30min)
2. 👉 **[学习路径 A](./learning_paths.md#路径-a-快速了解)** (1-2h)
3. 👉 **[Cookbook - 案例 01](./cookbook/01-create-custom-agent.md)** (20min)

### 想要深入开发？

1. 👉 **[学习路径 B](./learning_paths.md#路径-b-深入开发)** (1-2天)
2. 👉 **[核心包 - opencode](./packages/opencode/README.md)** (必读)
3. 👉 **[内部模块 - Agent](./internals/agent.md)** (必读)

### 想要扩展生态？

1. 👉 **[学习路径 C](./learning_paths.md#路径-c-扩展生态)** (半天)
2. 👉 **[Cookbook](./cookbook/)** (实战案例)
3. 👉 **[插件系统](./packages/plugin/README.md)** (核心)

---

## 💬 获取帮助

- 📖 查找文档：使用本索引
- ❓ 常见问题：[FAQ](./faq.md)
- 🍳 实战问题：[Cookbook](./cookbook/)
- 💬 社区支持：[GitHub Discussions](https://github.com/anomalyco/opencode/discussions)

---

**准备好开始学习了？** 👉 [快速入门](./getting-started.md)
