import { AgentEventType } from "../contracts/events";
import {
  HookPhase,
  type HookFailure,
  type HookGateResult,
  type HookRegistration,
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
}

function toHookFailure(error: unknown): HookFailure {
  return {
    code: "HOOK_FAILED",
    message: error instanceof Error ? error.message : "Hook failed",
    details: error
  };
}
