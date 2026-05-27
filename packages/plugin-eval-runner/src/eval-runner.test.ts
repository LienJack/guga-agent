import { describe, expect, it } from "vitest";
import { AgentEventType, createAgentRuntime } from "@guga-agent/core";
import { createEvalRunnerPlugin } from "./plugin-eval-runner";
import { failingMockFixture, passingMockFixture } from "./fixtures";
import { runEvalFixture, runEvalSuite } from "./eval-runner";

describe("plugin-eval-runner", () => {
  it("passes a hermetic mock provider fixture", async () => {
    await expect(runEvalFixture(passingMockFixture)).resolves.toMatchObject({
      fixtureId: "mock-final-answer",
      ok: true,
      runId: "eval-pass",
      finalAnswer: "Guga eval fixture passed.",
      diagnostics: []
    });
  });

  it("returns actionable diagnostics for failing fixtures", async () => {
    const result = await runEvalFixture(failingMockFixture);

    expect(result).toMatchObject({
      fixtureId: "mock-provider-failure",
      ok: false,
      runId: "eval-fail",
      diagnostics: [
        expect.objectContaining({
          code: "EVAL_STATUS_MISMATCH",
          message: expect.stringContaining("expected ok=true")
        }),
        expect.objectContaining({
          code: "PROVIDER_FAILED",
          message: "Fixture intentionally failed"
        })
      ]
    });
  });

  it("runs suites and counts pass/fail outcomes", async () => {
    await expect(runEvalSuite([
      passingMockFixture,
      {
        ...passingMockFixture,
        id: "missing-event",
        expected: {
          ok: true,
          finalAnswerIncludes: "passed",
          eventTypes: [AgentEventType.ToolStarted]
        }
      }
    ])).resolves.toMatchObject({
      ok: false,
      passed: 1,
      failed: 1,
      results: [
        expect.objectContaining({ ok: true }),
        expect.objectContaining({
          ok: false,
          diagnostics: [expect.objectContaining({ code: "EVAL_EVENT_MISSING" })]
        })
      ]
    });
  });

  it("registers an eval operation descriptor", async () => {
    const runtime = createAgentRuntime({
      plugins: [createEvalRunnerPlugin({ pluginId: "eval" })]
    });

    await runtime.run({ input: "missing provider", providerId: "missing", runId: "run-eval-plugin" });

    expect(runtime.listCapabilityDescriptors?.()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "operation",
        name: "eval.run",
        source: "plugin",
        ownerPluginId: "eval",
        trust: expect.objectContaining({ level: "first-party" })
      })
    ]));
  });
});
