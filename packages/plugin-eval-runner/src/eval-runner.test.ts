import { describe, expect, it } from "vitest";
import { AgentEventType, createAgentRuntime, type ToolDefinition } from "@guga-agent/core";
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

  it("asserts expected tool calls and event metadata", async () => {
    await expect(runEvalFixture({
      id: "tool-selection-pass",
      input: "Inspect the local context.",
      runId: "eval-tool-selection-pass",
      runtime: { builtIns: { capabilities: { tools: [inspectContextTool()] } } },
      mockResponses: [
        { type: "tool_calls", toolCalls: [{ id: "inspect-1", name: "inspect_context", input: { topic: "tools" } }] },
        { type: "final", content: "inspected context" }
      ],
      expected: {
        ok: true,
        finalAnswerIncludes: "inspected",
        toolCalls: [
          { toolName: "inspect_context", actionCategory: "inspect", risk: "low" },
          { toolName: "inspect_context", eventType: AgentEventType.ToolResult, resultOk: true }
        ],
        eventMetadata: [
          { eventType: AgentEventType.ToolStarted, toolName: "inspect_context", path: "intent.action.category", equals: "inspect" },
          { eventType: AgentEventType.ToolStarted, toolName: "inspect_context", path: "intent.summary", includes: "Inspect hermetic" }
        ]
      }
    })).resolves.toMatchObject({
      ok: true,
      diagnostics: []
    });
  });

  it("fails fixtures that emit forbidden tool calls", async () => {
    await expect(runEvalFixture({
      id: "tool-selection-forbidden",
      input: "Answer without calling tools.",
      runId: "eval-tool-selection-forbidden",
      runtime: { builtIns: { capabilities: { tools: [inspectContextTool()] } } },
      mockResponses: [
        { type: "tool_calls", toolCalls: [{ id: "inspect-1", name: "inspect_context", input: { topic: "unsafe" } }] },
        { type: "final", content: "called a forbidden tool" }
      ],
      expected: {
        ok: true,
        forbiddenToolCalls: ["inspect_context"]
      }
    })).resolves.toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "EVAL_FORBIDDEN_TOOL_CALL" })]
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

function inspectContextTool(): ToolDefinition {
  return {
    name: "inspect_context",
    description: "Inspect a small hermetic context fixture.",
    inputSchema: {
      type: "object",
      properties: { topic: { type: "string" } }
    },
    effect: "read",
    runtime: {
      action: {
        category: "inspect",
        risk: "low",
        summary: "Inspect hermetic eval context.",
        tags: ["eval", "tool-action"]
      },
      resultBudget: { maxContentChars: 512, strategy: "truncate" },
      eval: {
        categories: ["tool-action"],
        coveredRisks: ["low"],
        selectionTags: ["inspect-context"]
      }
    },
    execute(input) {
      const topic = typeof input === "object" && input !== null && "topic" in input ? String(input.topic) : "unknown";
      return { ok: true, content: `context:${topic}` };
    }
  };
}
