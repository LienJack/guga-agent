import { AgentEventType } from "../contracts/events";
import {
  HookPhase,
  type HookFailure,
  type HookGateResult,
  type HookRegistration,
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

export class HookKernel {
  private readonly eventBus: EventBus;
  private readonly hooks: RegisteredHook[] = [];
  private nextRegistrationIndex = 0;

  constructor(options: HookKernelOptions = {}) {
    this.eventBus = options.eventBus ?? new EventBus();
  }

  registerHook(pluginId: string, pluginLoadIndex: number, hook: HookRegistration): RegisteredHook {
    const registered = {
      ...hook,
      pluginId,
      pluginLoadIndex,
      registrationIndex: this.nextRegistrationIndex
    };
    this.nextRegistrationIndex += 1;
    this.hooks.push(registered);
    return registered;
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
        const decision = (await hook.handler(context)) ?? { type: "allow" };
        this.eventBus.publish({
          type: AgentEventType.HookDecision,
          runId: context.runId,
          phase: HookPhase.PreToolGate,
          pluginId: hook.pluginId,
          hookId: hook.id,
          call: context.call,
          decision
        });

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
        const decision = await runWithTimeout(
          runRegisteredToolHook(hook, context, input),
          hookTimeoutMs(hook) ?? context.control?.timeoutMs,
          context.control?.signal
        );
        if (!decision || decision.type === "allow") {
          this.publishToolHookDecision(context.runId, context, hook, decision ?? { type: "allow" });
          continue;
        }

        this.publishToolHookDecision(context.runId, context, hook, decision);

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

  clear(): void {
    this.hooks.length = 0;
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

  private publishToolHookDecision(runId: string, context: ToolHookContext, hook: RegisteredHook, decision: ToolHookDecision): void {
    this.eventBus.publish({
      type: AgentEventType.HookDecision,
      runId,
      phase: hook.phase,
      pluginId: hook.pluginId,
      hookId: hook.id,
      call: context.call,
      ...("correlation" in context ? { correlation: context.correlation } : {}),
      decision
    });
  }
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
