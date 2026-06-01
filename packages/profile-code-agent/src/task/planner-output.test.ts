import { describe, expect, it } from "vitest";
import { parsePlannerOutput } from "./planner-output";

describe("planner output parser", () => {
  it("parses a prose-wrapped structured plan block into ledger items", () => {
    const result = parsePlannerOutput(`
Planner notes first.

\`\`\`code_task_plan
{
  "summary": "Implement durable ledger",
  "files": [{ "path": "src/task.ts", "action": "modify", "reason": "add ledger" }],
  "checks": [{ "command": "pnpm test", "required": true, "reason": "unit coverage" }],
  "assumptions": ["existing runtime remains"],
  "risks": ["schema drift"],
  "ledgerItems": [{
    "id": "item-1",
    "title": "Add ledger contract",
    "changedFiles": ["src/task.ts"],
    "risks": ["validation too strict"]
  }]
}
\`\`\`

Trailing explanation.
`);

    expect(result).toMatchObject({
      ok: true,
      plan: {
        summary: "Implement durable ledger",
        ledgerItems: [expect.objectContaining({
          id: "item-1",
          status: "pending",
          evidence: [],
          changedFiles: ["src/task.ts"]
        })]
      }
    });
  });

  it("rejects duplicate ledger item ids", () => {
    const result = parsePlannerOutput(`{
      "summary": "Plan",
      "ledgerItems": [
        { "id": "item-1", "title": "One" },
        { "id": "item-1", "title": "Again" }
      ]
    }`);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "PLANNER_OUTPUT_LEDGER_ID_DUPLICATE" }
    });
  });

  it("rejects summary-only planner output", () => {
    const result = parsePlannerOutput("I will inspect files and run tests.");

    expect(result).toMatchObject({
      ok: false,
      error: { code: "PLANNER_OUTPUT_BLOCK_MISSING" }
    });
  });
});
