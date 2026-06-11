import { describe, expect, it } from "vitest";
import { createMcpToolDefinition, mcpToolName, stringifyMcpToolResult } from "./mcp-tool-adapter";
import type { McpStdioClient } from "./mcp-stdio-client";

describe("mcp tool adapter", () => {
  it("normalizes MCP tool names into Guga tool names", () => {
    expect(mcpToolName("local server", "read.file")).toBe("mcp__local_server__read_file");
  });

  it("creates a namespaced Action OS tool with conservative default governance metadata", () => {
    const client = { callTool: async () => ({ content: [{ type: "text", text: "ok" }] }) } as Pick<McpStdioClient, "callTool"> as McpStdioClient;
    const tool = createMcpToolDefinition({
      serverName: "local server",
      tool: { name: "danger", inputSchema: { type: "object" } },
      client
    });

    expect(tool).toMatchObject({
      name: "mcp__local_server__danger",
      effect: "external",
      runtime: {
        permission: {
          defaultAction: "ask",
          profileActions: { headless: "deny", background: "deny" },
          scope: "resource"
        },
        action: {
          category: "external",
          risk: "high",
          effects: [expect.objectContaining({
            kind: "network",
            access: "execute",
            target: "mcp:local server/danger",
            external: true,
            metadata: expect.objectContaining({ openWorld: true })
          })],
          tags: expect.arrayContaining(["mcp", "open-world"])
        },
        backend: { kind: "custom", description: "MCP server local server" },
        resultBudget: { maxContentChars: 12_000, strategy: "reference" },
        source: {
          kind: "mcp",
          namespace: "local_server",
          upstreamId: "local server/danger",
          trust: expect.objectContaining({ level: "untrusted" })
        },
        eval: expect.objectContaining({
          categories: ["tool-action", "mcp"],
          coveredRisks: ["high"]
        })
      }
    });
  });

  it("lets host policy override MCP effect and risk when better server metadata is available", () => {
    const client = { callTool: async () => ({ content: [{ type: "text", text: "ok" }] }) } as Pick<McpStdioClient, "callTool"> as McpStdioClient;
    const tool = createMcpToolDefinition({
      serverName: "docs",
      tool: {
        name: "lookup",
        inputSchema: { type: "object" },
        annotations: { readOnlyHint: true, openWorldHint: false }
      },
      client,
      policy: ({ defaultPolicy }) => ({
        effect: "read",
        action: {
          ...defaultPolicy.action!,
          category: "search",
          risk: "low",
          tags: ["mcp", "docs", "read-only"]
        }
      })
    });

    expect(tool.effect).toBe("read");
    expect(tool.runtime?.action).toMatchObject({
      category: "search",
      risk: "low",
      tags: ["mcp", "docs", "read-only"]
    });
    expect(tool.runtime?.permission?.defaultAction).toBe("ask");
    expect(tool.runtime?.source?.upstreamId).toBe("docs/lookup");
  });

  it("converts MCP tool errors into normal tool failures", async () => {
    const client = {
      callTool() {
        return Promise.resolve({
          isError: true,
          content: [{ type: "text", text: "denied by server" }]
        });
      }
    } as Pick<McpStdioClient, "callTool"> as McpStdioClient;
    const tool = createMcpToolDefinition({
      serverName: "fixture",
      tool: { name: "danger", inputSchema: { type: "object" } },
      client
    });

    await expect(Promise.resolve(tool.execute({}, {
      call: { id: "call-1", name: tool.name, input: {} }
    }))).resolves.toEqual({
      ok: false,
      error: {
        code: "MCP_TOOL_ERROR",
        message: "denied by server"
      },
      metadata: {
        serverName: "fixture",
        toolName: "danger",
        evidence: {
          source: "mcp",
          rawSource: "mcp:fixture/danger",
          verifier: { status: "unverified" },
          redaction: { state: "none" }
        }
      }
    });
  });

  it("stringifies non-text MCP result content deterministically", () => {
    expect(stringifyMcpToolResult({
      content: [
        { type: "text", text: "hello" },
        { type: "image", data: "abc" }
      ]
    })).toBe("hello\n{\"type\":\"image\",\"data\":\"abc\"}");
  });
});
