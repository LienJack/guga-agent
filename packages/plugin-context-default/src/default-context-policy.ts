import {
  ContextSourceKind,
  ContextSourcePriority,
  DEFAULT_COMPACTION_POLICY,
  HookEffect,
  HookPhase,
  type ContextPolicy,
  type ContextHookRegistration
} from "@guga-agent/core";

export const DEFAULT_CONTEXT_POLICY_ID = "guga-default-context-policy";

export function defaultContextPolicy(pluginId: string): ContextPolicy {
  return {
    id: DEFAULT_CONTEXT_POLICY_ID,
    name: "Guga Default Context Policy",
    phases: [
      "resources.discover",
      "context.assemble",
      "context.budget",
      "context.truncate",
      "context.compact.before",
      "context.compact.after",
      "context.reinject"
    ],
    priority: 0,
    timeoutMs: 1000,
    permissionScope: "context-write",
    auditIdentity: {
      pluginId,
      packageName: "@guga-agent/plugin-context-default",
      label: "Guga default context policy"
    },
    metadata: {
      compaction: DEFAULT_COMPACTION_POLICY,
      futureSplitPoints: ["basic", "tool-results", "truncation", "compaction", "reinjection"]
    }
  };
}

export function defaultContextHooks(pluginId: string): ContextHookRegistration[] {
  return [
    {
      id: "default-resources-discover",
      phase: HookPhase.ResourcesDiscover,
      effect: HookEffect.Patch,
      handler() {
        return {
          id: `${pluginId}-resources-discover`,
          kind: "source-contribution",
          phase: HookPhase.ResourcesDiscover,
          pluginId,
          sourceIds: ["default-policy-host-context"],
          reason: "default context policy contributes host/runtime context as a replaceable source",
          metadata: {
            sources: [{
              id: "default-policy-host-context",
              kind: ContextSourceKind.HostContext,
              priority: ContextSourcePriority.Low,
              provenance: {
                origin: "plugin",
                pluginId,
                metadata: { policyId: DEFAULT_CONTEXT_POLICY_ID }
              },
              tokenEstimate: { status: "estimated", tokens: 8 },
              contentHash: "default-policy-host-context",
              modelVisible: true,
              metadata: {
                content: "Default context policy is active."
              }
            }]
          }
        };
      }
    },
    {
      id: "default-context-assemble",
      phase: HookPhase.ContextAssemble,
      effect: HookEffect.Annotate,
      handler(context) {
        return {
          id: `${pluginId}-assemble`,
          kind: "annotation",
          phase: HookPhase.ContextAssemble,
          pluginId,
          sourceIds: context.sources?.map((source) => source.id) ?? [],
          reason: "default context policy observed source assembly"
        };
      }
    },
    {
      id: "default-context-budget",
      phase: HookPhase.ContextBudget,
      effect: HookEffect.Annotate,
      handler(context) {
        return {
          id: `${pluginId}-budget`,
          kind: "annotation",
          phase: HookPhase.ContextBudget,
          pluginId,
          sourceIds: context.projection?.sourceDescriptors.map((source) => source.id) ?? [],
          reason: "default thresholds are active",
          metadata: DEFAULT_COMPACTION_POLICY
        };
      }
    },
    {
      id: "default-context-truncate",
      phase: HookPhase.ContextTruncate,
      effect: HookEffect.Annotate,
      handler(context) {
        return {
          id: `${pluginId}-truncate`,
          kind: "annotation",
          phase: HookPhase.ContextTruncate,
          pluginId,
          sourceIds: context.sources?.map((source) => source.id) ?? [],
          reason: "default context policy observed truncation candidates"
        };
      }
    },
    {
      id: "default-compact-before",
      phase: HookPhase.ContextCompactBefore,
      effect: HookEffect.Gate,
      control: { permissionScope: "compaction-gate" },
      handler(context) {
        return {
          id: `${pluginId}-compact-before`,
          kind: "gate",
          phase: HookPhase.ContextCompactBefore,
          pluginId,
          allowed: true,
          reason: "default policy allows pairing-safe compaction"
        };
      }
    },
    {
      id: "default-compact-after",
      phase: HookPhase.ContextCompactAfter,
      effect: HookEffect.Annotate,
      handler(context) {
        return {
          id: `${pluginId}-compact-after`,
          kind: "annotation",
          phase: HookPhase.ContextCompactAfter,
          pluginId,
          sourceIds: context.compaction?.boundary.retainedSourceIds ?? [],
          reason: "default context policy observed completed compaction",
          metadata: {
            boundaryId: context.compaction?.boundary.id,
            degradedTo: context.compaction?.degradedTo
          }
        };
      }
    },
    {
      id: "default-reinject",
      phase: HookPhase.ContextReinject,
      effect: HookEffect.Annotate,
      handler(context) {
        return {
          id: `${pluginId}-reinject`,
          kind: "reinjection",
          phase: HookPhase.ContextReinject,
          sourceIds: context.reinjectionSources?.map((source) => source.id) ?? [],
          reason: "default policy keeps reinjected sources below system/developer authority",
          pluginId
        };
      }
    }
  ];
}
