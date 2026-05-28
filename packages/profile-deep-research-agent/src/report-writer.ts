import type { EvidenceLedger } from "./evidence-ledger";
import { evidenceByStrength, validateEvidenceLedger } from "./evidence-ledger";

export type ResearchReportInput = {
  title: string;
  conclusion: string;
  projectComparison: string[];
  reusablePatterns: string[];
  avoidPatterns: string[];
  gugaLanding: string[];
  ledger: EvidenceLedger;
};

export type ResearchReportQualityDiagnostic = {
  severity: "warning" | "error";
  code: string;
  message: string;
};

export function renderResearchReport(input: ResearchReportInput): string {
  const grouped = evidenceByStrength(input.ledger);
  return [
    `# ${input.title}`,
    "",
    "## 一句话结论",
    "",
    input.conclusion,
    "",
    "## 项目对比",
    "",
    bulletList(input.projectComparison),
    "",
    "## 可借鉴模式",
    "",
    bulletList(input.reusablePatterns),
    "",
    "## 不建议照搬",
    "",
    bulletList(input.avoidPatterns),
    "",
    "## Guga 落点",
    "",
    bulletList(input.gugaLanding),
    "",
    "## 证据",
    "",
    ...(["Fact", "Inference", "Pending Verification"] as const).flatMap((strength) => [
      `### ${strength}`,
      "",
      bulletList(grouped[strength].map((item) => `${item.claim} — ${item.source}`)),
      ""
    ])
  ].join("\n");
}

export function checkResearchReportInput(input: ResearchReportInput): ResearchReportQualityDiagnostic[] {
  const diagnostics: ResearchReportQualityDiagnostic[] = validateEvidenceLedger(input.ledger).map((message) => ({
    severity: "error",
    code: "INVALID_EVIDENCE_LEDGER",
    message
  }));
  if (input.ledger.items.length === 0) {
    diagnostics.push({
      severity: "error",
      code: "MISSING_EVIDENCE",
      message: "Research report requires at least one evidence item"
    });
  }
  if (input.projectComparison.length === 0) {
    diagnostics.push({
      severity: "warning",
      code: "MISSING_PROJECT_COMPARISON",
      message: "Research report has no project comparison entries"
    });
  }
  return diagnostics;
}

function bulletList(items: string[]): string {
  if (items.length === 0) {
    return "- (none)";
  }
  return items.map((item) => `- ${item}`).join("\n");
}
