import {
  ContextSourceKind,
  ContextSourcePriority,
  type ContextSourceDescriptor,
  type ReinjectionSource
} from "../contracts/context";
import { estimateTextTokens } from "./context-budgeter";

export type ReinjectionServiceOptions = {
  runtimeContextId: string;
};

export class ReinjectionService {
  private readonly runtimeContextId: string;

  constructor(options: ReinjectionServiceOptions) {
    this.runtimeContextId = options.runtimeContextId;
  }

  descriptorsFor(sources: readonly ReinjectionSource[]): ContextSourceDescriptor[] {
    return sources.map((source) => {
      if (source.runtimeContextId && source.runtimeContextId !== this.runtimeContextId) {
        return staleDescriptor(source);
      }
      return {
        id: source.id,
        kind: source.kind,
        priority: source.priority,
        provenance: {
          origin: "host",
          ...(source.metadata ? { metadata: source.metadata } : {})
        },
        tokenEstimate: { status: "estimated", tokens: estimateTextTokens(source.content ?? "") },
        ...(source.references ? { references: source.references } : {}),
        modelVisible: true,
        protected: source.kind === ContextSourceKind.PermissionMode,
        metadata: {
          ...(source.metadata ?? {}),
          ...(source.content !== undefined ? { content: source.content } : {})
        }
      };
    });
  }
}

function staleDescriptor(source: ReinjectionSource): ContextSourceDescriptor {
  return {
    id: source.id,
    kind: source.kind,
    priority: ContextSourcePriority.Low,
    provenance: { origin: "host", metadata: { stale: true, expectedRuntimeContextId: source.runtimeContextId } },
    tokenEstimate: { status: "estimated", tokens: 0 },
    modelVisible: false,
    metadata: { rejected: true, reason: "stale runtime context" }
  };
}
