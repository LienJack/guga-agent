import type { OperationalStatusResource, SessionResource, SessionTreeResource } from "@guga-agent/host-protocol";
import type { HostClient } from "@guga-agent/host-sdk";

export type WorkbenchSessionSummary = {
  session: SessionResource;
  tree?: SessionTreeResource;
};

export async function createWorkbenchSession(
  client: HostClient,
  options: { title?: string; profileId?: string; modelId?: string } = {}
): Promise<WorkbenchSessionSummary> {
  const session = await client.createSession({
    ...(options.title ? { title: options.title } : {})
  });
  return { session };
}

export async function resumeWorkbenchSession(
  client: HostClient,
  sessionId: string,
  options: { branchId?: string } = {}
): Promise<WorkbenchSessionSummary> {
  const session = await client.resumeSession(sessionId, options);
  const tree = await client.getSessionTree(session.id);
  return { session, tree };
}

export async function forkWorkbenchSession(
  client: HostClient,
  sessionId: string,
  options: { parentBranchId?: string; createdFromRunId?: string; summary?: string } = {}
): Promise<WorkbenchSessionSummary> {
  const session = await client.forkSession(sessionId, options);
  const tree = await client.getSessionTree(session.id);
  return { session, tree };
}

export function summarizeOperationalStatus(status: OperationalStatusResource): string {
  const operationCount = status.capabilities.filter((capability) => capability.type === "operation").length;
  const toolCount = status.capabilities.filter((capability) => capability.type === "tool").length;
  const providerCount = status.health.length;
  const runCount = status.audit.length;
  const totalTokens = status.metrics.counters["usage.total_tokens"] ?? 0;
  return `providers=${providerCount} tools=${toolCount} operations=${operationCount} runs=${runCount} tokens=${totalTokens}`;
}
