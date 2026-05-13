# OpenCode 学习路径指南

> 从入门到精通的系统学习路线。

## 🎯 学习目标

通过本指南，你将：
1. ✅ 理解 OpenCode 的整体架构
2. ✅ 掌握核心模块的工作原理
3. ✅ 能够扩展或贡献代码

---

## 📚 准备工作：快速入门

**在开始之前，建议先阅读**：👉 [快速入门指南](./getting-started.md) ⏱️ 30分钟

快速入门会帮你：
- ✅ 理解 OpenCode 是什么
- ✅ 运行你的第一次对话
- ✅ 掌握核心概念

---

## 📊 学习路径选择

根据你的目标选择路径：

| 目标 | 推荐路径 | 预计时间 | 难度 |
| :--- | :--- | :---: | :---: |
| **快速了解** | [路径 A](#路径-a-快速了解) | 1-2 小时 | ⭐ |
| **深入开发** | [路径 B](#路径-b-深入开发) | 1-2 天 | ⭐⭐⭐ |
| **扩展生态** | [路径 C](#路径-c-扩展生态) | 半天 | ⭐⭐ |

---

## 路径 A: 快速了解 ⏱️ 1-2 小时 ⭐

**适合**: 产品经理、技术负责人、评估者

### Step 1: 系统全景 (15 min)
- 📖 阅读 [快速入门指南](./getting-started.md) ⏱️ 30min - **先从这里开始**
- 🖼️ 查看 [系统架构图](./architecture/opencode_system_architecture.png)
- 📖 阅读 [Monorepo 结构解析](./architecture/README.md) ⏱️ 15min

### Step 2: 核心流程 (45 min)
- 🧠 阅读 [Agent 生命周期](./flow/agent_lifecycle.md) ⏱️ 20min
- ⚡ 阅读 [状态同步机制](./flow/state_sync.md) ⏱️ 15min
- 🔌 阅读 [插件加载流程](./flow/plugin_loading.md) ⏱️ 10min

### Step 3: 协议理解 (30 min)
- 📖 阅读 [ACP 协议](./concepts/acp.md) ⏱️ 15min - 编辑器集成
- 📖 阅读 [MCP 协议](./concepts/mcp.md) ⏱️ 15min - 工具扩展
- 📖 阅读 [LSP 协议](./concepts/lsp.md) ⏱️ 10min - 代码智能

### Step 4: 动手体验 (30 min)
```bash
# 安装并运行
curl -fsSL https://opencode.ai/install | bash
opencode run

# 尝试几个简单的任务
- 创建一个文件
- 搜索代码
- 查看会话历史
```

---

## 路径 B: 深入开发 ⏱️ 1-2 天 ⭐⭐⭐

**适合**: 想要贡献代码或二次开发的工程师

### Phase 1: 核心理解 (3-4 小时)

#### 1.1 核心 Agent ⏱️ 2小时
1. 📖 **[packages/opencode](./packages/opencode/README.md)** ⏱️ 60min - **必读，核心中的核心**
   - 先读 Module 0: 架构总览
   - 再读 Module 1-4: 系列课程
2. 📖 **[内部模块: Agent 定义](./internals/agent.md)** ⏱️ 30min
3. 📖 **[内部模块: 配置系统](./internals/config.md)** ⏱️ 30min
4. 📖 **[内部模块: 权限系统](./internals/permission.md)** ⏱️ 30min

#### 1.2 通信层 ⏱️ 1.5小时
1. 📖 **[packages/sdk](./packages/sdk/README.md)** ⏱️ 45min
   - 理解 OpenAPI 生成
   - 理解 SSE 事件流
2. 📖 **[内部模块: 事件总线](./internals/bus.md)** ⏱️ 15min
3. 📖 **[内部模块: Session](./internals/session.md)** ⏱️ 30min

### Phase 2: 客户端实现 (3-4 小时)

#### 2.1 Web App ⏱️ 2小时
1. 📖 **[packages/app](./packages/app/README.md)** ⏱️ 60min
2. 📖 **[packages/ui](./packages/ui/README.md)** ⏱️ 60min

#### 2.2 Desktop ⏱️ 1小时
1. 📖 **[packages/desktop](./packages/desktop/README.md)** ⏱️ 60min

#### 2.3 编辑器集成 ⏱️ 1小时
1. 📖 **[VS Code 扩展](./editors/vscode.md)** ⏱️ 30min
2. 📖 **[ACP 协议](./concepts/acp.md)** ⏱️ 30min - 已在 Phase 1 阅读过

### Phase 3: 关键机制 (2-3 小时)

按优先级阅读：
1. ⭐⭐⭐⭐⭐ 📖 **[快照系统](./internals/snapshot.md)** ⏱️ 30min - Git 集成
2. ⭐⭐⭐⭐ 📖 **[技能系统](./internals/skill.md)** ⏱️ 20min - 指令模板
3. ⭐⭐⭐⭐ 📖 **[终端模拟](./internals/pty.md)** ⏱️ 30min - PTY 管理
4. ⭐⭐⭐ 📖 **[分享功能](./internals/share.md)** ⏱️ 20min - 云端同步
5. ⭐⭐⭐ 📖 **[工作树](./internals/worktree.md)** ⏱️ 20min - 沙箱环境

### Phase 4: 动手实践 (可选，2-3小时)

```bash
# 克隆并运行
git clone https://github.com/anomalyco/opencode.git
cd opencode
bun install
bun dev

# 尝试以下任务
1. 添加一个新的内置工具
2. 创建一个自定义 Agent
3. 修改 Agent 的 System Prompt
4. 调试一个 Session 的执行流程
```

### Phase 5: 实战案例 (可选，3-4小时)

📖 浏览 [Cookbook](./cookbook/) 并完成至少2个案例：
- [创建自定义 Agent](./cookbook/01-create-custom-agent.md)
- [集成 MCP Server](./cookbook/02-integrate-mcp-server.md)
- [调试会话问题](./cookbook/03-debug-session.md)

---

## 路径 C: 扩展生态 ⏱️ 半天 ⭐⭐

**适合**: 想要开发插件或集成的开发者

### Step 1: 插件基础 (30 min)
1. 📖 **[packages/plugin](./packages/plugin/README.md)** ⏱️ 20min - 插件接口定义
2. 📖 **[插件加载流程](./flow/plugin_loading.md)** ⏱️ 10min

### Step 2: 实战案例 (60 min)
1. 📖 **[packages/slack](./packages/slack/README.md)** ⏱️ 30min - Slack Bot 实现
2. 📖 **[GitHub Action](./integrations/github-action.md)** ⏱️ 30min - CI/CD 集成

### Step 3: 核心扩展点 (30 min)
1. 📖 **[技能系统 (SKILL.md)](./internals/skill.md)** ⏱️ 15min
2. 📖 **[分享功能](./internals/share.md)** ⏱️ 15min

### Step 4: 开发你的插件 (60 min)

参考 [Cookbook](./cookbook/) 完成第一个插件：

```typescript
// my-plugin.ts
import { z } from "zod"

export default async function plugin({ client, $ }) {
  return {
    tool: {
      "my-tool": {
        description: "我的自定义工具",
        parameters: z.object({ input: z.string() }),
        async execute({ input }) {
          return `处理结果: ${input}`
        }
      }
    }
  }
}
```

### Step 5: 调试和测试 (30 min)

```bash
# 本地测试插件
opencode run --plugin ./my-plugin.ts

# 测试工具调用
> 使用 my-tool 处理 "Hello World"
```

---

## 📚 完整文档索引

### 按模块分类

| 类别 | 文档列表 |
| :--- | :--- |
| **入门** | [快速入门](./getting-started.md), [FAQ](./faq.md) |
| **架构** | [系统架构](./architecture/README.md), [Monorepo结构](./architecture/README.md) |
| **Packages** | [opencode](./packages/opencode/README.md), [sdk](./packages/sdk/README.md), [app](./packages/app/README.md), [desktop](./packages/desktop/README.md), [ui](./packages/ui/README.md), [plugin](./packages/plugin/README.md), [console](./packages/console/README.md), [web](./packages/web/README.md), [slack](./packages/slack/README.md), [extensions](./packages/extensions/README.md), [util](./packages/util/README.md), [function](./packages/function/README.md) |
| **Internals** | [agent](./internals/agent.md), [permission](./internals/permission.md), [snapshot](./internals/snapshot.md), [skill](./internals/skill.md), [share](./internals/share.md), [pty](./internals/pty.md), [bus](./internals/bus.md), [config](./internals/config.md), [project](./internals/project.md), [utilities](./internals/utilities.md) |
| **Concepts** | [ACP协议](./concepts/acp.md), [MCP协议](./concepts/mcp.md), [LSP协议](./concepts/lsp.md) |
| **Flows** | [agent生命周期](./flow/agent_lifecycle.md), [状态同步](./flow/state_sync.md), [插件加载](./flow/plugin_loading.md), [工具执行](./flow/tool_execution.md), [权限流程](./flow/permission_flow.md), [快照回滚](./flow/snapshot_rollback.md), [错误处理](./flow/error_handling.md) |
| **Integrations** | [VS Code](./editors/vscode.md), [GitHub Action](./integrations/github-action.md) |
| **Cookbook** | [创建自定义Agent](./cookbook/01-create-custom-agent.md), [集成MCP Server](./cookbook/02-integrate-mcp-server.md), [调试会话](./cookbook/03-debug-session.md) |

### 按优先级排序

| 优先级 | 文档 | 理由 |
| :---: | :--- | :--- |
| ⭐⭐⭐⭐⭐ | [快速入门](./getting-started.md) | **必读第一站** |
| ⭐⭐⭐⭐⭐ | [opencode](./packages/opencode/README.md) | 核心中的核心 |
| ⭐⭐⭐⭐ | [agent](./internals/agent.md), [sdk](./packages/sdk/README.md) | 理解 Agent 和通信 |
| ⭐⭐⭐ | [config](./internals/config.md), [permission](./internals/permission.md) | 配置和安全 |
| ⭐⭐⭐ | [fast-started](./getting-started.md) | 快速上手 |
| ⭐⭐ | [plugin](./packages/plugin/README.md), [skill](./internals/skill.md) | 扩展能力 |
| ⭐ | 其他辅助模块 | 按需阅读 |

---

## 🎯 学习进度追踪

使用以下 Checklist 追踪你的学习进度：

### 路径 A: 快速了解
- [ ] 完成 [快速入门指南](./getting-started.md)
- [ ] 理解系统架构图
- [ ] 阅读 Agent 生命周期
- [ ] 阅读 ACP/MCP/LSP 协议概要
- [ ] 动手体验 OpenCode

### 路径 B: 深入开发
- [ ] Phase 1: 核心理解 ✅
  - [ ] packages/opencode (Module 0-4)
  - [ ] internals/agent
  - [ ] internals/config
  - [ ] internals/permission
  - [ ] packages/sdk
  - [ ] internals/bus
- [ ] Phase 2: 客户端实现 ✅
  - [ ] packages/app
  - [ ] packages/ui
  - [ ] packages/desktop
  - [ ] editors/vscode
  - [ ] concepts/acp
- [ ] Phase 3: 关键机制 ✅
  - [ ] internals/snapshot
  - [ ] internals/skill
  - [ ] internals/pty
  - [ ] internals/share
- [ ] Phase 4: 动手实践 ✅
  - [ ] 克隆源码
  - [ ] 运行项目
  - [ ] 完成一个实战案例

### 路径 C: 扩展生态
- [ ] 完成 packages/plugin
- [ ] 完成插件加载流程
- [ ] 学习 Slack Bot 案例
- [ ] 学习 GitHub Action 案例
- [ ] 开发第一个插件

---

## 🛠️ 实践建议

1. **阅读代码入口**: 从 `packages/opencode/src/index.ts` 开始
2. **运行项目**: `bun dev` 并观察日志输出
3. **设置断点**: 在关键函数处暂停，理解执行流程
4. **记录笔记**: 将理解记录到 `docs/` 目录
5. **动手实验**: 在 `examples/` 创建测试脚本
6. **查看 Cookbook**: 实战案例是最好的老师
7. **遇到问题**: 查阅 [FAQ](./faq.md) 或在社区提问

---

## 📞 获取帮助

- 📖 **文档**: [完整文档索引](./index.md)
- ❓ **常见问题**: [FAQ](./faq.md)
- 🍳 **实战案例**: [Cookbook](./cookbook/)
- 💬 **社区**: [GitHub Discussions](https://github.com/anomalyco/opencode/discussions)

---

**准备好开始了？** 👉 [返回快速入门](./getting-started.md)
