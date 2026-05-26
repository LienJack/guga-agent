import type { CoreMessage, ToolCall } from "./messages";
import type { ModelEvent } from "./model-events";
import type { ModelIdentifier, ModelPurpose, ProviderError } from "./provider";
import type { ToolCallCorrelation } from "./tool-runtime";
import type { ToolDefinition } from "./tools";
import type { ToolResult } from "./tools";

export const HookPhase = {
  RuntimeStart: "runtime.start",
  PreToolGate: "pre_tool.gate",
  ToolCallBefore: "tool.call.before",
  ToolExecuteBefore: "tool.execute.before",
  ToolExecuteAfter: "tool.execute.after",
  ToolResultBefore: "tool.result.before",
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

export type ToolHookSafety = "safe" | "dangerous";

export type ToolHookControl = {
  timeoutMs?: number;
  safety?: ToolHookSafety;
  signal?: AbortSignal;
};

export type ToolCallBeforeHookContext = {
  runId: string;
  turn: number;
  correlation: ToolCallCorrelation;
  call: ToolCall;
  tool: ToolDefinition;
  control?: ToolHookControl;
};

export type ToolExecuteBeforeHookContext = ToolCallBeforeHookContext & {
  input: unknown;
};

export type ToolExecuteAfterHookContext = ToolCallBeforeHookContext & {
  input: unknown;
  result: ToolResult;
};

export type ToolResultBeforeHookContext = ToolCallBeforeHookContext & {
  result: ToolResult;
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

export type ToolHookPatchDecision = {
  type: "patch";
  input?: unknown;
  metadata?: Record<string, unknown>;
};

export type ToolHookBlockDecision = {
  type: "block";
  reason: string;
  metadata?: Record<string, unknown>;
};

export type ToolHookAnnotationDecision = {
  type: "annotate";
  annotations: Record<string, unknown>;
};

export type ToolHookDecision =
  | HookAllowDecision
  | ToolHookPatchDecision
  | ToolHookBlockDecision
  | ToolHookAnnotationDecision;

export type RuntimeLifecycleHook = (
  context: RuntimeLifecycleHookContext
) => Promise<void> | void;

export type PreToolGateHook = (
  context: PreToolGateHookContext
) => Promise<PreToolGateDecision | void> | PreToolGateDecision | void;

export type ToolCallBeforeHook = (
  context: ToolCallBeforeHookContext
) => Promise<ToolHookDecision | void> | ToolHookDecision | void;

export type ToolExecuteBeforeHook = (
  context: ToolExecuteBeforeHookContext
) => Promise<ToolHookDecision | void> | ToolHookDecision | void;

export type ToolExecuteAfterHook = (
  context: ToolExecuteAfterHookContext
) => Promise<ToolHookDecision | void> | ToolHookDecision | void;

export type ToolResultBeforeHook = (
  context: ToolResultBeforeHookContext
) => Promise<HookAllowDecision | ToolHookAnnotationDecision | void> | HookAllowDecision | ToolHookAnnotationDecision | void;

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

export type ToolCallBeforeHookRegistration = {
  id: string;
  phase: typeof HookPhase.ToolCallBefore;
  effect: typeof HookEffect.Patch | typeof HookEffect.Gate | typeof HookEffect.Annotate;
  handler: ToolCallBeforeHook;
  control?: ToolHookControl;
};

export type ToolExecuteBeforeHookRegistration = {
  id: string;
  phase: typeof HookPhase.ToolExecuteBefore;
  effect: typeof HookEffect.Gate | typeof HookEffect.Annotate;
  handler: ToolExecuteBeforeHook;
  control?: ToolHookControl;
};

export type ToolExecuteAfterHookRegistration = {
  id: string;
  phase: typeof HookPhase.ToolExecuteAfter;
  effect: typeof HookEffect.Annotate;
  handler: ToolExecuteAfterHook;
  control?: ToolHookControl;
};

export type ToolResultBeforeHookRegistration = {
  id: string;
  phase: typeof HookPhase.ToolResultBefore;
  effect: typeof HookEffect.Annotate;
  handler: ToolResultBeforeHook;
  control?: ToolHookControl;
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
  | ToolCallBeforeHookRegistration
  | ToolExecuteBeforeHookRegistration
  | ToolExecuteAfterHookRegistration
  | ToolResultBeforeHookRegistration
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
