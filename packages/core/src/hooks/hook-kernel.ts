import { AgentEventType } from "../contracts/events";
import {
  HookPhase,
  type HookFailure,
  type HookGateResult,
  type HookRegistration,
  type ContextHookContext,
  type ContextHookDecision,
  type ContextHookRegistration,
  type ToolExecuteAfterHookContext,
  type ToolExecuteBeforeHookContext,
  type ToolCallBeforeHookContext,
  type ToolHookDecision,
  type ToolResultBeforeHookContext,
  type HookShutdownResult,
  type PreToolGateHookContext,
  type RegisteredHook,
  type RuntimeLifecycleHookContext,
  type RuntimeShutdownHookContext
} from "../contracts/hooks";
import { EventBus } from "../events/event-bus";
import type { ContextPolicy } from "../contracts/context";

export type HookKernelOptions = {
  eventBus?: EventBus;
};

export type ToolHookContext =
  | ToolCallBeforeHookContext
  | ToolExecuteBeforeHookContext
  | ToolExecuteAfterHookContext
  | ToolResultBeforeHookContext;

export type ToolHookRunResult =
  | {
      ok: true;
      input?: unknown;
      inputPatched: boolean;
      annotations: Record<string, unknown>[];
      block?: Extract<ToolHookDecision, { type: "block" }>;
    }
  | {
      ok: false;
      error: HookFailure;
      failedHook: RegisteredHook;
    };

export type ContextHookRunResult =
  | {
      ok: true;
      decisions: ContextHookDecision[];
    }
  | {
      ok: false;
      error: HookFailure;
      failedHook: RegisteredHook;
    };

export class HookKernel {
  private readonly eventBus: EventBus;
  private readonly hooks: RegisteredHook[] = [];
  private readonly contextPolicies = new Map<string, ContextPolicy>();
  private nextRegistrationIndex = 0;

  constructor(options: HookKernelOptions = {}) {
    this.eventBus = options.eventBus ?? new EventBus();
  }

  registerHook(pluginId: string, pluginLoadIndex: number, hook: HookRegistration): RegisteredHook {
    const contextPolicy = isContextHookRegistration(hook) ? this.contextPolicies.get(pluginId) : undefined;
    const registered = {
      ...applyContextPolicyDefaults(hook, contextPolicy),
      pluginId,
      pluginLoadIndex,
      registrationIndex: this.nextRegistrationIndex
    };
    this.nextRegistrationIndex += 1;
    this.hooks.push(registered);
    return registered;
  }

  registerContextPolicy(pluginId: string, policy: ContextPolicy): void {
    this.contextPolicies.set(pluginId, policy);
  }

  removeContextPolicy(pluginId: string): void {
    this.contextPolicies.delete(pluginId);
  }

  async runRuntimeStart(context: RuntimeLifecycleHookContext): Promise<HookShutdownResult> {
    return this.runObserveHooks(HookPhase.RuntimeStart, context);
  }

  async runPreToolGate(context: PreToolGateHookContext): Promise<HookGateResult> {
    const hooks = this.orderedHooks(HookPhase.PreToolGate);
    if (hooks.length === 0) {
      return { ok: true, decision: { type: "allow" } };
    }

    for (const hook of hooks) {
      if (hook.phase !== HookPhase.PreToolGate) {
        continue;
      }

      try {
        const start = await this.appendHookStart(context.runId, hook, context.turn, context.call.id);
        if (!start.ok) {
          const failure: HookFailure = {
            code: "HOOK_FAILED",
            message: `Hook start marker could not be durably recorded: ${start.message}`,
            details: start
          };
          this.publishHookFailure(context.runId, hook, failure);
          return { ok: false, error: failure, failedHook: hook };
        }
        const decision = (await hook.handler(context)) ?? { type: "allow" };
        const terminal = await this.eventBus.publishDurable({
          type: AgentEventType.HookDecision,
          runId: context.runId,
          phase: HookPhase.PreToolGate,
          pluginId: hook.pluginId,
          hookId: hook.id,
          call: context.call,
          decision
        }, {
          idempotencyKey: durableHookKey(context.runId, HookPhase.PreToolGate, hook, context.turn, context.call.id, "decision")
        });
        if (!terminal.ok) {
          const failure: HookFailure = {
            code: "HOOK_FAILED",
            message: `Hook decision marker could not be durably recorded: ${terminal.message}`,
            details: {
              persistenceStatus: "interrupted",
              durableResult: terminal
            }
          };
          this.publishHookFailure(context.runId, hook, failure);
          return { ok: false, error: failure, failedHook: hook };
        }

        if (decision.type === "deny") {
          return { ok: true, decision, deniedBy: hook };
        }
      } catch (error) {
        const failure = toHookFailure(error);
        this.publishHookFailure(context.runId, hook, failure);
        return { ok: false, error: failure, failedHook: hook };
      }
    }

    return { ok: true, decision: { type: "allow" } };
  }

