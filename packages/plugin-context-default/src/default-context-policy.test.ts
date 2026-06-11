import { describe, expect, it } from "vitest";
import { ContextSourceKind, HookPhase } from "@guga-agent/core";
import { DEFAULT_CONTEXT_POLICY_ID, defaultContextHooks, defaultContextPolicy } from "./default-context-policy";

describe("default context policy", () => {
  it("declares all M4 context phases and default compaction values", () => {
    const policy = defaultContextPolicy("plugin-context");

    expect(policy.id).toBe(DEFAULT_CONTEXT_POLICY_ID);
    expect(policy.phases).toContain("context.compact.before");
    expect(policy.metadata?.compaction).toMatchObject({
      warningThreshold: 0.7,
      compactThreshold: 0.85,
      summaryStripRetryLimit: 3
    });
    expect(policy.metadata?.attentionOS).toMatchObject({
      sourceCategories: expect.arrayContaining(Object.values(ContextSourceKind)),
      mutatesFacts: false,
      promotesMemoryCandidates: false,
      reinjectionAuthority: "below-system-and-developer"
    });
  });

  it("provides auditable context hook decisions", async () => {
    const hooks = defaultContextHooks("plugin-context");
    const compact = hooks.find((hook) => hook.phase === HookPhase.ContextCompactBefore);
    const discover = hooks.find((hook) => hook.phase === HookPhase.ResourcesDiscover);
    const truncate = hooks.find((hook) => hook.phase === HookPhase.ContextTruncate);
    const compactAfter = hooks.find((hook) => hook.phase === HookPhase.ContextCompactAfter);
    const decision = await Promise.resolve(compact?.handler({ runId: "run", runtimeContextId: "runtime" }));
    const discovered = await Promise.resolve(discover?.handler({ runId: "run", runtimeContextId: "runtime" }));

    expect(decision).toMatchObject({
      kind: "gate",
      allowed: true,
      pluginId: "plugin-context"
    });
    expect(discovered).toMatchObject({
      kind: "source-contribution",
      metadata: {
        sources: [expect.objectContaining({ kind: "host_context" })]
      }
    });
    expect(truncate).toBeDefined();
    expect(compactAfter).toBeDefined();
  });
});
