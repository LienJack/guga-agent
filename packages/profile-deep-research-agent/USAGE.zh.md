# @guga-agent/profile-deep-research-agent 用法

## 用途

`@guga-agent/profile-deep-research-agent` 提供一方深度研究 profile 辅助函数。它聚焦于来源策略、证据账本和结构化报告生成。

在构建需要区分事实、推论和仍需验证声明的研究工作流时使用它。

## 导入

```ts
import {
  DEEP_RESEARCH_PROFILE_ID,
  createDeepResearchProfile,
  createEvidenceLedger,
  renderResearchReport,
  sortSourcesByPolicy
} from "@guga-agent/profile-deep-research-agent";
```

## 主要 API

- Profile：`createDeepResearchProfile()`、`createDeepResearchSystemPrompt()` 和 `DEEP_RESEARCH_PROFILE_ID`。
- 来源策略：`classifyResearchSource()`、`defaultResearchSourcePolicy` 和 `sortSourcesByPolicy()`。
- 证据账本：`createEvidenceLedger()`、`evidenceByStrength()` 和 `validateEvidenceLedger()`。
- 报告写入器：`checkResearchReportInput()` 和 `renderResearchReport()`。
- 类型：`DeepResearchProfile`、`ResearchSourceLayer`、`ResearchSourcePolicyItem`、`EvidenceItem`、`EvidenceLedger`、`EvidenceStrength`、`ResearchReportInput` 和 `ResearchReportQualityDiagnostic`。

## 常见用法

```ts
const sources = sortSourcesByPolicy([
  "docs/research/context-packs/agent-loop.md",
  "/path/to/raw/source.ts"
]);

const evidence = createEvidenceLedger([
  {
    id: "evidence-1",
    claim: "The design uses a curated research funnel.",
    strength: "Fact",
    source: sources[0],
    summary: "Project instructions define a layered research process.",
    capturedAt: new Date().toISOString(),
    confidence: 1
  }
]);

const report = renderResearchReport({
  title: "Agent Loop Research",
  conclusion: "Use curated evidence before opening raw source.",
  projectComparison: ["Reference projects converge on explicit loop state."],
  reusablePatterns: ["Keep evidence strength visible in reports."],
  avoidPatterns: ["Do not start from raw source when curated context exists."],
  gugaLanding: ["Document decisions with Fact/Inference/Pending Verification labels."],
  ledger: evidence
});
```

## 参数说明

- `createDeepResearchProfile()` 与 `createDeepResearchSystemPrompt()` 不接收参数，返回固定的一方深度研究 profile 元数据和系统提示。
- `sortSourcesByPolicy(paths)` 接收路径字符串数组，按 `defaultResearchSourcePolicy` 的层级排序；`classifyResearchSource(path)` 根据路径命中 `context-pack`、`graph`、`understand-anything`、`source-analysis`、`repomix-token-tree`、`repomix-packed-context` 或 `raw-source`。
- `createEvidenceLedger(items)` 接收 `EvidenceItem[]` 并按 `id` 排序。每个 `EvidenceItem` 需要 `id`、`claim`、`strength`、`source`、`summary`、`capturedAt` 和 `confidence`；`strength` 必须是 `"Fact"`、`"Inference"` 或 `"Pending Verification"`，`confidence` 应在 `0` 到 `1` 之间。
- `validateEvidenceLedger(ledger)` 检查证据 id 重复、`confidence` 范围，以及 `Fact` 是否包含非空 `source`。`evidenceByStrength(ledger)` 按证据强度分组，不改变原账本。
- `renderResearchReport(input)` 使用 `ResearchReportInput`。`title`、`conclusion`、`projectComparison`、`reusablePatterns`、`avoidPatterns`、`gugaLanding` 和 `ledger` 都是必填字段；数组字段可为空，但空数组会渲染为 `- (none)`。
- `checkResearchReportInput(input)` 使用同一个 `ResearchReportInput`，返回 `ResearchReportQualityDiagnostic[]`。空证据账本是 error；缺少 `projectComparison` 是 warning。

## 注意事项

- 此包不会修改代码，也不会自行执行 Web 或文件系统研究。
- 它提供 profile 文本和纯辅助函数，供宿主或代理应用。
- 来源策略旨在优先使用精选材料，然后再使用原始源码。

## 相关包

- `@guga-agent/profile-code-agent` 可以在规划期间消费研究输出。
- `@guga-agent/profile-review-agent` 为另一类工作流提供发现项优先的评审 profile。
