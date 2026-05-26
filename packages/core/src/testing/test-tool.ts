import type { ToolDefinition, ToolFailure } from "../contracts/tools";

export type TestToolOptions = {
  name: string;
  content?: string;
  failure?: ToolFailure["error"];
  throws?: Error;
};

export function createTestTool(options: TestToolOptions): ToolDefinition {
  return {
    name: options.name,
    description: `Test tool ${options.name}`,
    inputSchema: { type: "object" },
    effect: "read",
    execute() {
      if (options.throws) {
        throw options.throws;
      }

      if (options.failure) {
        return { ok: false, error: options.failure };
      }

      return { ok: true, content: options.content ?? "" };
    }
  };
}