  async runToolHook(
    phase: typeof HookPhase.ToolCallBefore | typeof HookPhase.ToolExecuteBefore | typeof HookPhase.ToolExecuteAfter | typeof HookPhase.ToolResultBefore,
    context: ToolHookContext
  ): Promise<ToolHookRunResult> {
    const annotations: Record<string, unknown>[] = [];
    let input = "input" in context ? context.input : context.call.input;
    let inputPatched = false;

    for (const hook of this.orderedHooks(phase)) {
      try {
        const start = await this.appendHookStart(context.runId, hook, context.turn, context.call.id);
        if (!start.ok) {
          return {
            ok: false,
            error: {
              code: "HOOK_FAILED",
              message: `Hook start marker could not be durably recorded: ${start.message}`,
              details: start
            },
            failedHook: hook
          };
        }
        const decision = await runWithTimeout(
          runRegisteredToolHook(hook, context, input),
          hookTimeoutMs(hook) ?? context.control?.timeoutMs,
          context.control?.signal
        );
        if (!decision || decision.type === "allow") {
          const terminal = await this.publishToolHookDecision(context.runId, context, hook, decision ?? { type: "allow" });
          if (!terminal.ok) {
            return {
              ok: false,
              error: terminal.error,
              failedHook: hook
            };
          }
          continue;
        }

        const terminal = await this.publishToolHookDecision(context.runId, context, hook, decision);
        if (!terminal.ok) {
          return {
            ok: false,
            error: terminal.error,
            failedHook: hook
          };
        }

        if (decision.type === "block") {
          return {
            ok: true,
            input,
            inputPatched,
            annotations,
            block: decision
          };
        }

        if (decision.type === "patch") {
          input = decision.input;
          inputPatched = true;
          continue;
        }

        annotations.push(decision.annotations);
      } catch (error) {
        const failure = toHookFailure(error);
        this.publishHookFailure(context.runId, hook, failure);
        return { ok: false, error: failure, failedHook: hook };
      }
    }

    return {
      ok: true,
      input,
      inputPatched,
      annotations
    };
  }

  async runRuntimeShutdown(context: RuntimeShutdownHookContext): Promise<HookShutdownResult> {
    return this.runObserveHooks(HookPhase.RuntimeShutdown, context);
  }

  async runContextHook(
    phase:
      | typeof HookPhase.ResourcesDiscover
      | typeof HookPhase.ContextAssemble
      | typeof HookPhase.ContextBudget
      | typeof HookPhase.ContextTruncate
      | typeof HookPhase.ContextCompactBefore
      | typeof HookPhase.ContextCompactAfter
      | typeof HookPhase.ContextReinject,
    context: ContextHookContext
  ): Promise<ContextHookRunResult> {
    const decisions: ContextHookDecision[] = [];
    for (const hook of this.orderedHooks(phase)) {
      if (!isContextHook(hook)) {
        continue;
      }
      try {
        const decision = await runWithTimeout(
          Promise.resolve(hook.handler(context)),
          hook.control?.timeoutMs ?? context.control?.timeoutMs,
          context.control?.signal
        );
        const normalized = Array.isArray(decision) ? decision : decision ? [decision] : [];
        const invalidDecision = normalized.find((item) => !decisionAllowedForPolicy(item, hook));
        if (invalidDecision) {
          const failure: HookFailure = {
            code: "HOOK_FAILED",
            message: `Context hook ${hook.id} returned a decision outside its permission scope`,
            details: {
              permissionScope: hook.control?.permissionScope,
              decision: invalidDecision
            }
          };
          this.publishHookFailure(context.runId, hook, failure);
          return { ok: false, error: failure, failedHook: hook };
        }
        decisions.push(...normalized);
        for (const item of normalized) {
          const published = await this.eventBus.publishDurable({
            type: AgentEventType.ContextHookDecision,
            runId: context.runId,
            ...(context.turn !== undefined ? { turn: context.turn } : {}),
            phase,
            pluginId: hook.pluginId,
            hookId: hook.id,
            decision: item
          }, {
            idempotencyKey: durableContextHookKey(context.runId, phase, hook, context.turn, item.id)
          });
          if (!published.ok) {
            const failure: HookFailure = {
              code: "HOOK_FAILED",
              message: `Context hook decision marker could not be durably recorded: ${published.message}`,
              details: {
                persistenceStatus: "interrupted",
                durableResult: published
              }
            };
            this.publishHookFailure(context.runId, hook, failure);
            return { ok: false, error: failure, failedHook: hook };
          }
        }
      } catch (error) {
        const failure = toHookFailure(error);
        this.publishHookFailure(context.runId, hook, failure);
        return { ok: false, error: failure, failedHook: hook };
      }
    }
    return { ok: true, decisions };
  }

