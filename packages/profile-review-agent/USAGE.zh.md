# @guga-agent/profile-review-agent 用法

## 用途

`@guga-agent/profile-review-agent` 提供一方评审/eval profile 辅助函数。它创建评审 profile 元数据，管理发现项账本，并渲染发现项优先的 Markdown 报告。

它不会编辑代码，也不会直接集成 PR 提供方。

## 导入

```ts
import {
  REVIEW_AGENT_PROFILE_ID,
  createReviewAgentProfile,
  createReviewFindingLedger,
  renderReviewReport
} from "@guga-agent/profile-review-agent";
```

## 主要 API

- Profile：`createReviewAgentProfile()`、`createReviewAgentSystemPrompt()` 和 `REVIEW_AGENT_PROFILE_ID`。
- 发现项账本：`createReviewFindingLedger()`、`findingsBySeverity()` 和 `validateReviewFindingLedger()`。
- 报告写入器：`checkReviewReportInput()` 和 `renderReviewReport()`。
- 类型：`ReviewAgentProfile`、`ReviewConfidence`、`ReviewFinding`、`ReviewFindingCategory`、`ReviewFindingLedger`、`ReviewSeverity`、`ReviewReportInput` 和 `ReviewReportQualityDiagnostic`。

## 常见用法

```ts
const ledger = createReviewFindingLedger([
  {
    id: "finding-1",
    severity: "P1",
    category: "correctness",
    confidence: "high",
    title: "Missing failure path",
    body: "The handler does not return an error on invalid input.",
    evidence: ["Invalid input test returns success."],
    recommendation: "Return a structured validation failure."
  }
]);

const report = renderReviewReport({
  title: "Code Review",
  ledger
});
```

## 参数说明

- `createReviewAgentProfile()` 与 `createReviewAgentSystemPrompt()` 不接收参数，返回固定的一方 review/eval profile 元数据和系统提示。
- `createReviewFindingLedger(findings)` 接收 `ReviewFinding[]` 并按 `ReviewSeverity`、位置和 id 排序。每个 `ReviewFinding` 需要 `id`、`title`、`severity`、`confidence`、`category`、`body` 和 `evidence`；`file`、`line` 和 `recommendation` 可选。
- `ReviewSeverity` 只能是 `"P0"`、`"P1"`、`"P2"` 或 `"P3"`；`ReviewConfidence` 只能是 `"high"`、`"medium"` 或 `"low"`；`ReviewFindingCategory` 覆盖 correctness、security、performance、test-gap、maintainability、protocol、permission、context、session 和 profile。
- `validateReviewFindingLedger(ledger)` 检查 finding id 重复、空标题、空正文、缺少证据，以及 `line` 是否为正整数。`findingsBySeverity(ledger)` 按严重级别分组，不修改账本。
- `renderReviewReport(input)` 使用 `ReviewReportInput`。`title` 和 `ledger` 必填；`openQuestions` 与 `summary` 可选，省略时分别渲染为 `None.` 和 `No additional summary.`。
- `checkReviewReportInput(input)` 返回 `ReviewReportQualityDiagnostic[]`。空 finding 列表是 warning；空标题和无效账本项是 error。

## 注意事项

- 报告先呈现可执行的发现项，然后再呈现支持性上下文。
- 发现项应基于文件、行号、命令、追踪或文档化证据。
- 该包是纯辅助/profile 包；宿主决定如何运行评审以及在哪里发布报告。

## 相关包

- `@guga-agent/profile-code-agent` 处理代码执行工作流。
- `@guga-agent/plugin-eval-runner` 和 `@guga-agent/eval-fixtures` 支持 eval 风格的回归检查。
