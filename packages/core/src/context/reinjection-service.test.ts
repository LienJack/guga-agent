import { describe, expect, it } from "vitest";
import { ContextSourceKind, ContextSourcePriority } from "../contracts/context";
import { ReinjectionService } from "./reinjection-service";

describe("ReinjectionService", () => {
  it("converts active state into model-visible non-system sources", () => {
    const service = new ReinjectionService({ runtimeContextId: "runtime-1" });
    const descriptors = service.descriptorsFor([
      {
        id: "plan",
        kind: ContextSourceKind.PlanTodo,
        priority: ContextSourcePriority.High,
        content: "next: run tests",
        runtimeContextId: "runtime-1"
      }
    ]);

    expect(descriptors[0]).toMatchObject({
      id: "plan",
      kind: ContextSourceKind.PlanTodo,
      priority: ContextSourcePriority.High,
      modelVisible: true
    });
  });

  it("rejects stale runtime context reinjection sources", () => {
    const service = new ReinjectionService({ runtimeContextId: "runtime-current" });
    const descriptors = service.descriptorsFor([
      {
        id: "old-host",
        kind: ContextSourceKind.HostContext,
        priority: ContextSourcePriority.Medium,
        content: "old",
        runtimeContextId: "runtime-old"
      }
    ]);

    expect(descriptors[0]).toMatchObject({
      id: "old-host",
      modelVisible: false,
      metadata: { rejected: true, reason: "stale runtime context" }
    });
  });

  it("allows current state and trace continuity as non-critical reinjection descriptors", () => {
    const service = new ReinjectionService({ runtimeContextId: "runtime-1" });
    const descriptors = service.descriptorsFor([
      {
        id: "state-current",
        kind: ContextSourceKind.StateProjection,
        priority: ContextSourcePriority.High,
        content: "State continuity",
        runtimeContextId: "runtime-1"
      },
      {
        id: "trace-current",
        kind: ContextSourceKind.AccountableTrace,
        priority: ContextSourcePriority.Medium,
        content: "Trace continuity",
        runtimeContextId: "runtime-1"
      }
    ]);

    expect(descriptors).toEqual([
      expect.objectContaining({
        id: "state-current",
        kind: ContextSourceKind.StateProjection,
        priority: ContextSourcePriority.High,
        modelVisible: true,
        protected: false
      }),
      expect.objectContaining({
        id: "trace-current",
        kind: ContextSourceKind.AccountableTrace,
        priority: ContextSourcePriority.Medium,
        modelVisible: true,
        protected: false
      })
    ]);
  });
});
