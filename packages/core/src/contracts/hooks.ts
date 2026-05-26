import type { CoreMessage, ToolCall } from "./messages";
import type { ModelEvent } from "./model-events";
import type { ModelIdentifier, ModelPurpose, ProviderError } from "./provider";
import type { ToolDefinition } from "./tools";

export const HookPhase = {
  RuntimeStart: "runtime.start",
  PreToolGate: "pre_tool.gate",
  ModelRequestBefore: "model.request.before",
  ModelResponseAfter: "model.response.after",
  RuntimeShutdown: "runtime.shutdown"
} as const;

export type HookPhase = (typeof HookPhase)[keyof typeof HookPhase];

export const HookEffect = {
  Observe: "observe",
  Gate: "gate",
  Patch: "patch",
  Annotate: "annotate"
} as const;

export type HookEffect = (typeof HookEffect)[keyof typeof HookEffect];

export type RuntimeLifecycleHookContext = {
  runId: string;
};

export type PreToolGateHookContext = {
  runId: string;
  turn: number;
  call: ToolCall;
  tools: readonly ToolDefinition[];
};

export type RuntimeShutdownHookContext = {
  runId: string;
};

export type ModelRequestBeforeHookContext = {
  runId: string;
  turn: number;
  target: Partial<ModelIdentifier> & {
    purpose?: ModelPurpose;
  };
  messages: readonly CoreMessage[];
  tools: readonly ToolDefinition[];
};

export type ModelRequestPatch = {
  messages?: CoreMessage[];
  metadata?: Record<string, unknown>;
};

export type ModelResponseAfterHookContext = {
  runId: string;
  turn: number;
  target: Partial<ModelIdentifier> & {
    purpose?: ModelPurpose;
  };
  events: readonly ModelEvent[];
  error?: ProviderError;
};

export type ModelResponseAnnotation = {
  annotations: Record<string, unknown>;
};

export type HookAllowDecision = {
  type: "allow";
  reason?: string;
  metadata?: Record<string, unknown>;
};

export type HookDenyDecision = {
  type: "deny";
  reason: string;
  metadata?: Record<string, unknown>;
};

export type PreToolGateDecision = HookAllowDecision | HookDenyDecision;

export type RuntimeLifecycleHook = (
  context: RuntimeLifecycleHookContext
) => Promise<void> | void;

export type PreToolGateHook = (
  context: PreToolGateHookContext
) => Promise<PreToolGateDecision | void> | PreToolGateDecision | void;

export type RuntimeShutdownHook = (
  context: RuntimeShutdownHookContext
) => Promise<void> | void;

export type ModelRequestBeforeHook = (
  context: ModelRequestBeforeHookContext
) => Promise<ModelRequestPatch | void> | ModelRequestPatch | void;

export type ModelResponseAfterHook = (
  context: ModelResponseAfterHookContext
) => Promise<ModelResponseAnnotation | void> | ModelResponseAnnotation | void;

export type RuntimeStartHookRegistration = {
  id: string;
  phase: typeof HookPhase.RuntimeStart;
  effect: typeof HookEffect.Observe;
  handler: RuntimeLifecycleHook;
};

export type PreToolGateHookRegistration = {
  id: string;
  phase: typeof HookPhase.PreToolGate;
  effect: typeof HookEffect.Gate;
  handler: PreToolGateHook;
};

export type RuntimeShutdownHookRegistration = {
  id: string;
  phase: typeof HookPhase.RuntimeShutdown;
  effect: typeof HookEffect.Observe;
  handler: RuntimeShutdownHook;
};

export type ModelRequestBeforeHookRegistration = {
  id: string;
  phase: typeof HookPhase.ModelRequestBefore;
  effect: typeof HookEffect.Patch;
  handler: ModelRequestBeforeHook;
};

export type ModelResponseAfterHookRegistration = {
  id: string;
  phase: typeof HookPhase.ModelResponseAfter;
  effect: typeof HookEffect.Annotate;
  handler: ModelResponseAfterHook;
};

export type HookRegistration =
  | RuntimeStartHookRegistration
  | PreToolGateHookRegistration
  | ModelRequestBeforeHookRegistration
  | ModelResponseAfterHookRegistration
  | RuntimeShutdownHookRegistration;

export type RegisteredHook = HookRegistration & {
  pluginId: string;
  pluginLoadIndex: number;
  registrationIndex: number;
};

export type HookFailure = {
  code: "HOOK_FAILED";
  message: string;
  details?: unknown;
};

export type HookGateResult =
  | {
      ok: true;
      decision: HookAllowDecision;
    }
  | {
      ok: true;
      decision: HookDenyDecision;
      deniedBy: RegisteredHook;
    }
  | {
      ok: false;
      error: HookFailure;
      failedHook: RegisteredHook;
    };

export type HookShutdownResult = {
  failures: Array<{
    hook: RegisteredHook;
    error: HookFailure;
  }>;
};
