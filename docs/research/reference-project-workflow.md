# 参考项目省 Token 工作流

这套流程用于回答这类问题：

- “某个参考项目是如何设计 agent loop / tools / context / provider / UI protocol 的？”
- “参考全项目，对比不同项目的实现方式。”
- “我要为 Guga Agent 设计某个子系统，哪些外部架构可以借鉴？”

目标不是把参考仓库反复塞进上下文，而是把已有研究材料、知识图谱和最小源码证据分层使用。

## 核心原则

1. 先问设计问题，再选项目。
   - 不从“全项目扫描”开始，而是先把问题归到子系统：agent loop、tool registry、context、MCP/skills、provider、UI protocol、memory、sandbox、multi-agent。
2. 先用索引和图谱路由，再用源码证明。
   - 默认先读 `source-analysis` 和 token tree；只有结论需要源码级确认时才打开 packed context 或原始仓库。
3. 图谱负责找路，context pack 负责进模型，源码负责举证。
   - Graphify / Understand-Anything / GitNexus 都是导航层，不替代最终判断。
4. 每个结论标记证据强度。
   - `Fact`：有具体文件或分析材料支撑。
   - `Inference`：跨项目比较后对 Guga 的推论。
   - `Pending Verification`：需要后续源码确认。

## 工具分工

| 工具 / 资料 | 最适合做什么 | 不适合做什么 | 省 Token 用法 |
| --- | --- | --- | --- |
| `docs/research/source-analysis` | 设计理念、取舍、主流程、历史分析 | 行级源码确认 | 先用 `design-ideas-index.md` 按主题路由，只读相关章节 |
| `docs/research/repomix/*-token-tree.txt` | 找候选文件、测试、入口、模块边界 | 理解具体代码逻辑 | 用 `rg` 搜关键词和文件名，先不打开 context |
| `docs/research/repomix/*-context*.xml` | 源码级确认、引用关键实现 | 大范围阅读 | 只抽取命中的 `<file path="...">` 文件块 |
| Graphify | 跨文件 / 跨文档概念图、社区聚类、关系发现 | 精确调用链和行级事实 | 对主题子集建图，用 `graphify query "<问题>" --budget 1500` 获取候选节点 |
| Understand-Anything | 单仓库架构地图、文件 / 函数 / 依赖可视化、dashboard 导览 | 多仓库横向比较的最终结论 | 每个参考仓库全量跑一次，之后增量；用 graph 查询定位候选区域 |
| GitNexus | 结构化代码知识图、MCP 查询、调用链 / 依赖 / blast radius | 多模态资料和设计文章分析 | 用于“这个符号影响哪里”“执行流经过哪些文件”这类结构问题 |
| LLM Context Pack | 把已筛选的少量文件和笔记打包成可复用上下文 | 作为初次探索工具 | 每个子系统维护一个小包，目标 4k-12k tokens，而不是整仓库 |
| 原始 `/agent-ref` 仓库 | 最终确认、补充 packed context 缺失文件 | 第一轮浏览 | 只在 packed context 不足时打开具体文件 |

## 默认查询流水线

### 0. 定义问题

每次研究先写一句内部问题框架：

```text
子系统：<agent loop / context / tools / provider / UI protocol / ...>
输出：<对比分析 / Guga 架构方案 / 实现计划 / 决策备忘录>
范围：<参考全项目 / 指定项目 / 可联网找新项目>
```

### 1. 读取来源契约

固定先确认版本锚点：

```bash
sed -n '1,220p' docs/research/intake/source-contract.md
```

如果用户说“参考全项目”，当前集合来自 `.trellis/spec/guides/agent-reference-projects-guide.md`：

- `blade-agent-sdk`
- `blade-code`
- `cc-haha`
- `claude-code`
- `deepagentsjs`
- `deer-flow`
- `hermes-agent`
- `gemini-cli`
- `opencode`
- `pi`

### 2. 按主题路由到少量参考项目

优先使用：

```bash
sed -n '1,260p' docs/research/source-analysis/design-ideas-index.md
```

默认路由：

| 主题 | 主参考 | 对比 / 边界样本 |
| --- | --- | --- |
| Agent loop / ReAct runtime | `claude-code`, `gemini-cli`, `pi`, `blade-agent-sdk`, `blade-code`, `opencode` | `deepagentsjs`, `hermes-agent` |
| Tool registry / execution / permissions | `claude-code`, `gemini-cli`, `pi`, `blade-agent-sdk`, `blade-code`, `opencode` | `hermes-agent` |
| Context / compaction / session recovery | `claude-code`, `gemini-cli`, `pi`, `blade-code`, `opencode`, `deepagentsjs` | `hermes-agent` |
| LLM provider abstraction | `gemini-cli`, `opencode`, `pi`, `claude-code`, `blade-agent-sdk`, `deer-flow` | `hermes-agent` |
| UI / protocol / remote clients | `claude-code`, `gemini-cli`, `pi`, `opencode`, `deer-flow`, `cc-haha`, `blade-code` | `hermes-agent` |
| Core package / reusable SDK layout | `blade-agent-sdk`, `gemini-cli`, `pi`, `deepagentsjs` | `opencode`, `hermes-agent` |
| Multi-agent / delegation | `claude-code`, `deer-flow`, `opencode` | `hermes-agent` |
| Sandbox / execution isolation | `claude-code`, `deer-flow`, `opencode` | `hermes-agent` |

### 3. 先读设计语料，不读源码

只打开 `design-ideas-index.md` 命中的主题文件。产出一份小型研究摘录：

```markdown
## 候选模式

- 项目：
- 设计点：
- 核心抽象：
- 收益：
- 成本：
- 证据入口：
- 对 Guga 的初步判断：
```