  clear(): void {
    this.hooks.length = 0;
    this.contextPolicies.clear();
  }

  private async runObserveHooks(
    phase: typeof HookPhase.RuntimeStart | typeof HookPhase.RuntimeShutdown,
    context: RuntimeLifecycleHookContext | RuntimeShutdownHookContext
  ): Promise<HookShutdownResult> {
    const failures: HookShutdownResult["failures"] = [];

    for (const hook of this.orderedHooks(phase)) {
      try {
        if (hook.phase === HookPhase.RuntimeStart) {
          await hook.handler(context);
        } else if (hook.phase === HookPhase.RuntimeShutdown) {
          await hook.handler(context);
        }
      } catch (error) {
        const failure = toHookFailure(error);
        this.publishHookFailure(context.runId, hook, failure);
        failures.push({ hook, error: failure });
      }
    }

    return { failures };
  }

  private orderedHooks(phase: HookPhase): RegisteredHook[] {
    return this.hooks
      .filter((hook) => hook.phase === phase)
      .sort(
        (left, right) =>
          contextHookPriority(left, this.contextPolicies) - contextHookPriority(right, this.contextPolicies) ||
          left.pluginLoadIndex - right.pluginLoadIndex ||
          left.registrationIndex - right.registrationIndex
      );
  }

  private publishHookFailure(runId: string, hook: RegisteredHook, error: HookFailure): void {
    this.eventBus.publish({
      type: AgentEventType.HookFailure,
      runId,
      phase: hook.phase,
      pluginId: hook.pluginId,
      hookId: hook.id,
      message: error.message,
      details: error.details
    });
  }

  private async publishToolHookDecision(runId: string, context: ToolHookContext, hook: RegisteredHook, decision: ToolHookDecision): Promise<{ ok: true } | { ok: false; error: HookFailure }> {
    const published = await this.eventBus.publishDurable({
      type: AgentEventType.HookDecision,
      runId,
      phase: hook.phase,
      pluginId: hook.pluginId,
      hookId: hook.id,
      call: context.call,
      ...("correlation" in context ? { correlation: context.correlation } : {}),
      decision
    }, {
      idempotencyKey: durableHookKey(runId, hook.phase, hook, context.turn, context.call.id, "decision")
    });
    if (!published.ok) {
      const failure: HookFailure = {
        code: "HOOK_FAILED",
        message: `Hook decision marker could not be durably recorded: ${published.message}`,
        details: {
          persistenceStatus: "interrupted",
          durableResult: published
        }
      };
      this.publishHookFailure(runId, hook, failure);
      return { ok: false, error: failure };
    }
    return { ok: true };
  }

  private appendHookStart(runId: string, hook: RegisteredHook, turn: number | undefined, toolCallId?: string) {
    return this.eventBus.appendDurableRecord({
      type: "hook.started",
      runId,
      ...(turn !== undefined ? { turn } : {}),
      phase: hook.phase,
      pluginId: hook.pluginId,
      hookId: hook.id,
      ...(toolCallId ? { toolCallId } : {})
    }, {
      eventType: "hook.started",
      idempotencyKey: durableHookKey(runId, hook.phase, hook, turn, toolCallId, "started")
    });
  }
}

