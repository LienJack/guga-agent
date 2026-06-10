import type {
  DelegationAgentType,
  DelegationChildOutcome,
  DelegationChildRunner,
  DelegationEventCount,
  DelegationStatus,
  DelegationValidationDiagnostic
} from "./delegation-types";
import { sortEventCounts, validateDelegationOutput } from "./delegation-ledger";

export type NormalizedDelegationTask = {
  taskIndex: number;
  taskId?: string;
  goal: string;
  context?: string;
  agentType: DelegationAgentType;
  tools: string[];
  maxTurns: number;
  timeoutMs: number;
  childRunId: string;
  childSessionId: string;
  input: string;
};

export type RunDelegationBatchOptions = {
  tasks: readonly NormalizedDelegationTask[];
  childRunner: DelegationChildRunner;
  parentRunId: string;
  parentToolCallId: string;
  maxConcurrency: number;
  parentSignal?: AbortSignal;
  maxChildMetadataChars: number;
};

export async function runDelegationBatch(options: RunDelegationBatchOptions): Promise<DelegationChildOutcome[]> {
  const outcomes: Array<DelegationChildOutcome | undefined> = new Array(options.tasks.length);
  let nextTaskIndex = 0;
  let activeCount = 0;
  let settledCount = 0;

  return await new Promise((resolve) => {
    const settleIfDone = () => {
      if (settledCount === options.tasks.length) {
        resolve(outcomes as DelegationChildOutcome[]);
      }
    };

    const scheduleNext = () => {
      if (options.parentSignal?.aborted) {
        cancelPending();
        settleIfDone();
        return;
      }

      while (activeCount < options.maxConcurrency && nextTaskIndex < options.tasks.length) {
        const task = options.tasks[nextTaskIndex];
        const outcomeIndex = nextTaskIndex;
        nextTaskIndex += 1;
        if (!task) {
          continue;
        }
        activeCount += 1;
        void runOne(task, options)
          .then((outcome) => {
            outcomes[outcomeIndex] = outcome;
          })
          .catch((error) => {
            outcomes[outcomeIndex] = outcomeForTask(task, "failed", error instanceof Error ? error.message : "Child delegation failed", [], undefined);
          })
          .finally(() => {
            settledCount += 1;
            activeCount -= 1;
            scheduleNext();
            settleIfDone();
          });
      }

      if (nextTaskIndex >= options.tasks.length && activeCount === 0) {
        settleIfDone();
      }
    };

    const cancelPending = () => {
      for (let index = nextTaskIndex; index < options.tasks.length; index += 1) {
        const task = options.tasks[index];
        if (task && !outcomes[index]) {
          outcomes[index] = outcomeForTask(task, "cancelled", "Delegation was cancelled before this child started", [], undefined);
          settledCount += 1;
        }
      }
    };

    scheduleNext();
  });
}

