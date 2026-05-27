import { describe, expect, it } from "vitest";
import { ContextBudgeter } from "./context-budgeter";

describe("ContextBudgeter", () => {
  it("emits warning and compact pressure based on usable input budget", () => {
    const budgeter = new ContextBudgeter({ defaultReservedOutputTokens: 10 });
    const budget = budgeter.estimate({
      messages: [{ role: "user", content: "x".repeat(280) }],
      tools: [],
      sources: [],
      modelMetadata: { providerId: "mock", modelId: "tiny", contextWindow: 100 }
    });

    const pressure = budgeter.pressureFor("pressure-1", budget, ["message-0"]);

    expect(budget.usableInputTokens).toBe(90);
    expect(pressure.level).toBe("warning");
  });

  it("allows projection when model metadata is missing", () => {
    const budgeter = new ContextBudgeter();
    const budget = budgeter.estimate({
      messages: [{ role: "user", content: "hello" }],
      tools: [],
      sources: []
    });

    expect(budget.contextWindow).toBeUndefined();
    expect(budget.estimateStatus).toBe("partial");
    expect(budgeter.pressureFor("pressure-unknown", budget, []).level).toBe("none");
  });
});
