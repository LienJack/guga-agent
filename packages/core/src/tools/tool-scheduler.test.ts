import { describe, expect, it } from "vitest";
import type { ToolCall } from "../contracts/messages";
import type { ToolSchedulerMetadata } from "../contracts/tool-runtime";
import type { ToolEffect } from "../contracts/tools";
import { pathScope } from "./resource-scope";
import { ToolScheduler, type SchedulableTool, type SchedulableToolCall } from "./tool-scheduler";

describe("ToolScheduler", () => {
  it("batches read-only calls together", () => {
    const batches = new ToolScheduler().createBatches([
      readCall("call-1", "read_file"),
      readCall("call-2", "list_files")
    ]);

    expect(batchIds(batches)).toEqual([["call-1", "call-2"]]);
    expect(batches[0]?.parallel).toBe(true);
  });

  it("serializes read calls without explicit scheduler metadata", () => {
    const batches = new ToolScheduler().createBatches([
      schedulable("call-1", "read_file", {}, "read"),
      schedulable("call-2", "list_files", {}, "read")
    ]);

    expect(batchIds(batches)).toEqual([["call-1"], ["call-2"]]);
    expect(batches.map((batch) => batch.parallel)).toEqual([false, false]);
  });

  it("batches disjoint path writes when scoped parallelism is allowed", () => {
    const batches = new ToolScheduler({ allowScopedParallelism: true }).createBatches([
      writeCall("call-1", "/workspace/a.txt"),
      writeCall("call-2", "/workspace/b.txt")
    ]);

    expect(batchIds(batches)).toEqual([["call-1", "call-2"]]);
    expect(batches[0]?.parallel).toBe(true);
  });

  it("serializes parent and child path write conflicts", () => {
    const batches = new ToolScheduler({ allowScopedParallelism: true }).createBatches([
      writeCall("call-1", "/workspace/src"),
      writeCall("call-2", "/workspace/src/file.ts")
    ]);

    expect(batchIds(batches)).toEqual([["call-1"], ["call-2"]]);
    expect(batches.map((batch) => batch.parallel)).toEqual([true, true]);
  });

  it("uses call arguments to resolve declarative path scopes", () => {
    const tool: ToolSchedulerMetadata = {
      concurrency: "resource-scoped",
      resources: {
        mode: "extractor",
        extract(input) {
          const path = typeof input === "object" && input && "path" in input ? String(input.path) : "";
          return [pathScope(path, "write")];
        }
      }
    };

    const batches = new ToolScheduler({ allowScopedParallelism: true }).createBatches([
      schedulable("call-1", "write_file", { path: "/workspace/a.txt" }, "write", tool),
      schedulable("call-2", "write_file", { path: "/workspace/b.txt" }, "write", tool)
    ]);

    expect(batchIds(batches)).toEqual([["call-1", "call-2"]]);
    expect(batches[0]?.calls.map((call) => call.scopes)).toEqual([
      [pathScope("/workspace/a.txt", "write")],
      [pathScope("/workspace/b.txt", "write")]
    ]);
  });

  it("falls back to serial execution for unknown scopes", () => {
    const batches = new ToolScheduler({ allowScopedParallelism: true }).createBatches([
      {
        call: call("call-1", "edit_file"),
        tool: {
          name: "edit_file",
          effect: "write",
          runtime: {
            scheduler: {
              concurrency: "resource-scoped",
              resources: { mode: "none" }
            }
          }
        }
      },
      writeCall("call-2", "/workspace/b.txt")
    ]);

    expect(batchIds(batches)).toEqual([["call-1"], ["call-2"]]);
    expect(batches[0]?.parallel).toBe(false);
  });

  it("serializes ask-required and interactive calls before permission resolution", () => {
    const batches = new ToolScheduler({ allowScopedParallelism: true }).createBatches([
      readCall("call-1", "read_file"),
      schedulable(
        "call-2",
        "shell",
        {},
        "execute",
        { concurrency: "serial", resources: { mode: "none" } },
        { permission: { defaultAction: "ask" }, executionMode: "interactive" }
      ),
      readCall("call-3", "list_files")
    ]);

    expect(batchIds(batches)).toEqual([["call-1"], ["call-2"], ["call-3"]]);
    expect(batches.map((batch) => batch.parallel)).toEqual([true, false, true]);
  });

  it("keeps writes serial by default without scoped parallelism", () => {
    const batches = new ToolScheduler().createBatches([
      writeCall("call-1", "/workspace/a.txt"),
      writeCall("call-2", "/workspace/b.txt")
    ]);

    expect(batchIds(batches)).toEqual([["call-1"], ["call-2"]]);
    expect(batches.every((batch) => batch.calls.length === 1)).toBe(true);
  });

  it("does not mix unscoped read batches with scoped writes", () => {
    const batches = new ToolScheduler({ allowScopedParallelism: true }).createBatches([
      readCall("call-1", "list_files"),
      writeCall("call-2", "/workspace/a.txt")
    ]);

    expect(batchIds(batches)).toEqual([["call-1"], ["call-2"]]);
  });
});

function readCall(id: string, name: string, overrides: Partial<SchedulableTool["runtime"]> = {}): SchedulableToolCall {
  return schedulable(id, name, {}, "read", { concurrency: "read-only", resources: { mode: "none" } }, overrides);
}

function writeCall(id: string, path: string): SchedulableToolCall {
  return schedulable(id, "write_file", { path }, "write", {
    concurrency: "resource-scoped",
    resources: { mode: "static", scopes: [pathScope(path, "write")] }
  });
}

function schedulable(
  id: string,
  name: string,
  input: unknown,
  effect: ToolEffect,
  scheduler?: ToolSchedulerMetadata,
  runtime: Partial<SchedulableTool["runtime"]> = {}
): SchedulableToolCall {
  return {
    call: call(id, name, input),
    tool: {
      name,
      effect,
      runtime: scheduler ? { ...runtime, scheduler } : runtime
    }
  };
}

function call(id: string, name: string, input: unknown = {}): ToolCall {
  return { id, name, input };
}

function batchIds(batches: ReturnType<ToolScheduler["createBatches"]>): string[][] {
  return batches.map((batch) => batch.calls.map((item) => item.call.id));
}
