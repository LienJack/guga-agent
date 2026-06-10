import {
  ContextSourceKind,
  ContextSourcePriority,
  type ContextSourceDescriptor,
  type ContextSourceReference,
  type ModelInputProjection,
  type StateProjectionItem,
  type StateProjectionMetadata
} from "../contracts/context";
import type { CoreMessage } from "../contracts/messages";
import { estimateTextTokens } from "./context-budgeter";

export type BuildStateProjectionSourceOptions = {
  id?: string;
  modelVisible?: boolean;
  priority?: typeof ContextSourcePriority.High | typeof ContextSourcePriority.Medium | typeof ContextSourcePriority.Low;
};

export function buildStateProjectionSource(
  projection: ModelInputProjection,
  options: BuildStateProjectionSourceOptions = {}
): ContextSourceDescriptor | undefined {
  const items = [
    ...messageStateItems(projection.messages),
    ...referenceStateItems(projection.sourceDescriptors)
  ];
  if (items.length === 0) {
    return undefined;
  }

  const generatedFromSourceIds = unique(
    items.flatMap((item) => item.sourceRefs?.map((reference) => reference.id) ?? [])
  );
  const references = uniqueReferences(items.flatMap((item) => item.sourceRefs ?? []));
  const metadata: StateProjectionMetadata = {
    ontology: ContextSourceKind.StateProjection,
    sensitivity: "internal",
    confidence: "medium",
    scope: "run",
    intendedUsage: ["compaction-continuity", "audit", "replay"],
    generatedFromSourceIds,
    items
  };

  return {
    id: options.id ?? `state-${projection.id}`,
    kind: ContextSourceKind.StateProjection,
    priority: options.priority ?? ContextSourcePriority.High,
    provenance: { origin: "core" },
    tokenEstimate: { status: "estimated", tokens: estimateTextTokens(JSON.stringify(items)) },
    contentHash: stableHash(JSON.stringify({ generatedFromSourceIds, items })),
    ...(references.length > 0 ? { references } : {}),
    modelVisible: options.modelVisible ?? false,
    metadata
  };
}

function messageStateItems(messages: readonly CoreMessage[]): StateProjectionItem[] {
  const items: StateProjectionItem[] = [];
  const firstUserIndex = messages.findIndex((message) => message.role === "user" && message.content.trim().length > 0);
  if (firstUserIndex >= 0) {
    items.push(item("objective", "initial user objective", [messageReference(firstUserIndex, "initial user objective")], "high"));
  }

  const latestUserIndex = lastIndex(messages, (message) => message.role === "user" && message.content.trim().length > 0);
  if (latestUserIndex >= 0 && latestUserIndex !== firstUserIndex) {
    items.push(item("next_step", "latest user turn", [messageReference(latestUserIndex, "latest user turn")], "medium"));
  }

  messages.forEach((message, index) => {
    if (message.role === "user" && hasConstraintSignal(message.content)) {
      items.push(item("constraint", "explicit user constraint", [messageReference(index, "user constraint")], "medium"));
    }
    if (message.role === "user" && hasQuestionSignal(message.content)) {
      items.push(item("open_question", "explicit open question", [messageReference(index, "open question")], "medium"));
    }
    if (message.role === "tool" && message.isError) {
      items.push(item("validation", "tool error observation", [messageReference(index, "tool error")], "medium"));
    }
  });

  return items;
}

function referenceStateItems(sources: readonly ContextSourceDescriptor[]): StateProjectionItem[] {
  return sources.flatMap((source) =>
    (source.references ?? []).map((reference) => {
      if (reference.type === "artifact" || source.kind === ContextSourceKind.ArtifactReference) {
        return item("artifact", "artifact reference", [reference], "medium");
      }
      if (reference.type === "resource" || source.kind === ContextSourceKind.ResourceFile) {
        return item("active_resource", "active resource reference", [reference], "medium");
      }
      return item("key_fact", "referenced evidence", [reference], "low");
    })
  );
}

function item(
  kind: StateProjectionItem["kind"],
  label: string,
  sourceRefs: ContextSourceReference[],
  confidence: StateProjectionItem["confidence"]
): StateProjectionItem {
  return {
    kind,
    label,
    sensitivity: "internal",
    confidence,
    scope: "run",
    intendedUsage: ["compaction-continuity", "audit"],
    sourceRefs
  };
}

function messageReference(index: number, label: string): ContextSourceReference {
  return {
    type: "message",
    id: `message-${index}`,
    label
  };
}

function hasConstraintSignal(content: string): boolean {
  return /\b(must|must not|do not|don't|cannot|never|always|required|forbidden)\b/i.test(content) ||
    /不要|不能|必须|不得|禁止/u.test(content);
}

function hasQuestionSignal(content: string): boolean {
  return content.includes("?") || content.includes("？");
}

function lastIndex<T>(values: readonly T[], predicate: (value: T) => boolean): number {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (predicate(values[index] as T)) {
      return index;
    }
  }
  return -1;
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function uniqueReferences(references: readonly ContextSourceReference[]): ContextSourceReference[] {
  const seen = new Set<string>();
  const uniqueRefs: ContextSourceReference[] = [];
  for (const reference of references) {
    const key = `${reference.type}:${reference.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueRefs.push(reference);
    }
  }
  return uniqueRefs;
}

function stableHash(input: string): string {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