async function runOne(task: NormalizedDelegationTask, options: RunDelegationBatchOptions): Promise<DelegationChildOutcome> {
  const controller = new AbortController();
  let removeParentAbortListener: (() => void) | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const runnerPromise = Promise.resolve()
    .then(() => options.childRunner({
      input: task.input,
      goal: task.goal,
      ...(task.context ? { context: task.context } : {}),
      taskIndex: task.taskIndex,
      ...(task.taskId ? { taskId: task.taskId } : {}),
      agentType: task.agentType,
      tools: task.tools,
      maxTurns: task.maxTurns,
      timeoutMs: task.timeoutMs,
      parentRunId: options.parentRunId,
      parentToolCallId: options.parentToolCallId,
      childRunId: task.childRunId,
      childSessionId: task.childSessionId,
      signal: controller.signal
    }));
  runnerPromise.catch(() => undefined);

  try {
    const cancellationPromise = new Promise<"cancelled">((resolve) => {
      if (!options.parentSignal) {
        return;
      }
      if (options.parentSignal.aborted) {
        controller.abort();
        resolve("cancelled");
        return;
      }
      const onAbort = () => {
        controller.abort();
        resolve("cancelled");
      };
      options.parentSignal.addEventListener("abort", onAbort, { once: true });
      removeParentAbortListener = () => options.parentSignal?.removeEventListener("abort", onAbort);
    });
    const outcome = await Promise.race([
      runnerPromise,
      new Promise<"timed_out">((resolve) => {
        timeout = setTimeout(() => {
          controller.abort();
          resolve("timed_out");
        }, task.timeoutMs);
      }),
      cancellationPromise
    ]);

    if (outcome === "timed_out") {
      return outcomeForTask(task, "timed_out", "Delegation child timed out", [], undefined);
    }
    if (outcome === "cancelled") {
      return outcomeForTask(task, "cancelled", "Delegation was cancelled", [], undefined);
    }

    const diagnostics = validateDelegationOutput({
      status: outcome.status,
      summary: outcome.summary,
      childRunId: task.childRunId,
      childSessionId: task.childSessionId,
      events: outcome.events ?? []
    });
    if (diagnostics.length > 0) {
      return outcomeForTask(
        task,
        "failed",
        "Delegate task output is invalid",
        [],
        undefined,
        "DELEGATION_OUTPUT_INVALID",
        diagnostics
      );
    }

    return outcomeForTask(
      task,
      outcome.status,
      outcome.summary,
      outcome.events ?? [],
      sanitizeChildMetadata(outcome.metadata, options.maxChildMetadataChars)
    );
  } catch (error) {
    if (options.parentSignal?.aborted || controller.signal.aborted) {
      return outcomeForTask(task, "cancelled", "Delegation was cancelled", [], undefined);
    }
    return outcomeForTask(
      task,
      "failed",
      error instanceof Error ? error.message : "Child delegation failed",
      [],
      undefined,
      "DELEGATION_RUNNER_FAILED"
    );
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
    removeParentAbortListener?.();
  }
}

function outcomeForTask(
  task: NormalizedDelegationTask,
  status: DelegationStatus,
  summary: string,
  events: readonly DelegationEventCount[],
  metadata: Record<string, unknown> | undefined,
  failureCode?: string,
  diagnostics?: DelegationValidationDiagnostic[]
): DelegationChildOutcome {
  return {
    status,
    summary: summary.trim() || `${status} child delegation`,
    childRunId: task.childRunId,
    childSessionId: task.childSessionId,
    taskIndex: task.taskIndex,
    ...(task.taskId ? { taskId: task.taskId } : {}),
    goal: task.goal,
    tools: task.tools,
    agentType: task.agentType,
    events: sortEventCounts(events),
    ...(metadata ? { metadata } : {}),
    ...(failureCode ? { failureCode } : {}),
    ...(diagnostics ? { diagnostics } : {})
  };
}

function sanitizeChildMetadata(metadata: Record<string, unknown> | undefined, maxChars: number): Record<string, unknown> | undefined {
  if (!metadata) {
    return undefined;
  }
  const sanitized = redactSecretKeys(metadata);
  const serialized = JSON.stringify(sanitized);
  if (serialized.length <= maxChars) {
    return sanitized;
  }
  return {
    truncated: true,
    originalBytes: serialized.length,
    preview: serialized.slice(0, Math.max(0, maxChars))
  };
}

function redactSecretKeys(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) {
    return {};
  }
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [
    key,
    isSensitiveKey(key) ? "[redacted]" : sanitizeValue(value)
  ]));
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.slice(0, 20).map(sanitizeValue);
  }
  if (isRecord(value)) {
    return redactSecretKeys(value);
  }
  if (typeof value === "string" && value.length > 500) {
    return `${value.slice(0, 500)}...`;
  }
  return value;
}

function isSensitiveKey(key: string): boolean {
  return /api[_-]?key|token|secret|password|credential|authorization/i.test(key);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