function isContextHook(hook: RegisteredHook): hook is ContextHookRegistration & RegisteredHook {
  return [
    HookPhase.ResourcesDiscover,
    HookPhase.ContextAssemble,
    HookPhase.ContextBudget,
    HookPhase.ContextTruncate,
    HookPhase.ContextCompactBefore,
    HookPhase.ContextCompactAfter,
    HookPhase.ContextReinject
  ].includes(hook.phase as typeof HookPhase.ResourcesDiscover);
}

function isContextHookRegistration(hook: HookRegistration): hook is ContextHookRegistration {
  return [
    HookPhase.ResourcesDiscover,
    HookPhase.ContextAssemble,
    HookPhase.ContextBudget,
    HookPhase.ContextTruncate,
    HookPhase.ContextCompactBefore,
    HookPhase.ContextCompactAfter,
    HookPhase.ContextReinject
  ].includes(hook.phase as typeof HookPhase.ResourcesDiscover);
}

function applyContextPolicyDefaults(hook: HookRegistration, policy: ContextPolicy | undefined): HookRegistration {
  if (!policy || !isContextHookRegistration(hook)) {
    return hook;
  }
  return {
    ...hook,
    control: {
      ...(policy.timeoutMs !== undefined ? { timeoutMs: policy.timeoutMs } : {}),
      permissionScope: policy.permissionScope ?? "read-only",
      ...(hook.control ?? {})
    }
  };
}

function decisionAllowedForPolicy(decision: ContextHookDecision, hook: ContextHookRegistration & RegisteredHook): boolean {
  const scope = hook.control?.permissionScope;
  if (!scope) {
    return true;
  }
  if (scope === "compaction-gate") {
    return true;
  }
  if (decision.kind === "gate") {
    return false;
  }
  if (scope === "read-only") {
    return decision.kind === "annotation";
  }
  return true;
}

function contextHookPriority(hook: RegisteredHook, policies: Map<string, ContextPolicy>): number {
  return isContextHook(hook) ? policies.get(hook.pluginId)?.priority ?? 0 : 0;
}

function hookTimeoutMs(hook: RegisteredHook): number | undefined {
  return "control" in hook ? hook.control?.timeoutMs : undefined;
}

async function runWithTimeout<T>(operation: Promise<T>, timeoutMs: number | undefined, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) {
    throw new Error("Tool hook aborted");
  }

  if (timeoutMs === undefined && !signal) {
    return operation;
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        if (timeoutMs !== undefined) {
          timeout = setTimeout(() => reject(new Error("Tool hook timed out")), timeoutMs);
        }
      }),
      new Promise<T>((_, reject) => {
        abort = () => reject(new Error("Tool hook aborted"));
        signal?.addEventListener("abort", abort, { once: true });
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
    if (abort) {
      signal?.removeEventListener("abort", abort);
    }
  }
}

async function runRegisteredToolHook(
  hook: RegisteredHook,
  context: ToolHookContext,
  input: unknown
): Promise<ToolHookDecision | void> {
  switch (hook.phase) {
    case HookPhase.ToolCallBefore:
      return hook.handler(context as ToolCallBeforeHookContext);
    case HookPhase.ToolExecuteBefore:
      return hook.handler({ ...context, input } as ToolExecuteBeforeHookContext);
    case HookPhase.ToolExecuteAfter:
      return hook.handler({ ...context, input } as ToolExecuteAfterHookContext);
    case HookPhase.ToolResultBefore:
      return hook.handler(context as ToolResultBeforeHookContext);
    default:
      return undefined;
  }
}

function toHookFailure(error: unknown): HookFailure {
  return {
    code: "HOOK_FAILED",
    message: error instanceof Error ? error.message : "Hook failed",
    details: error
  };
}

function durableHookKey(
  runId: string,
  phase: HookPhase,
  hook: RegisteredHook,
  turn: number | undefined,
  toolCallId: string | undefined,
  boundary = "hook"
): string {
  return [
    runId,
    turn ?? "turnless",
    phase,
    hook.pluginId,
    hook.id,
    toolCallId ?? "callless",
    boundary
  ].join(":");
}

function durableContextHookKey(
  runId: string,
  phase: HookPhase,
  hook: RegisteredHook,
  turn: number | undefined,
  decisionId: string
): string {
  return [
    runId,
    turn ?? "turnless",
    phase,
    hook.pluginId,
    hook.id,
    decisionId,
    "context-hook-decision"
  ].join(":");
}
