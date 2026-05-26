import type { ToolDefinition } from "@guga-agent/core";

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
        inputSchema: tool.inputSchema
      }
    ])
  );
}
