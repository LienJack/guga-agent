# Agent 参考项目指南

> **用途**：定义如何理解和使用本项目的 agent 参考项目语料。

---

## 研究短语约定

在研究、规划、路线图、架构分析或设计对比中，当用户说 **"参考全项目"**、**"参考全项目代码"**、**"按全项目参考"** 或类似表达时，将其理解为：

> 使用 **`/Users/lienli/Documents/GitHub/agent-ref` 下的所有参考项目** 作为对比集合。

这个短语 **不表示** 只参考当前 `guga-agent` 仓库、只参考 `docs/` 目录，或只参考某一个被点名的参考项目。

这是一个 **研究范围短语**，不是自动实现要求。日常编码时不要默认扫描所有参考仓库，除非用户明确要求研究，或当前实现决策确实依赖跨项目对比。

## 快速研究入口

读取原始参考仓库之前，先查看本仓库已经准备好的研究材料：

```bash
docs/research/intake/source-contract.md
docs/research/source-analysis/
docs/research/repomix/
```

优先使用这些文件，因为它们提供：

- 参考项目列表和版本锚点；
- 用于查询设计理念的 source-analysis 索引；
- 用于快速理解代码布局的 token tree 快照；
- 用于定向源码确认的 packed context 文件；
- 已经提取过的架构笔记。

只有当现有研究材料不足，或需要行级源码验证时，才打开 `/Users/lienli/Documents/GitHub/agent-ref/<project>` 下的原始文件。

## 当前全项目参考集合

当前 "全项目" 集合包括：

- `blade-agent-sdk`
- `blade-code`
- `cc-haha`
- `claude-code`
- `deepagentsjs`
- `deer-flow`
- `hermes-agent`
- `opencode`
- `pi`

规范路径是：

```bash
/Users/lienli/Documents/GitHub/agent-ref
```

来源契约是：

```bash
docs/research/intake/source-contract.md
```

## 推荐阅读顺序

用于架构、路线图或实现规划时：

1. 阅读 `docs/research/intake/source-contract.md`。
2. 如果问题涉及设计理念或子系统模式，阅读 `docs/research/source-analysis/design-ideas-index.md`。
3. 阅读相关 `docs/research/repomix/*-token-tree.txt`，理解代码布局。
4. 如果 `docs/agent-*.md` 覆盖了相关主题，阅读对应主题文档。
5. 只有在需要源码级确认时，才阅读相关 `docs/research/repomix/*-context*.xml`。
6. 只有当某个结论需要直接验证时，才读取原始参考仓库文件。

## 架构设计工作流

当用户要求架构设计、路线图或规划，并说 "参考全项目" 时，使用这套流程。

1. 用一句话定义设计问题。
   - 明确要设计的子系统：agent loop、context、tool registry、MCP/skills、provider、UI protocol、memory、sandbox 或 multi-agent。
   - 明确期望输出：对比分析、架构方案、实现计划或决策备忘录。
2. 阅读 `docs/research/intake/source-contract.md`。
   - 确认当前参考项目集合和 commit 锚点。
   - 将这些锚点作为所有源码级判断的证据基线。
3. 通过 `docs/research/source-analysis/design-ideas-index.md` 路由。
   - 只打开与设计问题匹配的主题文件。
   - 先提取概念、取舍、边界和反模式，再进入原始源码。
   - 记录哪些想法是分析语料中的事实，哪些是对 Guga Agent 的推论。
4. 检查 Guga 现有设计文档。
   - 搜索 `docs/agent-*.md`、`docs/roadmap.md` 和当前计划中同一子系统的内容。
   - 优先延展已有阶段模型，避免为同一主题发明第二套分类。
5. 使用 repomix token tree 选择源码文件。
   - 从下方主题路由开始，选择候选参考项目。
   - 搜索 `docs/research/repomix/*-token-tree.txt`，定位可能相关的文件和测试。
   - 优先选择带有子系统名称、集成测试和流程测试的文件，而不是宽泛的包入口。
6. 使用 repomix context 文件做源码级确认。
   - 在 `docs/research/repomix/*-context*.xml` 或 `docs/research/repomix/hermes-agent-focused-context.xml` 中搜索选定文件路径、符号和相邻测试。
   - 只抽取验证设计判断所需的相关文件块或片段。
   - 如果 packed context 缺少所需文件或噪声过高，再打开 `/Users/lienli/Documents/GitHub/agent-ref/<project>` 下的原始仓库。
7. 综合成 Guga 专属架构。
   - 先写 "参考发现"：按项目列出有文件证据的观察。
   - 再写 "设计决策"：Guga 应该采用、改造、拒绝或推迟什么。
   - 包含边界、数据流、模块归属、分阶段推进、风险和测试。
   - 不要照搬参考仓库的目录形态；提取最适合 Guga 当前成熟度的最小边界模式。

### 设计分析方法

设计分析部分使用 `arch-insight` 的分析方法。目标不是总结每个参考仓库，而是提取设计理念、核心抽象、主流程、设计取舍和可借鉴模式。

用户用中文提问时，除非用户另有要求，输出使用简体中文。

默认交付形态：

- 基于参考项目做架构设计时，默认使用 `Article - Deep Dive` 风格：有叙事，但必须有证据，重点是设计启发和迁移评估。
- 只有当用户要求沉淀主报告和附录时，才使用 `Analysis Package`。
- 只有当用户要求源码地图、仓库导览或 onboarding 指南时，才使用 `Article - Repo Overview`。

