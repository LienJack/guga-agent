# M10 Deep Research Agent Requirements

## 一句话目标

把 Guga 的研究流程固化成一个 first-party deep-research profile：先服务本仓库的参考项目调研、证据链管理和报告产出。

## MVP

- 新增 `@guga-agent/profile-deep-research-agent`。
- 定义 research profile metadata 和 system prompt。
- 定义 source policy：本地 context pack / graph / UA / source-analysis / repomix token tree / packed context / raw source 的顺序。
- 定义 evidence ledger：source、summary、strength、path/url、timestamp、confidence。
- 定义 report writer：输出固定结构，区分 Fact / Inference / Pending Verification。
- CLI 支持 `--profile deep-research`，沿用 host/SDK/runtime path。

## 非目标

- 不做泛互联网搜索产品。
- 不自动改代码。
- 不实现真实 subagent 并行。
- 不读取 raw source 作为第一入口。
- 不接外部向量库。

## 用户故事

- 作为研究者，我可以将证据条目交给 ledger，得到可排序、可过滤、可检查的证据集合。
- 作为 Guga 后续模块，我可以用 report writer 生成可直接喂给 brainstorm/plan 的研究报告。
- 作为 CLI 用户，我可以 `guga run --profile deep-research --mock "research context policy"` 启动研究 profile。

## 约束

- Research profile 是 package，不进 core。
- Evidence ledger 是结构化数据，不只是 Markdown。
- Report writer 不允许无来源结论混入 Fact。
- Source policy 默认遵守项目 7-layer funnel。
