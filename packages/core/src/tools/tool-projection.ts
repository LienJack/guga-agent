import type {
  ToolAvailability,
  ToolAvailabilityContext,
  ToolCapabilityLease,
  ToolCredentialBinding,
  ToolEnvironmentRequirement,
  ToolProjection,
  ToolSandboxRequirement,
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

export function toolEnvironmentRequirementFor(tool: ToolDefinition): ToolEnvironmentRequirement | undefined {
  if (tool.runtime?.environment) {
    return tool.runtime.environment;
  }

  const backendKinds = tool.runtime?.backend ? [tool.runtime.backend.kind] : undefined;
  const requirement = {
    ...(tool.runtime?.credentials ? { credentials: tool.runtime.credentials } : {}),
    ...(tool.runtime?.sandbox ? { sandbox: tool.runtime.sandbox } : {}),
    ...(backendKinds ? { backendKinds } : {})
  };
  return Object.keys(requirement).length > 0 ? requirement : undefined;
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
  const declared = typeof availability === "function" ? availability(context) : availability;
  if (declared && declared.status !== "available") {
    return declared;
  }
  return environmentAvailabilityFor(tool, context);
}

function environmentAvailabilityFor(tool: ToolDefinition, context: ToolAvailabilityContext): ToolAvailability {
  const requirement = toolEnvironmentRequirementFor(tool);
  if (!requirement) {
    return { status: "available" };
  }

  if (context.environment && context.environment.status !== "satisfied") {
    return {
      status: context.environment.status,
      reason: context.environment.reason ?? `Runtime environment does not satisfy requirements for ${tool.name}`,
      metadata: { environment: safeEnvironmentMetadata(context.environment), requirement: safeRequirementMetadata(requirement) }
    };
  }

  const missingCredential = missingCredentialFor(requirement.credentials, context.environment?.credentials ?? context.credentials);
  if (missingCredential) {
    return {
      status: "missing-credential",
      reason: `Required credential unavailable: ${missingCredential.credentialRef}`,
      metadata: {
        requirement: safeRequirementMetadata(requirement),
        requiredCredential: safeCredentialMetadata(missingCredential)
      }
    };
  }

  const sandbox = requirement.sandbox;
  if (sandbox && !sandboxSatisfied(sandbox, context.environment?.sandbox ?? context.sandbox)) {
    return {
      status: "missing-sandbox",
      reason: `Required sandbox unavailable for ${tool.name}`,
      metadata: {
        requirement: safeRequirementMetadata(requirement),
        requiredSandbox: sandbox
      }
    };
  }

  const requiredBackends = requirement.backendKinds ?? [];
  const availableBackends = context.environment?.backendKinds ?? context.backendKinds;
  if (requiredBackends.length > 0 && availableBackends && !requiredBackends.every((kind) => availableBackends.includes(kind))) {
    return {
      status: "missing-backend",
      reason: `Required backend unavailable for ${tool.name}`,
      metadata: {
        requiredBackends,
        availableBackends
      }
    };
  }

  return { status: "available" };
}

function missingCredentialFor(
  required: readonly ToolCredentialBinding[] | undefined,
  available: readonly ToolCredentialBinding[] | undefined
): ToolCredentialBinding | undefined {
  for (const credential of required ?? []) {
    if (credential.required === false) {
      continue;
    }
    if (!available?.some((candidate) => candidate.credentialRef === credential.credentialRef)) {
      return credential;
    }
  }
  return undefined;
}

function sandboxSatisfied(
  required: ToolSandboxRequirement,
  available: ToolSandboxRequirement | undefined
): boolean {
  if (required.isolation === "none" && !required.network && !required.backendKinds?.length) {
    return true;
  }
  if (!available) {
    return false;
  }
  return isolationSatisfies(required.isolation, available.isolation)
    && networkSatisfies(required.network, available.network)
    && backendKindsSatisfy(required.backendKinds, available.backendKinds)
    && workspaceSatisfies(required, available)
    && outputSatisfies(required, available);
}

function isolationSatisfies(required: ToolSandboxRequirement["isolation"], available: ToolSandboxRequirement["isolation"]): boolean {
  const rank = { none: 0, workspace: 1, process: 2, container: 3, remote: 3 } satisfies Record<ToolSandboxRequirement["isolation"], number>;
  return rank[available] >= rank[required];
}

function networkSatisfies(
  required: ToolSandboxRequirement["network"],
  available: ToolSandboxRequirement["network"]
): boolean {
  if (!required) {
    return true;
  }
  const rank = { none: 3, restricted: 2, workspace: 1, unrestricted: 0 } satisfies Record<NonNullable<ToolSandboxRequirement["network"]>, number>;
  return !!available && rank[available] >= rank[required];
}

function workspaceSatisfies(required: ToolSandboxRequirement, available: ToolSandboxRequirement): boolean {
  if (!required.workspace?.required) {
    return true;
  }
  return available.workspace?.required === true;
}

function backendKindsSatisfy(
  required: readonly string[] | undefined,
  available: readonly string[] | undefined
): boolean {
  if (!required?.length) {
    return true;
  }
  return !!available && required.every((kind) => available.includes(kind));
}

function outputSatisfies(required: ToolSandboxRequirement, available: ToolSandboxRequirement): boolean {
  if (!required.output?.maxBytes) {
    return true;
  }
  return !!available.output?.maxBytes && available.output.maxBytes >= required.output.maxBytes;
}

function safeRequirementMetadata(requirement: ToolEnvironmentRequirement): Record<string, unknown> {
  return {
    ...(requirement.credentials ? { credentials: requirement.credentials.map(safeCredentialMetadata) } : {}),
    ...(requirement.sandbox ? { sandbox: requirement.sandbox } : {}),
    ...(requirement.backendKinds ? { backendKinds: requirement.backendKinds } : {})
  };
}

function safeEnvironmentMetadata(environment: NonNullable<ToolAvailabilityContext["environment"]>): Record<string, unknown> {
  return {
    status: environment.status,
    ...(environment.reason ? { reason: environment.reason } : {}),
    ...(environment.credentials ? { credentials: environment.credentials.map(safeCredentialMetadata) } : {}),
    ...(environment.sandbox ? { sandbox: environment.sandbox } : {}),
    ...(environment.backendKinds ? { backendKinds: environment.backendKinds } : {})
  };
}

function safeCredentialMetadata(credential: ToolCredentialBinding): Record<string, unknown> {
  return {
    credentialRef: credential.credentialRef,
    ...(credential.providerId ? { providerId: credential.providerId } : {}),
    ...(credential.principal ? {
      principal: {
        kind: credential.principal.kind,
        ...(credential.principal.id ? { id: credential.principal.id } : {}),
        ...(credential.principal.label ? { label: credential.principal.label } : {}),
        ...(credential.principal.scopes ? { scopes: credential.principal.scopes } : {})
      }
    } : {}),
    ...(credential.scopes ? { scopes: credential.scopes } : {}),
    ...(credential.required !== undefined ? { required: credential.required } : {})
  };
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