这一步通常控制在 2-5 个文件内。

### 4. 用 token tree 定位源码

不要直接打开 packed context。先搜 token tree：

```bash
rg -n "keyword|Symbol|file-name" docs/research/repomix/*-token-tree.txt
```

如果已知路径，再搜 context 文件的路径标记：

```bash
rg -n "<file path=\".*(keyword|Symbol|file-name)" docs/research/repomix/*-context*.xml docs/research/repomix/hermes-agent-focused-context.xml
```

只在命中后抽取对应文件块。

### 5. 必要时调用图谱层

图谱层用于减少“我该看哪个文件”的试错成本。

#### Graphify

使用场景：

- 新增外部项目或文档资料。
- 需要跨代码、README、设计文档找概念关系。
- 想知道某个主题聚成哪些社区。

建议：

```bash
graphify /path/to/repo --no-viz
graphify query "How is tool execution routed back into the agent loop?" --budget 1500
```

如果是大仓库，先对候选子目录或文档集建图，不对整仓库盲跑。

#### Understand-Anything

使用场景：

- 需要单仓库架构地图。
- 需要 dashboard 交互导览。
- 需要从文件、函数、依赖关系上定位候选实现。

建议：

```bash
/understand /Users/lienli/Documents/GitHub/agent-ref/<repo> --language zh
/understand-chat "Where is the tool execution lifecycle implemented?"
```

全量图只跑一次，之后用增量更新。当前已发现 `claude-code` 下存在 `.understand-anything/`。

#### GitNexus

使用场景：

- 需要调用链、依赖链、影响面、跨文件结构关系。
- 需要通过 MCP 给 agent 提供结构化代码查询。
- 新的远程开源项目还没有本地 repomix / understand 图谱。

建议：

- 对远程 GitHub 项目先用 GitNexus 建结构图，得到候选路径。
- 对命中的路径再用 repomix context 或原始文件做源码确认。
- 不把 GitNexus 的摘要直接当设计结论。

### 6. 生成 LLM Context Pack

当某个主题会被反复询问时，沉淀小包，而不是每次重读大仓库。

推荐路径：

```text
docs/research/context-packs/<topic>.md
docs/research/context-packs/<topic>.files.txt
```

`<topic>.md` 内容：

```markdown
# <Topic> Context Pack

## 问题边界

## 参考项目与版本

## 必读分析材料

## 必读源码文件

## 关键抽象

## 已确认事实

## Guga 迁移判断

## 待验证问题
```

`<topic>.files.txt` 内容：

```text
docs/research/source-analysis/...
docs/research/repomix/<repo>-context.1.xml::<file path="...">
/Users/lienli/Documents/GitHub/agent-ref/<repo>/path/to/file
```

如果需要打包源码，用 repomix 的 include / stdin 小范围生成，而不是全仓库：

```bash
npx repomix@latest /Users/lienli/Documents/GitHub/agent-ref/<repo> \
  --include "src/agent/**,src/tools/**,README.md" \
  --output docs/research/context-packs/<topic>-<repo>.xml
```

### 7. 输出对比结论

最终输出使用这个结构：

```markdown
## 问题框架

## 参考发现

## 共同模式

## 分歧选择

## Guga 设计建议

## 迁移边界

## 风险与测试

## 证据索引
```

写结论时避免“项目 A 摘要 + 项目 B 摘要”的堆叠，要按设计问题横向比较：

- 谁把复杂度放在 runtime？
- 谁把复杂度放在 registry？
- 谁依赖框架图执行？
- 谁依赖 transcript / event log？
- 哪些模式适合 Guga 当前阶段？
- 哪些成熟平台能力应该推迟？

## 快速模式

适合普通问答，目标 3-8 分钟：

1. 读 `source-contract.md`。
2. 读 `design-ideas-index.md` 对应主题。
3. 打开 1-3 个主题分析文件。
4. 搜 token tree 找源码路径。
5. 抽取最多 3 个源码块确认。
6. 输出横向对比 + Guga 建议。

## 深度模式

适合架构方案或实现计划，目标 20-60 分钟：

1. 完成快速模式。
2. 对候选项目使用 Graphify / Understand-Anything / GitNexus 查询候选关系。
3. 为主题生成或更新 LLM Context Pack。
4. 抽取关键源码、测试和配置。
5. 输出带证据索引的方案。

## 新增外部项目流程

当允许联网找别的项目时：

1. 先用 GitHub / Web 搜索确认项目活跃度、语言、license、star、最近提交。
2. 轻量 clone 或下载 ZIP。
3. 记录到临时 intake：

```markdown
| 项目 | 来源 | Commit / Tag | 参考价值 | 风险 |
| --- | --- | --- | --- | --- |
```

4. 先跑 token tree 或 GitNexus / Understand-Anything。
5. 只在值得长期保留时，加入 `docs/research/intake/source-contract.md` 和 `docs/research/repomix/`。

## 何时停止下钻

满足任一条件即可停止继续读源码：

- 已找到 2 个以上参考项目对同一设计点的清晰证据。
- 设计分歧已经能解释 Guga 应该采用 / 改造 / 推迟什么。
- 继续读源码只会补充实现细节，不会改变架构判断。
- 当前结论可以明确标为 `Pending Verification`，等待进入实现阶段再确认。

## 回答格式约定

以后回答“其他项目如何设计”时，默认使用：

```markdown
## 一句话结论

## 项目对比

## 可借鉴模式

## 不建议照搬

## Guga 落点

## 证据
```

如果用户要求“参考全项目”，必须说明实际影响结论的项目；没有用到的项目不要硬写。
