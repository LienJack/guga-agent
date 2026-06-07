import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { Buffer } from "node:buffer";

export type McpClientInfo = {
  name: string;
  version: string;
};

export type McpToolInfo = {
  name: string;
  description?: string;
  inputSchema?: unknown;
  annotations?: McpToolAnnotations;
};

export type McpToolAnnotations = {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
  [key: string]: unknown;
};

export type McpCallToolResult = {
  content?: unknown[];
  isError?: boolean;
  [key: string]: unknown;
};

export type McpStdioClientOptions = {
  name: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  clientInfo?: McpClientInfo;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

type PendingRequest = {
  resolve(value: unknown): void;
  reject(error: Error): void;
};

export class McpStdioClient {
  private readonly options: McpStdioClientOptions;
  private child: ChildProcessWithoutNullStreams | undefined;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();

  constructor(options: McpStdioClientOptions) {
    this.options = options;
  }

  async connect(): Promise<void> {
    if (this.child) {
      return;
    }
    this.child = spawn(this.options.command, this.options.args ?? [], {
      cwd: this.options.cwd,
      env: { ...process.env, ...this.options.env },
      windowsHide: true
    });
    this.child.stdout.on("data", (chunk: Buffer) => this.handleStdout(chunk));
    this.child.on("error", (error) => this.rejectAll(error));
    this.child.on("close", (code) => this.rejectAll(new Error(`MCP server ${this.options.name} exited with code ${code ?? "unknown"}`)));

    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: this.options.clientInfo ?? { name: "guga-agent", version: "0.0.0" }
    });
    this.notify("notifications/initialized", {});
  }

  async listTools(): Promise<McpToolInfo[]> {
    const result = await this.request("tools/list", {});
    if (!isObject(result) || !Array.isArray(result.tools)) {
      return [];
    }
    return result.tools.filter(isObject).map((tool) => ({
      name: String(tool.name),
      ...(typeof tool.description === "string" ? { description: tool.description } : {}),
      ...(tool.inputSchema ? { inputSchema: tool.inputSchema } : {}),
      ...(isObject(tool.annotations) ? { annotations: tool.annotations as McpToolAnnotations } : {})
    }));
  }

  async callTool(name: string, argumentsValue: unknown): Promise<McpCallToolResult> {
    const result = await this.request("tools/call", { name, arguments: argumentsValue });
    return isObject(result) ? result as McpCallToolResult : { content: [{ type: "text", text: JSON.stringify(result) }] };
  }

  close(): void {
    for (const [id, pending] of this.pending) {
      pending.reject(new Error(`MCP request ${id} cancelled by client close`));
    }
    this.pending.clear();
    this.child?.kill("SIGTERM");
    this.child = undefined;
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    const message = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.writeMessage(message);
    });
  }

  private notify(method: string, params: unknown): void {
    this.writeMessage({ jsonrpc: "2.0", method, params });
  }

  private writeMessage(message: unknown): void {
    if (!this.child) {
      throw new Error("MCP server is not connected");
    }
    const body = Buffer.from(JSON.stringify(message), "utf8");
    this.child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
    this.child.stdin.write(body);
  }

  private handleStdout(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const separator = this.findHeaderSeparator();
      if (separator === -1) {
        return;
      }
      const header = this.buffer.subarray(0, separator).toString("utf8");
      const length = contentLength(header);
      if (length === undefined) {
        this.rejectAll(new Error("MCP response is missing Content-Length header"));
        return;
      }
      const bodyStart = separator + (this.buffer[separator] === 13 ? 4 : 2);
      const bodyEnd = bodyStart + length;
      if (this.buffer.length < bodyEnd) {
        return;
      }
      const body = this.buffer.subarray(bodyStart, bodyEnd).toString("utf8");
      this.buffer = this.buffer.subarray(bodyEnd);
      try {
        this.handleMessage(JSON.parse(body) as JsonRpcResponse);
      } catch (error) {
        this.rejectAll(error instanceof Error ? error : new Error("Unable to parse MCP response"));
        return;
      }
    }
  }

  private handleMessage(message: JsonRpcResponse): void {
    if (typeof message.id !== "number") {
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message));
      return;
    }
    pending.resolve(message.result);
  }

  private findHeaderSeparator(): number {
    const crlf = this.buffer.indexOf("\r\n\r\n");
    if (crlf !== -1) {
      return crlf;
    }
    return this.buffer.indexOf("\n\n");
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function contentLength(header: string): number | undefined {
  for (const line of header.split(/\r?\n/)) {
    const [key, value] = line.split(":");
    if (key?.toLowerCase() === "content-length" && value) {
      const parsed = Number.parseInt(value.trim(), 10);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
  }
  return undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
