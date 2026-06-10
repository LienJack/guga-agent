import { describe, expect, it } from "vitest";
import type { HostClient } from "@guga-agent/host-sdk";
import {
  encodeJsonLine,
  handleStdioCommand,
  hostEventToPiCompatibleEvents,
  parseJsonLine
} from "./index";

describe("host stdio adapter", () => {
  it("parses and encodes JSONL commands", () => {
    expect(parseJsonLine("{\"type\":\"new_session\",\"title\":\"Test\"}")).toEqual({
      type: "new_session",
      title: "Test"
    });
    expect(encodeJsonLine({ ok: true })).toBe("{\"ok\":true}\n");
  });

  it("maps host events to Pi-compatible adapter events", () => {
    expect(hostEventToPiCompatibleEvents({
      type: "interaction.requested",
      seq: 1,
      occurredAt: "2026-05-27T00:00:00.000Z",
      sessionId: "session-1",
      runId: "run-1",
      requestId: "interaction-1",
      request: { kind: "input", title: "Name" }
    })).toEqual([
      {
        type: "extension_ui_request",
        session_id: "session-1",
        run_id: "run-1",
        request_id: "interaction-1",
        request: { kind: "input", title: "Name" }
      }
    ]);
    expect(hostEventToPiCompatibleEvents({
      type: "message.delta",
      seq: 2,
      occurredAt: "2026-05-27T00:00:00.000Z",
      sessionId: "session-1",
      runId: "run-1",
      messageId: "message-1",
      role: "assistant",
      text: "hi"
    })).toEqual([
      expect.objectContaining({ type: "message_update", text: "hi" })
    ]);
    expect(hostEventToPiCompatibleEvents({
      type: "message.reasoning_delta",
      seq: 3,
      occurredAt: "2026-05-27T00:00:00.000Z",
      sessionId: "session-1",
      runId: "run-1",
      messageId: "reasoning-1",
      text: "checking tools"
    })).toEqual([
      expect.objectContaining({
        type: "reasoning_update",
        message_id: "reasoning-1",
        text: "checking tools"
      })
    ]);
    expect(hostEventToPiCompatibleEvents({
      type: "tool.progress",
      seq: 4,
      occurredAt: "2026-05-27T00:00:00.000Z",
      sessionId: "session-1",
      runId: "run-1",
      callId: "call-1",
      name: "shell",
      message: "running",
      progress: 0.5
    })).toEqual([
      expect.objectContaining({ type: "tool_execution_update", progress: 0.5 })
    ]);
    expect(hostEventToPiCompatibleEvents({
      type: "task.phase_changed",
      seq: 5,
      occurredAt: "2026-05-27T00:00:00.000Z",
      sessionId: "session-1",
      runId: "run-1",
      taskId: "task-1",
      from: "executing",
      to: "verifying",
      attempt: 1,
      plan: {
        summary: "ship feature",
        files: [],
        checks: [],
        assumptions: [],
        risks: [],
        ledgerItems: [{
          id: "item-1",
          title: "run tests",
          status: "in-progress",
          evidence: [],
          changedFiles: [],
          verificationAttemptIds: [],
          risks: []
        }]
      }
    })).toEqual([
      expect.objectContaining({
        type: "task_update",
        task_id: "task-1",
        status: "verifying",
        attempt: 1,
        plan: expect.objectContaining({ summary: "ship feature" })
      })
    ]);
    expect(hostEventToPiCompatibleEvents({
      type: "verification.completed",
      seq: 6,
      occurredAt: "2026-05-27T00:00:00.000Z",
      sessionId: "session-1",
      runId: "run-1",
      taskId: "task-1",
      attempt: {
        id: "verify-1",
        taskId: "task-1",
        sessionId: "session-1",
        runId: "run-1",
        command: "pnpm test",
        cwd: "/repo",
        required: true,
        status: "passed",
        reason: "focused"
      }
    })).toEqual([
      expect.objectContaining({
        type: "verification_update",
        task_id: "task-1",
        status: "passed",
        attempt: expect.objectContaining({ command: "pnpm test" })
      })
    ]);
    expect(hostEventToPiCompatibleEvents({
      type: "context.compacted",
      seq: 7,
      occurredAt: "2026-05-27T00:00:00.000Z",
      sessionId: "session-1",
      runId: "run-1",
      boundaryId: "compact-1",
      trigger: "auto",
      summary: { objective: "ship feature", nextSteps: ["continue"] }
    })).toEqual([
      expect.objectContaining({
        type: "compaction_end",
        boundary_id: "compact-1",
        summary: expect.objectContaining({ objective: "ship feature" })
      })
    ]);
  });

  it("handles core JSONL commands through an injected host client", async () => {
    const calls: string[] = [];
    const client = {
      createSession: async () => {
        calls.push("createSession");
        return { id: "session-1" };
      },
      startRun: async (_sessionId: string, request: { input: string }) => {
        calls.push(`startRun:${request.input}`);
        return { id: "run-1" };
      },
      sendRunInput: async (_runId: string, request: { mode: string; text: string }) => {
        calls.push(`sendRunInput:${request.mode}:${request.text}`);
        return { id: "run-1" };
      },
      abortRun: async () => {
        calls.push("abortRun");
        return { id: "run-1", status: "cancelled" };
      },
      getRun: async () => ({ id: "run-1" }),
      getSession: async () => ({ id: "session-1" }),
      resumeSession: async () => ({ id: "session-1", activeBranchId: "main" }),
      forkSession: async () => ({ id: "session-1", activeBranchId: "branch-1" }),
      respondInteraction: async (requestId: string, response: unknown) => {
        calls.push(`respondInteraction:${requestId}:${String(response)}`);
        return { id: requestId, response };
      },
      listRunEvents: async () => [
        { type: "message.delta", text: "hello " },
        { type: "message.delta", text: "world" }
      ]
    } as unknown as HostClient;

    await expect(handleStdioCommand(client, { type: "new_session" })).resolves.toMatchObject({ ok: true });
    await expect(handleStdioCommand(client, {
      type: "prompt",
      sessionId: "session-1",
      input: "hello"
    })).resolves.toMatchObject({ ok: true });
    await expect(handleStdioCommand(client, {
      type: "follow_up",
      runId: "run-1",
      text: "next"
    })).resolves.toMatchObject({ ok: true });
    await expect(handleStdioCommand(client, {
      type: "get_last_assistant_text",
      runId: "run-1"
    })).resolves.toEqual({ ok: true, data: { text: "hello world" } });
    await expect(handleStdioCommand(client, {
      type: "get_messages",
      runId: "run-1"
    })).resolves.toEqual({
      ok: true,
      data: {
        events: [
          { type: "message.delta", text: "hello " },
          { type: "message.delta", text: "world" }
        ]
      }
    });
    await expect(handleStdioCommand(client, {
      type: "extension_ui_response",
      request_id: "interaction-1",
      response: true
    })).resolves.toMatchObject({ ok: true });
    await expect(handleStdioCommand(client, {
      type: "compact",
      sessionId: "session-1",
      runId: "run-1"
    })).resolves.toEqual({
      ok: false,
      error: {
        code: "UNSUPPORTED_COMMAND",
        message: "compact is reserved for the host protocol but is not implemented by this adapter yet"
      }
    });

    expect(calls).toEqual([
      "createSession",
      "startRun:hello",
      "sendRunInput:follow_up:next",
      "respondInteraction:interaction-1:true"
    ]);
  });
});
