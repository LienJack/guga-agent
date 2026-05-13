# Agent 参考项目研究契约

本轮研究使用 `arch-insight` 的 `Article - Deep Dive` 路径，但按用户要求拆成六篇专题文章。输出语言为简体中文，目标读者是希望从 0 到 1 设计 agent 的工程师、TL 与架构师。

## 研究范围

本轮只研究 agent 架构相关主线：

- ReAct / agent loop 的控制流设计
- prompt 工程与系统提示词组织
- context 管理、压缩、裁剪与工作记忆
- tool 注册、schema、权限、执行与结果回流
- LLM provider、streaming、tool call 与错误处理接入
- AG-UI 方向的 agent 与 UI/客户端协议协同

暂不深入发行工程、测试基建、UI 视觉设计、文档站、CI/CD、vendored 依赖与非 agent 主链路。

## 来源与版本锚点

| 项目 | 本地路径 | 分支 | Commit |
| --- | --- | --- | --- |
| blade-agent-sdk | `/Users/lienli/Documents/GitHub/agent-ref/blade-agent-sdk` | `main` | `5d67e5edd4e5e281e9349449d741f8a0dfe1054b` |
| blade-code | `/Users/lienli/Documents/GitHub/agent-ref/blade-code` | `main` | `ad67f3d5e7106b52e5e06b565f4d4f1b374866a7` |
| cc-haha | `/Users/lienli/Documents/GitHub/agent-ref/cc-haha` | `main` | `dbb8c95905adec873177fa4952c5db52fc564b1b` |
| claude-code | `/Users/lienli/Documents/GitHub/agent-ref/claude-code` | `main` | `3d7b32f52e7be44cde8046a9c6461b35291de626` |
| deepagentsjs | `/Users/lienli/Documents/GitHub/agent-ref/deepagentsjs` | `main` | `7c33a8695f2e16217779bef5c6fca28230f18815` |
| deer-flow | `/Users/lienli/Documents/GitHub/agent-ref/deer-flow` | `main` | `84f88b6610e5c6384735e703809bc8b35e33dacb` |
| hermes-agent | `/Users/lienli/Documents/GitHub/agent-ref/hermes-agent` | `main` | `dd0923bb89ed2dd56f82cb63656a1323f6f42e6f` |
| opencode | `/Users/lienli/Documents/GitHub/agent-ref/opencode` | `dev` | `caf1151cb5d574d2aac2ed6ccb20a9121880c18a` |

## Repomix 产物

所有项目已先运行 repomix，再进入源码分析。产物位于 `/Users/lienli/Documents/GitHub/guga-agent/docs/research/repomix/`：

- `blade-agent-sdk-token-tree.txt`
- `blade-agent-sdk-context.1.xml`
- `blade-code-token-tree.txt`
- `blade-code-context.1.xml`
- `cc-haha-token-tree.txt`
- `cc-haha-context.1.xml`
- `claude-code-token-tree.txt`
- `claude-code-focused-context.xml`
- `deepagentsjs-token-tree.txt`
- `deepagentsjs-context.1.xml`
- `deer-flow-token-tree.txt`
- `deer-flow-context.1.xml`
- `hermes-agent-token-tree.txt`
- `hermes-agent-focused-context.xml`
- `opencode-token-tree.txt`
- `opencode-context.1.xml`

## 解释边界

- `claude-code` 是 Claude Code 产品形态源码，适合作为官方产品主链路、TUI/CLI 交互、权限、context、MCP/skills、remote/bridge、多 agent 与工具执行的高价值参考；其仓库包含大量 UI、vendored/native 与产品外壳代码，因此只生成 focused context 包，纳入 agent 主链路、context、tools、permissions、MCP、skills、provider、bridge/server 与关键文档。
- `cc-haha` 更像 Claude Code 产品壳、远端会话、插件与任务桥接层，不是完整独立 agent core；文章中只把它作为客户端协议和外壳协同参考。
- `hermes-agent` 是体量很大的产品态 agent，文章中不把它当作最小实现范本，而作为商业级外层能力参考：自改进 memory/skills、工具集与审批队列、provider profile、context compressor、gateway/API/ACP 多客户端协议。其全量 token tree 约 1220 万 tokens，因此额外生成 focused context 包，只纳入 `run_agent.py`、`agent/`、`tools/`、`providers/`、`gateway/`、`acp_adapter/` 等主链路文件。
- `AG-UI` 在这些仓库中几乎没有直接以该名称出现；本轮将按“agent 与 UI/客户端协议”的方向做映射分析，并明确标注哪些结论属于从事件流、会话协议、远端适配器推导出来的架构启发。
- 多数项目没有使用显式 `Thought / Action / Observation` 文本模板；它们更多把 ReAct 做成 `messages + tool_calls + tool_result + loop exit` 的结构化事件循环。
