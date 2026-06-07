import { describe, expect, it } from "vitest";
import { mapCoreMessagesToAiSdk } from "./message-mapper";
import { mapToolsToAiSdk } from "./tool-mapper";
import { AiSdkProviderErrorCategory, mapAiSdkError, mapAiSdkFinishReason, mapAiSdkUsage } from "./usage-error-mapper";
import { projectToolView } from "../tools/tool-projection";

describe("AI SDK mappers", () => {
  it("maps Guga messages to AI SDK-shaped messages", () => {
    const messages = mapCoreMessagesToAiSdk([
      { role: "user", content: "hi" },
      { role: "assistant", toolCalls: [{ id: "call-1", name: "echo", input: { value: "hi" } }] },
      { role: "tool", toolCallId: "call-1", name: "echo", content: "hi", isError: false }
    ]);

    expect(messages).toEqual([
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: "call-1", toolName: "echo", input: { value: "hi" } }]
      },
      {
        role: "tool",
        content: [{ type: "tool-result", toolCallId: "call-1", toolName: "echo", output: { type: "text", value: "hi" } }]
      }
    ]);
  });

  it("maps failed tool observations to AI SDK error-text outputs", () => {
    expect(
      mapCoreMessagesToAiSdk([
        { role: "tool", toolCallId: "call-1", name: "echo", content: "TOOL_FAILED: nope", isError: true }
      ])
    ).toEqual([
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "echo",
            output: { type: "error-text", value: "TOOL_FAILED: nope" }
          }
        ]
      }
    ]);
  });

  it("maps tools without execute functions", () => {
    const tools = mapToolsToAiSdk([
      {
        name: "echo",
        description: "Echo input",
        inputSchema: { type: "object" },
        effect: "read",
        execute() {
          return { ok: true, content: "unused" };
        }
      }
    ]);

    expect(tools.echo?.description).toBe("Echo input");
    expect(tools.echo?.inputSchema).toMatchObject({ jsonSchema: { type: "object" } });
    expect("execute" in tools.echo!).toBe(false);
  });

  it("maps only tools selected by the capability lease projection", () => {
    const visible = {
      name: "visible",
      description: "Visible tool",
      inputSchema: { type: "object" },
      effect: "read" as const,
      execute() {
        return { ok: true as const, content: "unused" };
      }
    };
    const hidden = {
      ...visible,
      name: "hidden",
      runtime: { visibility: "hidden" as const }
    };
    const view = projectToolView({ tools: [visible, hidden], leaseId: "lease-mapper" });
    const mapped = mapToolsToAiSdk(view.visibleTools);

    expect(Object.keys(mapped)).toEqual(["visible"]);
    expect(view.filtered).toContainEqual(expect.objectContaining({ toolName: "hidden", reason: "hidden" }));
  });

  it("maps usage to token counts with explicit unknown cost", () => {
    expect(mapAiSdkUsage({ inputTokens: 2, outputTokens: 3, totalTokens: 5 })).toEqual({
      inputTokens: 2,
      outputTokens: 3,
      totalTokens: 5,
      cost: { status: "unknown", reason: "AI SDK result did not include Guga pricing metadata" }
    });
  });

  it("maps provider errors into normalized categories", () => {
    expect(mapAiSdkError(Object.assign(new Error("rate limit"), { statusCode: 429 }), {
      providerId: "ai-sdk",
      modelId: "model"
    })).toMatchObject({
      category: AiSdkProviderErrorCategory.RateLimit,
      code: "HTTP_429",
      retryable: true
    });
    expect(mapAiSdkError(Object.assign(new Error("bad key"), { statusCode: 401 }), {
      providerId: "ai-sdk",
      modelId: "model"
    })).toMatchObject({ category: AiSdkProviderErrorCategory.Auth });
    expect(mapAiSdkError(new Error("context window exceeded"), {
      providerId: "ai-sdk",
      modelId: "model"
    })).toMatchObject({ category: AiSdkProviderErrorCategory.ContextOverflow });
  });

  it("redacts provider error messages and drops raw causes", () => {
    const mapped = mapAiSdkError(new Error("bad apiKey=sk-test-secret-1234"), {
      providerId: "ai-sdk",
      modelId: "model"
    });

    expect(mapped.message).not.toContain("sk-test-secret-1234");
    expect(mapped.message).toContain("<redacted>");
    expect(mapped.cause).toBeUndefined();
  });

  it("maps finish reasons conservatively", () => {
    expect(mapAiSdkFinishReason("tool_calls")).toBe("tool-calls");
    expect(mapAiSdkFinishReason("stop")).toBe("stop");
    expect(mapAiSdkFinishReason("weird")).toBe("unknown");
  });
});
