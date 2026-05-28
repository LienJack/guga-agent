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

    expect(calls).toEqual([
      "createSession",
      "startRun:hello",
      "sendRunInput:follow_up:next"
    ]);
  });
});
