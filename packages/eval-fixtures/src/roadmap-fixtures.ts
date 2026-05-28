import { AgentEventType, type ProviderResponse } from "@guga-agent/core";
import type { FlywheelEvalFixture } from "./manifest";

function finalResponse(content: string): ProviderResponse {
  return {
    type: "final",
    content,
    usage: {
      inputTokens: 8,
      outputTokens: 12,
      totalTokens: 20
    }
  };
}

export const flywheelEvalFixtures = [
  {
    id: "m6-capability-discovery-summary",
    name: "M6 capability discovery summary",
    module: "M6",
    category: "capability-discovery",
    layer: "tool",
    covers: "Skills and MCP capabilities remain explainable as registered, namespaced capabilities.",
    tags: ["skills", "mcp", "capability-registry"],
    input: "Summarize the enabled skills and MCP capability surface.",
    runId: "eval-m6-capability-discovery",
    mockResponses: [finalResponse("Capability discovery reports skills, MCP tools, namespaces, owners, and diffable plugin changes.")],
    expected: {
      ok: true,
      finalAnswerIncludes: "Capability discovery",
      eventTypes: [AgentEventType.RunFinished]
    }
  },
  {
    id: "m7-host-protocol-event-stream",
    name: "M7/M11 host protocol event stream",
    module: "M7/M11",
    category: "host-protocol",
    layer: "protocol",
    covers: "Host clients can reason about runs through durable typed events instead of private runtime state.",
    tags: ["host", "events", "cli"],
    input: "Explain how a host observes a run.",
    runId: "eval-m7-host-protocol",
    mockResponses: [finalResponse("The host observes sessions, runs, run events, permission requests, artifacts, and terminal run status through the protocol.")],
    expected: {
      ok: true,
      finalAnswerIncludes: "run events",
      eventTypes: [AgentEventType.RunFinished]
    }
  },
  {
    id: "m8-production-ops-health",
    name: "M8 production operations health",
    module: "M8",
    category: "production-ops",
    layer: "provider",
    covers: "Operations fixtures should detect provider health, audit, metrics, and eval regressions without real credentials.",
    tags: ["ops", "health", "audit", "metrics"],
    input: "Report the operational health view.",
    runId: "eval-m8-production-ops",
    mockResponses: [finalResponse("Operations expose provider health, redacted config, audit summaries, metrics snapshots, and eval diagnostics.")],
    expected: {
      ok: true,
      finalAnswerIncludes: "provider health",
      eventTypes: [AgentEventType.RunFinished]
    }
  },
  {
    id: "m9-code-agent-task-boundary",
    name: "M9 code agent task boundary",
    module: "M9",
    category: "code-agent",
    layer: "profile",
    covers: "The code agent remains a profile with repo context, permissions, tools, and tests rather than a forked core runtime.",
    tags: ["code-agent", "profile", "permissions", "tests"],
    input: "Describe the code agent profile boundary.",
    runId: "eval-m9-code-agent",
    mockResponses: [finalResponse("The code agent is a profile that composes filesystem, shell, git, permissions, repo context, and test discovery.")],
    expected: {
      ok: true,
      finalAnswerIncludes: "code agent is a profile",
      eventTypes: [AgentEventType.RunFinished]
    }
  },
  {
    id: "m10-deep-research-evidence-ledger",
    name: "M10 deep research evidence ledger",
    module: "M10",
    category: "deep-research",
    layer: "profile",
    covers: "Deep research output should preserve source order, evidence strength, and report section discipline.",
    tags: ["deep-research", "evidence-ledger", "report"],
    input: "Describe the deep research report contract.",
    runId: "eval-m10-deep-research",
    mockResponses: [finalResponse("Deep research uses a 7-layer source policy, Fact/Inference/Pending Verification evidence, and a stable Guga report structure.")],
    expected: {
      ok: true,
      finalAnswerIncludes: "Fact/Inference/Pending Verification",
      eventTypes: [AgentEventType.RunFinished]
    }
  }
] as const satisfies readonly FlywheelEvalFixture[];
