import type {
  ToolAvailability,
  ToolAvailabilityContext,
  ToolCapabilityLease,
  ToolProjection,
  ToolView,
  ToolVisibilityDecision
} from "../contracts/tool-runtime";
import type { ToolDefinition } from "../contracts/tools";

export type ProjectToolViewOptions = {
  tools: readonly ToolDefinition[];
  context?: ToolAvailabilityContext;
  runId?: string;
  turn?: number;
  leaseId?: string;
  issuedAt?: string;
  idFactory?: () => string;
};

export type RuntimeToolView = ToolView & {
  visibleTools: readonly ToolDefinition[];
  decisions: readonly ToolVisibilityDecision[];
};

export function projectToolView(options: ProjectToolViewOptions): RuntimeToolView {
  const context = options.context ?? {};
  const decisions = options.tools.map((tool) => toolVisibilityDecision(tool, context));
  const visibleTools = options.tools.filter((tool) => decisionsByToolName(decisions).get(tool.name)?.visible);
  const lease = toolCapabilityLeaseFor({
    decisions,
    visibleToolNames: visibleTools.map((tool) => tool.name),
    ...leaseIdentity(options)
  });
  const projections = visibleTools.map((tool) => toolProjectionFor(tool, requiredDecision(decisions, tool.name), lease));

  return {
    lease,
    tools: projections,
    visibleTools,
    decisions,
    filtered: decisions.filter((decision) => !decision.visible)
  };
}

export function toolVisibilityDecision(
  tool: ToolDefinition,
  context: ToolAvailabilityContext = {}
): ToolVisibilityDecision {
  if (tool.runtime?.visibility === "hidden" || tool.runtime?.visibility === "runtime-only") {
    return { visible: false, toolName: tool.name, reason: "hidden", metadata: { visibility: tool.runtime.visibility } };
  }

  const availability = availabilityFor(tool, context);
  if (availability.status !== "available") {
    return {
      visible: false,
      toolName: tool.name,
      reason: visibilityReasonFor(availability),
      metadata: { availability }
    };
  }

  const profileAction = context.profile ? tool.runtime?.permission?.profileActions?.[context.profile] : undefined;
  if (profileAction === "deny" || tool.runtime?.permission?.defaultAction === "deny") {
    return {
      visible: false,
      toolName: tool.name,
      reason: "policy-denied",
      metadata: { permission: tool.runtime?.permission }
    };
  }

  if ((context.profile === "headless" || context.profile === "background") && permissionDefaultAction(tool) === "ask") {
    return {
      visible: false,
      toolName: tool.name,
      reason: "policy-denied",
      metadata: { permission: tool.runtime?.permission, profile: context.profile }
    };
  }

  return { visible: true, toolName: tool.name, reason: "available" };
}

function toolProjectionFor(
  tool: ToolDefinition,
  visibility: ToolVisibilityDecision,
  lease: ToolCapabilityLease
): ToolProjection {
  return {
    toolName: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    effect: tool.effect,
    visibility,
    ...(tool.runtime?.action ? { action: tool.runtime.action } : {}),
    ...(tool.runtime?.source ? { source: tool.runtime.source } : {}),
    lease
  };
}

function toolCapabilityLeaseFor(input: {
  leaseId: string;
  runId?: string;
  turn?: number;
  issuedAt?: string;
  visibleToolNames: readonly string[];
  decisions: readonly ToolVisibilityDecision[];
}): ToolCapabilityLease {
  return {
    leaseId: input.leaseId,
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.turn !== undefined ? { turn: input.turn } : {}),
    ...(input.issuedAt ? { issuedAt: input.issuedAt } : {}),
    visibleToolNames: input.visibleToolNames,
    decisions: input.decisions
  };
}

function leaseIdentity(options: ProjectToolViewOptions): {
  leaseId: string;
  runId?: string;
  turn?: number;
  issuedAt?: string;
} {
  const leaseId = options.leaseId ?? `tool-lease-${options.idFactory?.() ?? crypto.randomUUID()}`;
  return {
    leaseId,
    ...(options.runId ? { runId: options.runId } : {}),
    ...(options.turn !== undefined ? { turn: options.turn } : {}),
    ...(options.issuedAt ? { issuedAt: options.issuedAt } : {})
  };
}

function requiredDecision(
  decisions: readonly ToolVisibilityDecision[],
  toolName: string
): ToolVisibilityDecision {
  const decision = decisionsByToolName(decisions).get(toolName);
  if (!decision) {
    throw new Error(`Tool projection decision missing for ${toolName}`);
  }
  return decision;
}

function decisionsByToolName(decisions: readonly ToolVisibilityDecision[]): Map<string, ToolVisibilityDecision> {
  return new Map(decisions.map((decision) => [decision.toolName, decision]));
}

function availabilityFor(tool: ToolDefinition, context: ToolAvailabilityContext): ToolAvailability {
  const availability = tool.runtime?.availability;
  if (!availability) {
    return { status: "available" };
  }
  return typeof availability === "function" ? availability(context) : availability;
}

function visibilityReasonFor(availability: ToolAvailability): NonNullable<ToolVisibilityDecision["reason"]> {
  switch (availability.status) {
    case "available":
      return "available";
    case "missing-backend":
      return "missing-backend";
    case "missing-credential":
      return "missing-credential";
    case "missing-sandbox":
      return "missing-sandbox";
    case "denied-by-policy":
      return "policy-denied";
    case "outside-workspace":
      return "outside-workspace";
    case "disabled":
      return "disabled";
  }
}

function permissionDefaultAction(tool: ToolDefinition): "allow" | "ask" | "deny" {
  if (tool.runtime?.permission?.defaultAction) {
    return tool.runtime.permission.defaultAction;
  }
  return tool.effect === "read" ? "allow" : "ask";
}