写架构方案之前，在研究笔记中完成这些 `arch-insight` 阶段：

1. Intake。
   - 记录研究对象、子系统范围、来源项目、commit 锚点、访问约束和暂缓范围。
   - 按当前设计问题，将每个参考项目分类为主参考、对比参考或边界样本。
   - 判断必读、略读和暂缓区域。不要把每个文件或每个仓库都当成同等重要。
2. 设计理念 brain dump。
   - 先找主流程，再看目录树。
   - 找到第一个真正发生控制权交接的位置：router、dispatcher、scheduler、registry、orchestrator 或 loop。
   - 找到核心规则所在位置：policy layer、type system、orchestration layer、registry、prompt builder、permission runtime 或 state model。
   - 区分骨架模块、适配层、工具层和噪声。
3. 核心抽象分析。
   - 提取 3 到 7 个值得记住的抽象。
   - 对每个重要抽象回答：它拥有什么数据或状态、位于流程哪里、为什么复杂度放在这里、依赖哪些上游/下游契约。
4. 设计取舍与迁移评估。
   - 对每个设计点说明收益、成本、适用场景、不适用场景，以及 Guga 在借鉴前应优先验证什么。
   - 将每个结论标记为 `Fact`、`Inference` 或 `Pending Verification`。

跨多个参考项目综合时，输出对比结论，而不是拼接多个仓库摘要：

- 共同模式：多个项目反复出现的设计选择。
- 分歧选择：不同项目对同一问题的不同解法。
- 适用性：哪种选择适合 Guga 当前成熟度，以及原因。
- 本地借鉴范围：现在采用、稍后改造、拒绝或推迟什么。

### 证据阶梯

做架构判断时，优先使用更强的证据：

1. 当前 Guga 文档或代码。
2. 引用了具体源码行为的 source-analysis 主题文档。
3. 参考仓库的 repomix context 片段。
4. `/Users/lienli/Documents/GitHub/agent-ref` 下的原始文件。
5. 跨项目对比后得到的推论。

第 5 类结论必须明确标记为推论。

### Repomix 搜索模式

打开 packed context 文件之前，先使用 token tree：

```bash
rg -n "keyword|Symbol|file-name" docs/research/repomix/*-token-tree.txt
rg -n "<file path=\".*(keyword|Symbol|file-name)" docs/research/repomix/*-context*.xml docs/research/repomix/hermes-agent-focused-context.xml
```

已知文件路径时，在对应 context 文件中搜索精确的 `<file path="...">` 标记，然后从该标记读到下一个 `<file path=...>` 标记之前。

### 架构输出模板

最终架构方案使用这个结构：

```markdown
## 问题框架

## 参考发现

## Guga 设计

## 建议边界

## 数据 / 控制流

## 分阶段计划

## 风险与测试

## 暂缓事项
```

保持方案可迁移：Guga 文件使用 repo-relative 路径；只有引用 `/Users/lienli/Documents/GitHub/agent-ref/...` 证据时才使用绝对路径。

## 主题路由

- Agent loop / ReAct runtime：先看 `claude-code`、`pi`、`blade-agent-sdk`、`blade-code`、`opencode`，再看 `hermes-agent`。
- Tool registry / execution / permissions：先看 `claude-code`、`pi`、`blade-agent-sdk`、`blade-code`、`opencode`，再看 `hermes-agent`。
- Context / compaction / session recovery：先看 `claude-code`、`pi`、`blade-code`、`opencode`、`deepagentsjs`，再看 `hermes-agent`。
- LLM provider abstraction：先看 `opencode`、`pi`、`claude-code`、`blade-agent-sdk`、`deer-flow`，再看 `hermes-agent`。
- UI / protocol / remote clients：先看 `claude-code`、`pi`、`opencode`、`deer-flow`、`cc-haha`、`blade-code`，再看 `hermes-agent`。
- Core package / reusable SDK layout：先看 `blade-agent-sdk`、`pi` 和 `deepagentsjs`；后续平台形态参考 `opencode` 和 `hermes-agent`。

## 输出要求

研究输出中使用 "参考全项目" 时：

- 说明哪些参考项目影响了决策。
- 做架构判断时区分事实和推论。
- 本仓库文件优先使用 repo-relative 路径。
- 只有引用 `/Users/lienli/Documents/GitHub/agent-ref` 中的文件时才使用绝对路径。
- 不要整体复制某个参考项目的结构；要提取边界模式，并解释为什么适合 Guga Agent。
- 如果最终输出是实现计划，先总结相关参考发现，再给出 Guga 专属布局或方案。

## 常见错误

- 把 "全项目" 理解成只看当前仓库。
- 没有先检查 `docs/research`，就直接跳进原始参考仓库。
- 把 `claude-code` 当成轻量 SDK 参考；它更适合参考官方产品主链路、TUI/CLI 交互、权限、MCP/skills、context 和多 agent 协同。
- 在 Guga 还没有稳定 core package 前，照搬 `opencode` 成熟 monorepo 形态。
- 把 `hermes-agent` 当成最小实现形态；它更适合作为商业级平台压力样本。
- 把 `cc-haha` 当作 agent core 参考；它主要适合参考 remote/client protocol 行为。
