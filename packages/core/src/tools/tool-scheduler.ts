import type { ToolCall } from "../contracts/messages";
import type { ToolDefinition, ToolEffect } from "../contracts/tools";
import { hasUnknownScope, resourceScopeSetsConflict, type ResourceScope } from "./resource-scope";

export type SchedulableTool = Pick<ToolDefinition, "effect" | "name" | "runtime">;

export type SchedulableToolCall = {
  call: ToolCall;
  tool: SchedulableTool;
};

export type ScheduledToolCall = SchedulableToolCall & {
  scopes: readonly ResourceScope[];
};

export type ToolScheduleBatch = {
  parallel: boolean;
  calls: ScheduledToolCall[];
};

export type ToolSchedulerOptions = {
  allowScopedParallelism?: boolean;
};

type Safety = "parallel-read" | "parallel-scoped" | "serial";

export class ToolScheduler {
  private readonly allowScopedParallelism: boolean;

  constructor(options: ToolSchedulerOptions = {}) {
    this.allowScopedParallelism = options.allowScopedParallelism ?? false;
  }

  createBatches(calls: readonly SchedulableToolCall[]): ToolScheduleBatch[] {
    const batches: ToolScheduleBatch[] = [];

    for (const item of calls) {
      const scheduled = this.prepareCall(item);
      const safety = this.classify(scheduled);

      if (safety === "serial") {
        batches.push({ parallel: false, calls: [scheduled] });
        continue;
      }

      const lastBatch = batches.at(-1);
      if (lastBatch && lastBatch.parallel && this.canAddToBatch(lastBatch, scheduled, safety)) {
        lastBatch.calls.push(scheduled);
        continue;
      }

      batches.push({ parallel: true, calls: [scheduled] });
    }

    return batches;
  }

  private prepareCall(item: SchedulableToolCall): ScheduledToolCall {
    return {
      ...item,
      scopes: extractScopes(item)
    };
  }

  private classify(call: ScheduledToolCall): Safety {
    if (call.tool.runtime?.executionMode === "interactive" || call.tool.runtime?.permission?.defaultAction === "ask") {
      return "serial";
    }

    if (call.tool.runtime?.scheduler?.concurrency === "serial" || call.tool.runtime?.permission?.defaultAction === "deny") {
      return "serial";
    }

    const mode = call.tool.runtime?.scheduler?.concurrency;

    if (!mode) {
      return "serial";
    }

    if (mode === "read-only") {
      return call.tool.effect === "read" ? "parallel-read" : "serial";
    }

    if (!this.allowScopedParallelism || hasUnknownScope(call.scopes) || call.scopes.length === 0) {
      return "serial";
    }

    return "parallel-scoped";
  }

  private canAddToBatch(batch: ToolScheduleBatch, call: ScheduledToolCall, safety: Safety): boolean {
    if (safety === "parallel-read") {
      return batch.calls.every((batchedCall) => this.classify(batchedCall) === "parallel-read");
    }

    return batch.calls.every(
      (batchedCall) =>
        this.classify(batchedCall) === "parallel-scoped" &&
        !resourceScopeSetsConflict(batchedCall.scopes, call.scopes)
    );
  }
}

function extractScopes(item: SchedulableToolCall): readonly ResourceScope[] {
  const resources = item.tool.runtime?.scheduler?.resources;
  if (!resources) {
    return [];
  }
  if (resources.mode === "none") {
    return [];
  }
  if (resources.mode === "extractor") {
    return resources.extract(item.call.input, item.call);
  }
  return resources.scopes;
}
