import { describe, expect, it } from "vitest";
import { createMcpToolDefinition, mcpToolName, stringifyMcpToolResult } from "./mcp-tool-adapter";
import type { McpStdioClient } from "./mcp-stdio-client";

describe("mcp tool adapter", () => {
  it("normalizes MCP tool names into Guga tool names", () => {
    expect(mcpToolName("local server", "read.file")).toBe("mcp__local_server__read_file");
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
