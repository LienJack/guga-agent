import { access, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AgentEventType, createAgentRuntime, createMockProvider, createTestTool } from "@guga-agent/core";
import { describe, expect, it } from "vitest";
import { createMcpPlugin } from "./mcp-plugin";

describe("createMcpPlugin", () => {
  it("registers stdio MCP tools as Guga tool definitions", async () => {
    const serverPath = await writeFixtureServer();
    const runtime = createAgentRuntime({
      plugins: [createMcpPlugin({
        pluginId: "mcp",
        servers: [{ name: "fixture", command: process.execPath, args: [serverPath] }]
      })]
    });
    const events: string[] = [];
    runtime.onEvent((event) => events.push(event.type));
    runtime.registerProvider(createMockProvider([
      { type: "tool_calls", toolCalls: [{ id: "call-1", name: "mcp__fixture__echo", input: { text: "hi" } }] },
      { type: "final", content: "done" }
    ]));

    await expect(runtime.run({ input: "hi", providerId: "mock", runId: "run-mcp" })).resolves.toMatchObject({
      ok: true,
      finalAnswer: "done"
    });
    expect(events).toContain(AgentEventType.ToolResult);
    expect(runtime.listCapabilityDescriptors()).toContainEqual({
      type: "tool",
      name: "mcp__fixture__echo",
      source: "mcp",
      layer: "extension",
      status: "registered",
      namespace: "fixture",
      ownerPluginId: "mcp",
      owner: { kind: "extension", id: "mcp", packageName: "@guga-agent/plugin-mcp" },
      declaredEffects: ["process.spawn", "network.access"],
      permissionRequirements: [{ subject: "mcp.server", actions: ["connect", "call-tool"] }],
      dependencies: [{ kind: "service", name: "fixture", optional: false }],
      lifecycle: { load: "eager", unload: "remove-contributions", reload: "unsupported", shutdownTimeoutMs: 1_000 },
      extension: {
        id: "mcp",
        name: "Guga MCP",
        source: { kind: "first-party", packageName: "@guga-agent/plugin-mcp" },
        owner: { kind: "extension", id: "mcp", packageName: "@guga-agent/plugin-mcp" },
        declaredEffects: ["process.spawn", "network.access"],
        permissionRequirements: [{ subject: "mcp.server", actions: ["connect", "call-tool"] }],
        dependencies: [{ kind: "service", name: "fixture", optional: false }],
        lifecycle: { load: "eager", unload: "remove-contributions", reload: "unsupported", shutdownTimeoutMs: 1_000 }
      }
    });

    await runtime.dispose();

    expect(runtime.listCapabilityDescriptors()).not.toContainEqual(expect.objectContaining({ name: "mcp__fixture__echo" }));
  });

  it("closes connected MCP servers when plugin initialization fails", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "guga-mcp-"));
    const closedMarker = path.join(directory, "closed");
    const serverPath = await writeFixtureServer({ closedMarker });
    const runtime = createAgentRuntime({
      plugins: [createMcpPlugin({
        pluginId: "mcp",
        servers: [{ name: "fixture", command: process.execPath, args: [serverPath] }]
      })]
    });
    runtime.registerProvider(createMockProvider([{ type: "final", content: "never" }]));
    runtime.registerTool(createTestTool({ name: "mcp__fixture__echo", content: "host" }));

    await expect(runtime.run({ input: "hi", providerId: "mock", runId: "run-mcp-init-fails" })).resolves.toMatchObject({
      ok: false,
      error: { code: "CAPABILITY_ALREADY_REGISTERED" }
    });
    await expect(waitForFile(closedMarker)).resolves.toBeUndefined();
  });
});

async function writeFixtureServer(options: { closedMarker?: string } = {}): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "guga-mcp-"));
  const serverPath = path.join(directory, "server.mjs");
  await writeFile(serverPath, `
import { writeFileSync } from "node:fs";
let buffer = Buffer.alloc(0);
${options.closedMarker ? `process.on("SIGTERM", () => {
  writeFileSync(${JSON.stringify(options.closedMarker)}, "closed", "utf8");
  process.exit(0);
});` : ""}
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

async function waitForFile(filePath: string): Promise<void> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    try {
      await access(filePath);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}
