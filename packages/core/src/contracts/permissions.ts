import type { ToolCall } from "./messages";
import type { ToolEffect } from "./tools";
import type {
  ToolActionMetadata,
  ToolCredentialBinding,
  ToolEnvironmentRequirement,
  ToolIntent,
  ToolPrincipalSummary,
  ToolResourceScope
} from "./tool-runtime";

export type PermissionAction = "allow" | "ask" | "deny";

export type PermissionRemember = "once" | "session";

export type PermissionProfile =
  | "default"
  | "headless"
  | "background"
  | "ask-on-write"
  | "trusted-session";

export type PermissionDecisionSource = "profile" | "host" | "plugin" | "remembered";

export type PermissionSubject = {
  toolName: string;
  effect: ToolEffect;
  action?: ToolActionMetadata;
  scopes?: ToolResourceScope[];
  principal?: ToolPrincipalSummary;
  credentials?: readonly ToolCredentialBinding[];
  environment?: ToolEnvironmentRequirement;
  commandSummary?: string;
  resourceSummary?: string;
};

export type ToolPermissionMetadata = {
  defaultAction?: PermissionAction;
  profileActions?: Partial<Record<PermissionProfile, PermissionAction>>;
  scope?: "tool" | "resource" | "command";
  reason?: string;
  prompt?: {
    title?: string;
    summary?: string;
  };
};

export type PermissionRequest = {
  runId: string;
  turn: number;
  toolCallId: string;
  attempt: number;
  batchId?: string;
  call: ToolCall;
  subject: PermissionSubject;
  profile: PermissionProfile;
  intent?: ToolIntent;
  metadata?: Record<string, unknown>;
};

export type PermissionAllowDecision = {
  action: "allow";
  remember: PermissionRemember;
  source: PermissionDecisionSource;
  reason?: string;
  metadata?: Record<string, unknown>;
};

export type PermissionDenyDecision = {
  action: "deny";
  remember: PermissionRemember;
  source: PermissionDecisionSource;
  reason: string;
  metadata?: Record<string, unknown>;
};

export type PermissionAskDecision = {
  action: "ask";
  source: PermissionDecisionSource;
  reason?: string;
  metadata?: Record<string, unknown>;
};

export type PermissionDecision =
  | PermissionAllowDecision
  | PermissionDenyDecision
  | PermissionAskDecision;

export type PermissionResolution =
  | {
      ok: true;
      decision: PermissionAllowDecision;
    }
  | {
      ok: false;
      decision: PermissionDenyDecision;
      result: PermissionDeniedToolResult;
    }
  | {
      ok: false;
      decision: PermissionDenyDecision;
      result: PermissionUnavailableToolResult;
    };

export type PermissionDeniedToolResult = {
  ok: false;
  error: {
    code: "TOOL_PERMISSION_DENIED";
    message: string;
    details?: unknown;
  };
  metadata?: Record<string, unknown>;
};

export type PermissionUnavailableToolResult = {
  ok: false;
  error: {
    code: "TOOL_PERMISSION_CANCELLED" | "TOOL_PERMISSION_TIMEOUT" | "TOOL_PERMISSION_UNAVAILABLE";
    message: string;
    details?: unknown;
  };
  metadata?: Record<string, unknown>;
};

export type PermissionResolver = (
  request: PermissionRequest
) => Promise<PermissionAllowDecision | PermissionDenyDecision> | PermissionAllowDecision | PermissionDenyDecision;

export type PermissionPolicy = {
  profile?: PermissionProfile;
  timeoutMs?: number;
  resolver?: PermissionResolver;
};
