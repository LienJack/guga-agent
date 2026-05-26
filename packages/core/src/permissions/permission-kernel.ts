import { AgentEventType } from "../contracts/events";
import type {
  PermissionAction,
  PermissionAllowDecision,
  PermissionDecision,
  PermissionDenyDecision,
  PermissionPolicy,
  PermissionProfile,
  PermissionRequest,
  PermissionResolution,
  PermissionResolver
} from "../contracts/permissions";
import type { ToolDefinition } from "../contracts/tools";
import { EventBus } from "../events/event-bus";

export type PermissionKernelOptions = PermissionPolicy & {
  eventBus?: EventBus;
};

export type PermissionResolveOptions = {
  request: PermissionRequest;
  tool: ToolDefinition;
  signal?: AbortSignal;
};

export class PermissionKernel {
  private readonly eventBus: EventBus;
  private readonly profile: PermissionProfile;
  private readonly timeoutMs: number;
  private readonly resolver: PermissionResolver | undefined;
  private readonly remembered = new Map<string, PermissionAllowDecision | PermissionDenyDecision>();

  constructor(options: PermissionKernelOptions = {}) {
    this.eventBus = options.eventBus ?? new EventBus();
    this.profile = options.profile ?? "default";
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.resolver = options.resolver;
  }

  async resolve(options: PermissionResolveOptions): Promise<PermissionResolution> {
    const request = {
      ...options.request,
      profile: this.profile
    };
    const remembered = this.remembered.get(scopeKey(request));
    if (remembered) {
      const decision = { ...remembered, source: "remembered" as const };
      this.publishResolved(request, decision);
      return decision.action === "allow"
        ? { ok: true, decision }
        : denyResolution(decision, "TOOL_PERMISSION_DENIED");
    }

    const action = defaultAction(options.tool, request.profile);
    if (action === "allow") {
      const decision: PermissionAllowDecision = {
        action: "allow",
        remember: "once",
        source: "profile"
      };
      this.publishResolved(request, decision);
      return { ok: true, decision };
    }

    if (action === "deny") {
      const decision: PermissionDenyDecision = {
        action: "deny",
        remember: "once",
        source: options.tool.runtime?.permission?.defaultAction === "deny" ? "plugin" : "profile",
        reason: options.tool.runtime?.permission?.reason ?? `${request.profile} profile denies this tool`
      };
      this.publishResolved(request, decision);
      return denyResolution(decision, "TOOL_PERMISSION_DENIED");
    }

    if (request.profile === "headless" || request.profile === "background") {
      const decision: PermissionDenyDecision = {
        action: "deny",
        remember: "once",
        source: "profile",
        reason: `${request.profile} profile cannot ask for permission`
      };
      this.publishResolved(request, decision);
      return denyResolution(decision, "TOOL_PERMISSION_UNAVAILABLE");
    }

    if (!this.resolver) {
      const decision: PermissionDenyDecision = {
        action: "deny",
        remember: "once",
        source: "profile",
        reason: "Permission resolver is unavailable"
      };
      this.publishResolved(request, decision);
      return denyResolution(decision, "TOOL_PERMISSION_UNAVAILABLE");
    }

    this.eventBus.publish({
      type: AgentEventType.PermissionRequested,
      runId: request.runId,
      turn: request.turn,
      request
    });

    const decision = await this.resolveWithTimeout(request, options.signal);
    this.remember(request, decision);
    this.publishResolved(request, decision);

    return decision.action === "allow"
      ? { ok: true, decision }
      : denyResolution(decision, permissionFailureCode(decision));
  }

