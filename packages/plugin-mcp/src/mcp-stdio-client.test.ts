import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { McpStdioClient } from "./mcp-stdio-client";

describe("McpStdioClient", () => {
  it("connects to a stdio MCP server, lists tools, and calls a tool", async () => {
    const serverPath = await writeFixtureServer();
    const client = new McpStdioClient({
      name: "fixture",
      command: process.execPath,
      args: [serverPath]
    });

    await client.connect();
    await expect(client.listTools()).resolves.toEqual([
      {
        name: "echo",
        description: "Echo text",
        inputSchema: {
          type: "object",
          properties: { text: { type: "string" } }
        }
      }
    ]);
    await expect(client.callTool("echo", { text: "hello" })).resolves.toEqual({
      content: [{ type: "text", text: "echo: hello" }]
    });
    client.close();
  });

  it("rejects pending requests when a server sends malformed JSON-RPC", async () => {
    const serverPath = await writeMalformedServer();
    const client = new McpStdioClient({
      name: "malformed",
      command: process.execPath,
      args: [serverPath]
    });

    await expect(client.connect()).rejects.toThrow();
    client.close();
  });
});

async function writeFixtureServer(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "guga-mcp-"));
  const serverPath = path.join(directory, "server.mjs");
  await writeFile(serverPath, `
let buffer = Buffer.alloc(0);
process.stdin.on("data", chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const separator = buffer.indexOf("\\r\\n\\r\\n");
    if (separator === -1) return;
    const header = buffer.subarray(0, separator).toString("utf8");
    const match = header.match(/Content-Length: (\\d+)/i);
    const length = Number.parseInt(match?.[1] ?? "0", 10);
    const start = separator + 4;
    const end = start + length;
    if (buffer.length < end) return;
    const message = JSON.parse(buffer.subarray(start, end).toString("utf8"));
    buffer = buffer.subarray(end);
    handle(message);
  }
});
function send(id, result) {
  const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id, result }), "utf8");
  process.stdout.write("Content-Length: " + body.length + "\\r\\n\\r\\n");
  process.stdout.write(body);
}
function handle(message) {
  if (message.method === "initialize") {
    send(message.id, { protocolVersion: "2024-11-05", capabilities: {}, serverInfo: { name: "fixture", version: "0.0.0" } });
  } else if (message.method === "tools/list") {
    send(message.id, { tools: [{ name: "echo", description: "Echo text", inputSchema: { type: "object", properties: { text: { type: "string" } } } }] });
  } else if (message.method === "tools/call") {
    send(message.id, { content: [{ type: "text", text: "echo: " + message.params.arguments.text }] });
  }
}
`, "utf8");
  return serverPath;
}

async function writeMalformedServer(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "guga-mcp-"));
  const serverPath = path.join(directory, "server.mjs");
  await writeFile(serverPath, `
process.stdin.once("data", () => {
  const body = Buffer.from("{not-json", "utf8");
  process.stdout.write("Content-Length: " + body.length + "\\r\\n\\r\\n");
  process.stdout.write(body);
});
`, "utf8");
  return serverPath;
}
