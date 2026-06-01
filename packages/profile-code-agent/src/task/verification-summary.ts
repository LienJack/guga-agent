import type { ToolResult } from "@guga-agent/core";

export type VerificationOutputSummary = {
  status: "passed" | "failed" | "cancelled";
  exitCode?: number;
  outputSummary: string;
};

const SUMMARY_LIMIT = 2_000;

export function summarizeVerificationToolResult(result: ToolResult): VerificationOutputSummary {
  const exitCode = exitCodeFromMetadata(result.metadata);
  if (result.ok) {
    return {
      status: "passed",
      ...(exitCode !== undefined ? { exitCode } : {}),
      outputSummary: truncateMeaningful(result.content)
    };
  }

  const details = typeof result.error.details === "string" ? result.error.details : JSON.stringify(result.error.details ?? "");
  return {
    status: result.error.code === "SHELL_COMMAND_CANCELLED" ? "cancelled" : "failed",
    ...(exitCode !== undefined ? { exitCode } : {}),
    outputSummary: truncateMeaningful([result.error.message, details].filter(Boolean).join("\n"))
  };
}

function exitCodeFromMetadata(metadata: Record<string, unknown> | undefined): number | undefined {
  return typeof metadata?.exitCode === "number" ? metadata.exitCode : undefined;
}

function truncateMeaningful(output: string): string {
  const normalized = output.trim();
  if (normalized.length <= SUMMARY_LIMIT) {
    return normalized;
  }
  return `${normalized.slice(0, SUMMARY_LIMIT - 30)}\n[truncated verification output]`;
}