  private async resolveWithTimeout(
    request: PermissionRequest,
    signal?: AbortSignal
  ): Promise<PermissionAllowDecision | PermissionDenyDecision> {
    const resolver = this.resolver;
    if (!resolver) {
      return {
        action: "deny",
        remember: "once",
        source: "profile",
        reason: "Permission resolver is unavailable"
      };
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    try {
      if (signal?.aborted) {
        return {
          action: "deny",
          remember: "once",
          source: "host",
          reason: "Permission request was cancelled",
          metadata: { cancelled: true }
        };
      }
      return await Promise.race([
        resolver(request),
        new Promise<PermissionDenyDecision>((resolve) => {
          timeout = setTimeout(() => {
            resolve({
              action: "deny",
              remember: "once",
              source: "host",
              reason: "Permission request timed out",
              metadata: { timeout: true }
            });
          }, this.timeoutMs);
        }),
        new Promise<PermissionDenyDecision>((resolve) => {
          abort = () => {
            resolve({
              action: "deny",
              remember: "once",
              source: "host",
              reason: "Permission request was cancelled",
              metadata: { cancelled: true }
            });
          };
          signal?.addEventListener("abort", abort, { once: true });
        })
      ]);
    } catch (error) {
      return {
        action: "deny",
        remember: "once",
        source: "host",
        reason: error instanceof Error ? error.message : "Permission resolver failed",
        metadata: { rejected: true }
      };
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
      if (abort) {
        signal?.removeEventListener("abort", abort);
      }
    }
  }

  private remember(
    request: PermissionRequest,
    decision: PermissionAllowDecision | PermissionDenyDecision
  ): void {
    if (decision.remember !== "session") {
      return;
    }
    this.remembered.set(scopeKey(request), decision);
  }

  private publishResolved(request: PermissionRequest, decision: PermissionDecision): void {
    this.eventBus.publish({
      type: AgentEventType.PermissionResolved,
      runId: request.runId,
      turn: request.turn,
      request,
      decision
    });
  }
}

function permissionFailureCode(
  decision: PermissionDenyDecision
): "TOOL_PERMISSION_DENIED" | "TOOL_PERMISSION_CANCELLED" | "TOOL_PERMISSION_TIMEOUT" | "TOOL_PERMISSION_UNAVAILABLE" {
  if (decision.metadata?.timeout === true) {
    return "TOOL_PERMISSION_TIMEOUT";
  }
  if (decision.metadata?.cancelled === true) {
    return "TOOL_PERMISSION_CANCELLED";
  }
  return "TOOL_PERMISSION_DENIED";
}

function defaultAction(tool: ToolDefinition, profile: PermissionProfile): PermissionAction {
  const permission = tool.runtime?.permission;
  const profileAction = permission?.profileActions?.[profile];
  if (profileAction) {
    return profileAction;
  }

  if (permission?.defaultAction) {
    return permission.defaultAction;
  }

  if (profile === "trusted-session") {
    return "allow";
  }

  if (profile === "ask-on-write" && tool.effect === "read") {
    return "allow";
  }

  if (tool.effect === "read") {
    return "allow";
  }

  return "ask";
}

function denyResolution(
  decision: PermissionDenyDecision,
  code: "TOOL_PERMISSION_DENIED" | "TOOL_PERMISSION_CANCELLED" | "TOOL_PERMISSION_TIMEOUT" | "TOOL_PERMISSION_UNAVAILABLE"
): PermissionResolution {
  if (code === "TOOL_PERMISSION_DENIED") {
    return {
      ok: false,
      decision,
      result: {
        ok: false,
        error: {
          code,
          message: decision.reason,
          details: decision.metadata
        },
        metadata: deniedMetadata(decision)
      }
    };
  }

  return {
    ok: false,
    decision,
    result: {
      ok: false,
      error: {
        code,
        message: decision.reason,
        details: decision.metadata
      },
      metadata: deniedMetadata(decision)
    }
  };
}

function deniedMetadata(decision: PermissionDenyDecision): Record<string, unknown> {
  return {
    permission: {
      source: decision.source,
      remember: decision.remember
    }
  };
}

function scopeKey(request: PermissionRequest): string {
  const scope = request.subject.resourceSummary ?? request.subject.commandSummary ?? request.subject.toolName;
  return `${request.subject.toolName}:${request.subject.effect}:${scope}`;
}
