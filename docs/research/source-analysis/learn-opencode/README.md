# OpenCode 学习大全 (Comprehensive Learning Guide)

> 从宏观架构到微观代码的完整学习记录。

## 📁 项目结构

```
learn-opencode/
├── docs/              # 📚 学习笔记与分析文档
├── source/
│   └── opencode/      # 🔗 OpenCode 源码 (Git Submodule)
├── examples/          # 🧪 实验代码
└── README.md          # 本文档
```

## 0. 起步 (Start Here)

### 🚀 快速开始

**首次学习？从这里开始：**

1. 👉 **[快速入门指南](./docs/getting-started.md)** ⏱️ 30分钟
   - 理解 OpenCode 是什么
   - 运行你的第一次对话
   - 掌握核心概念

2. 👉 **[学习路径](./docs/learning_paths.md)** ⏱️ 选择适合你的路径
   - 路径 A: 快速了解 (1-2小时)
   - 路径 B: 深入开发 (1-2天)
   - 路径 C: 扩展生态 (半天)

3. 👉 **[文档索引](./docs/index.md)** 📚 查找所有文档

### 初始化项目

首次克隆本项目后，请运行以下命令初始化源码子模块：

```bash
git submodule update --init --recursive
```

### 更新源码

同步 OpenCode 最新代码：

```bash
git submodule update --remote
```

### 📚 完整文档列表

- **[文档索引](./docs/index.md)** - 所有文档的完整索引
- **[FAQ](./docs/faq.md)** - 常见问题解答
- **[Cookbook](./docs/cookbook/)** - 实战案例集

## 1. 宏观视角 (Macro View)

### 1.1 系统全景图 (System Overview)
*(图解: Desktop 启动 Server，加载 Plugin; Web App 通过 SDK 与 Server 实时同步状态)*

### 1.2 架构与设计
- [Monorepo 结构解析](./docs/architecture/README.md)

## 2. 微观视角 (Micro View)

### 核心包分析 (Core Packages)

| 包名 | 类型 | 描述 | 分析文档 |
| :--- | :--- | :--- | :--- |
| **`packages/opencode`** | **Core** | 核心大脑。Agent 编排、会话管理。 | [👉 Read](docs/packages/opencode/README.md) |
| **`packages/sdk`** | **Bridge** | 通讯神经。HTTP/SSE 协议封装。 | [👉 Read](docs/packages/sdk/README.md) |
| **`packages/console`** | **SaaS** | 管理后台与云服务。SST/SolidStart 架构。 | [👉 Read](docs/packages/console/README.md) |
| **`packages/app`** | **UI** | 前端界面。SolidJS 实现的状态镜像。 | [👉 Read](docs/packages/app/README.md) |
| **`packages/desktop`** | **Native** | 桌面容器。Tauri + Sidecar 模式。 | [👉 Read](docs/packages/desktop/README.md) |
| **`packages/ui`** | **Design** | 组件库与 Pierre 代码渲染引擎。 | [👉 Read](docs/packages/ui/README.md) |
| **`packages/web`** | **Docs** | 官方文档站点 (Astro)。 | [👉 Read](docs/packages/web/README.md) |
| **`packages/plugin`** | **Ext** | 扩展接口。Hooks 定义与赋能。 | [👉 Read](docs/packages/plugin/README.md) |
| **`packages/slack`** | **Bot** | Slack 机器人集成。演示 SDK 的高级用法。 | [👉 Read](docs/packages/slack/README.md) |

### 辅助包分析 (Supporting Packages)

| 包名 | 类型 | 描述 | 分析文档 |
| :--- | :--- | :--- | :--- |
| **`packages/extensions`** | **Editor** | Zed 编辑器插件 (ACP 协议)。 | [👉 Read](docs/packages/extensions/README.md) |
| **`packages/util`** | **Lib** | 通用工具函数库。 | [👉 Read](docs/packages/util/README.md) |
| **`packages/function`** | **Lambda** | Console 云函数定义。 | [👉 Read](docs/packages/function/README.md) |


### 编辑器集成 (Editor Integrations)

| 编辑器 | 协议 | 描述 | 文档 |
| :--- | :--- | :--- | :--- |
| **VS Code** | HTTP | 内置终端 + 文件引用注入。 | [👉 Read](docs/editors/vscode.md) |
| **Zed** | ACP | 原生 Agent 客户端协议。 | [👉 Read](docs/packages/extensions/README.md) |

### CI/CD 集成 (CI/CD Integrations)

| 平台 | 触发方式 | 描述 | 文档 |
| :--- | :--- | :--- | :--- |
| **GitHub Action** | `/opencode` 评论 | Issue/PR 自动响应和代码修改。 | [👉 Read](docs/integrations/github-action.md) |

### opencode 内部深入 (Core Internals)

深入分析 `packages/opencode/src/` 的关键子模块：

| 模块 | 描述 | 文档 |
| :--- | :--- | :--- |
| **Agent** | Agent 定义 - 内置和自定义 Agent 配置。 | [👉 Read](docs/internals/agent.md) |
| **Permission** | 权限系统 - 工具执行前的用户授权。 | [👉 Read](docs/internals/permission.md) |
| **Snapshot** | 快照系统 - Git 变更追踪和回滚。 | [👉 Read](docs/internals/snapshot.md) |
| **Skill** | 技能系统 - SKILL.md 指令模板加载。 | [👉 Read](docs/internals/skill.md) |
| **Share** | 分享功能 - 会话云端同步。 | [👉 Read](docs/internals/share.md) |
| **PTY** | 终端模拟器 - WebSocket 连接管理。 | [👉 Read](docs/internals/pty.md) |
| **Bus** | 事件总线 - 发布/订阅解耦通信。 | [👉 Read](docs/internals/bus.md) |
| **Config** | 配置系统 - 多层级配置加载合并。 | [👉 Read](docs/internals/config.md) |
| **Project** | 项目上下文 - 实例状态隔离。 | [👉 Read](docs/internals/project.md) |
| **Utilities** | 辅助工具 - file、id、env 等基础设施。 | [👉 Read](docs/internals/utilities.md) |

*(完整索引请查看 [internals 目录](./docs/internals/))*

### 关键流程 (Key Workflows)
- [🧠 核心生命周期: 从 Prompt 到 Code](./docs/flow/agent_lifecycle.md)
- [⚡️ 状态同步: 实时更新的魔法](./docs/flow/state_sync.md)
- [🔌 插件加载: 能力扩展机制](./docs/flow/plugin_loading.md)

## 3. 实验场 (Laboratory)

实验代码未复制到本研究镜像中；如需可运行复现脚本和代码片段，请回到原始来源 `/Users/lienli/Documents/GitHub/agent-ref/learn-opencode/examples/`。

## 4. 贡献与模板

模板目录未复制到本研究镜像中；如需写作模板，请回到原始来源 `/Users/lienli/Documents/GitHub/agent-ref/learn-opencode/docs/templates/`。
