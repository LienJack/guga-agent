import { describe, expect, it } from "vitest";
import {
  AgentEventType,
  createAgentRuntime,
  type AgentEvent,
  type ToolCall,
  type ToolCallCorrelation
} from "@guga-agent/core";
import { createAuditSummary } from "./audit-summary";
import { createMetricsSnapshot } from "./metrics-snapshot";
import { createAuditExportPlugin } from "./plugin-audit-export";

const call: ToolCall = {
  id: "call-secret",
  name: "shell",
  input: { command: "echo super-secret-value" }
};

const correlation: ToolCallCorrelation = {
  callId: "call-secret",
  batchId: "batch-1",
  attempt: 1
};

describe("plugin-audit-export", () => {
  it("summarizes run events without copying tool inputs or outputs", () => {
    const events: AgentEvent[] = [
      { type: AgentEventType.RunStarted, runId: "run-1", input: "do sensitive work" },
      {
        type: AgentEventType.ToolStarted,
        runId: "run-1",
        turn: 1,
        call,
        correlation
      },
      {
        type: AgentEventType.ToolFailed,
        runId: "run-1",
        turn: 1,
        call,
        correlation,
        result: {
          ok: false,
          error: {
            code: "TOOL_FAILED",
            message: "command failed"
          },
          metadata: { stdout: "super-secret-value" }
        }
      },
      {
        type: AgentEventType.PermissionRequested,
        runId: "run-1",
        turn: 1,
        request: {
          runId: "run-1",
          turn: 1,
          toolCallId: "call-secret",
          attempt: 1,
          call,
          subject: { toolName: "shell", effect: "execute" },
          profile: "default"
        }
      },
      {
        type: AgentEventType.PermissionResolved,
        runId: "run-1",
        turn: 1,
        request: {
          runId: "run-1",
          turn: 1,
          toolCallId: "call-secret",
          attempt: 1,
          call,
          subject: { toolName: "shell", effect: "execute" },
          profile: "default"
        },
        decision: {
          action: "deny",
          remember: "once",
          source: "host",
          reason: "not allowed"
        }
      },
      {
        type: AgentEventType.UsageRecorded,
        runId: "run-1",
        turn: 1,
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          cost: { status: "unknown", reason: "provider omitted cost" }
        }
      },
      { type: AgentEventType.RunFinished, runId: "run-1", status: "failed", reason: "tool failed" }
    ];

    const summary = createAuditSummary({
      runId: "run-1",
      events,
      startedAt: "2026-05-28T00:00:00.000Z",
      completedAt: "2026-05-28T00:00:01.000Z"
    });

    expect(summary).toMatchObject({
      runId: "run-1",
      toolCalls: { started: 1, completed: 0, failed: 1 },
      permissions: { requested: 1, allowed: 0, denied: 1 },
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        cost: { status: "unknown" }
      },
      failures: [
        expect.objectContaining({ code: "TOOL_FAILED" }),
        expect.objectContaining({ code: "RUN_FAILED" })
      ]
    });
    expect(JSON.stringify(summary)).not.toContain("super-secret-value");
    expect(JSON.stringify(summary)).not.toContain("echo");
  });

  it("aggregates metrics counters across events", () => {
    const snapshot = createMetricsSnapshot({
      updatedAt: "2026-05-28T00:00:00.000Z",
      events: [
        { type: AgentEventType.RunStarted, runId: "run-1", input: "start" },
        { type: AgentEventType.RunFinished, runId: "run-1", status: "completed" },
        { type: AgentEventType.RunFinished, runId: "run-2", status: "failed" },
        { type: AgentEventType.UsageRecorded, runId: "run-1", turn: 1, usage: { totalTokens: 8 } },
        { type: AgentEventType.UsageRecorded, runId: "run-2", turn: 1, usage: { totalTokens: 13 } }
      ]
    });

    expect(snapshot).toEqual({
      updatedAt: "2026-05-28T00:00:00.000Z",
      counters: expect.objectContaining({
        "runs.started": 1,
        "runs.completed": 1,
        "runs.failed": 1,
        "usage.total_tokens": 21
      })
    });
  });

  it("registers audit and metrics operation descriptors", async () => {
    const runtime = createAgentRuntime({
      plugins: [createAuditExportPlugin({ pluginId: "audit" })]
    });

    await runtime.run({ input: "missing provider", providerId: "missing", runId: "run-audit" });

    expect(runtime.listCapabilityDescriptors?.()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "operation",
        name: "audit.summary",
        source: "plugin",
        ownerPluginId: "audit",
        trust: expect.objectContaining({ level: "first-party" })
      }),
      expect.objectContaining({
        type: "operation",
        name: "metrics.snapshot",
        source: "plugin",
        ownerPluginId: "audit"
      })
    ]));
  });
});
