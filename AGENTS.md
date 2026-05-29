<!-- TRELLIS:START -->
# Trellis 指令

这些指令面向在本项目中工作的 AI 助手。

本项目由 Trellis 管理。你需要的工作知识位于 `.trellis/`：

- `.trellis/workflow.md` — 开发阶段、何时创建任务、技能路由
- `.trellis/spec/` — 按 package 和层级划分的编码规范（在对应层级写代码前先阅读）
- `.trellis/workspace/` — 每位开发者的日志和会话轨迹
- `.trellis/tasks/` — 活跃和归档任务（PRD、研究、jsonl 上下文）

如果你的平台提供 Trellis 命令（例如 `/trellis:finish-work`、`/trellis:continue`），优先使用命令而不是手动步骤。并非所有平台都会暴露每个命令。

如果你使用 Codex 或其他具备 agent 能力的工具，项目级辅助资源可能位于：
- `.agents/skills/` — 可复用的 Trellis 技能
- `.codex/agents/` — 可选的自定义 subagent

由 Trellis 管理。此块之外的编辑会被保留；此块内的编辑可能会被未来的 `trellis update` 覆盖。

<!-- TRELLIS:END -->

## 全局回答语言

除非用户明确要求使用其他语言，否则所有回答都必须使用中文。

## 研究参考规则

当用户提出涉及比较或分析参考 agent 项目的研究问题时，**绝不要从阅读原始源代码开始**。始终遵循下面的 7 层漏斗，从 token 成本最低到最高逐层推进。

### 7 层研究漏斗

```
第 1 层：Context Packs          — 主题摘要卡片（每份 4K-12K tokens）
   ↓ miss
第 2 层：Graphify graph.json    — 概念图，用 graphify query "..." 查询
   ↓ miss
第 3 层：Understand-Anything    — 代码结构图（节点 + 层级 + 导览）
   ↓ miss
第 4 层：source-analysis/       — 设计理念、架构文章
   ↓ miss
第 5 层：repomix token trees    — 文件级地图，用 rg 找候选文件
   ↓ miss
第 6 层：repomix packed context — 源码级确认，只提取命中的文件块
   ↓ miss
第 7 层：Raw agent-ref repos    — 最后手段，只打开特定文件
```

### 各层细节

**L1 — Context Packs** (`docs/research/context-packs/`)

六个预构建主题包，覆盖主要子系统。始终先检查这里：
- `agent-loop.md` — 主循环设计、turn 生命周期、流式输出、重试
- `tool-registry.md` — 工具注册、权限、MCP、技能
- `context-compression.md` — 上下文预算、压缩、会话恢复
- `provider-abstraction.md` — LLM provider 路由、传输适配器、缓存
- `ui-protocol.md` — CLI/TUI/server/ACP/LSP/IM 通道模式
- `multi-agent.md` — subagent 生成、协调、轨迹隔离

每个主题包包含：关键抽象、跨项目对比表、已确认事实、Guga 迁移建议（Adopt/Adapt/Skip 及理由）。

**L2 — Graphify** (`{project}/graphify-out/graph.json`)

通过 AST 提取构建的概念级知识图。用于发现跨文件关系和关键概念：
```bash
cd /Users/lienli/Documents/GitHub/agent-ref/{project}
graphify query "how does tool execution relate to the agent loop?" --budget 1500
graphify path "ToolRegistry" "ToolExecutor"
graphify explain "RateLimiter"
```

多数成熟参考项目都有完整的 Graphify 图。若存在 `graphify-out/GRAPH_REPORT.md`，它会标出 god nodes 和意外关联。`gemini-cli` 已归档 Graphify 图到 `docs/research/graphs/gemini-cli/`；`pi` 目前有 repomix token tree 和聚焦上下文，但还没有检入 Graphify 图。

**L3 — Understand-Anything** (`{project}/.understand-anything/knowledge-graph.json`)

代码结构图，包含节点（文件/函数/类）、边（imports/calls/contains）、架构层级和引导式导览。用于：
- 理解哪些文件属于哪个架构层
- 查找 import/依赖关系
- 跟随架构导览完成 12-15 步 walkthrough

多数成熟参考项目都有完整的 Understand-Anything 图。`pi` 目前有 repomix token tree 和聚焦上下文，但还没有检入 Understand-Anything 图。

**L4 — source-analysis/** (`docs/research/source-analysis/`)

人工撰写的架构分析文档。从 `design-ideas-index.md` 开始查找相关主题文件。这些文档包含自动化工具无法产出的设计理由、取舍分析和跨项目比较。

**L5 — Repomix Token Trees** (`docs/research/repomix/*-token-tree.txt`)

带 token 计数的扁平文件列表。使用 `rg` 搜索文件名或关键词，在不加载源码的情况下定位候选文件：
```bash
rg -n "keyword|Symbol|file-name" docs/research/repomix/*-token-tree.txt
```

**L6 — Repomix Packed Context** (`docs/research/repomix/*-context*.xml`)

打包成 XML 的完整源码，带有 `<file path="...">` 标记。只提取需要的特定文件块，绝不要加载整个文件。

**L7 — Raw agent-ref Repos** (`/Users/lienli/Documents/GitHub/agent-ref/{project}`)

只有当第 1-6 层不足以进行行级验证时，才打开单个源码文件。

### “参考全项目”短语

当用户说 **“参考全项目”** 时，将其解释为 **全部 10 个参考项目**：
`blade-agent-sdk`, `blade-code`, `cc-haha`, `claude-code`, `deepagentsjs`, `deer-flow`, `hermes-agent`, `gemini-cli`, `opencode`, `pi`

这是研究范围短语，不代表日常编码时需要扫描每个参考仓库。

### 输出格式

回答研究问题时，使用以下结构：
```markdown
## 一句话结论
## 项目对比
## 可借鉴模式
## 不建议照搬
## Guga 落点
## 证据
```

标注证据强度：`Fact`（有文件支撑）、`Inference`（跨项目推导）、`Pending Verification`（需要源码确认）。

### 停止标准

满足以下条件时停止继续下钻：
- 2 个以上参考项目对同一设计点提供了清晰证据
- 设计分歧已经解释到足以指导 Guga 决策
- 继续阅读源码只会增加实现细节，不会改变架构判断
