import type { ToolDefinition } from "@guga-agent/core";
import { jsonSchema } from "ai";

export type AiSdkToolSpec = {
  description: string;
  inputSchema: unknown;
};

export function mapToolsToAiSdk(tools: readonly ToolDefinition[]): Record<string, AiSdkToolSpec> {
  return Object.fromEntries(
    tools.map((tool) => [
      tool.name,
      {
        description: tool.description,
        inputSchema: jsonSchema(tool.inputSchema as never)
      }
    ])
  );
}
