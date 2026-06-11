import {
  ContextSourceKind,
  ContextSourcePriority,
  type AccountableTraceItem,
  type AccountableTraceMetadata,
  type ContextPolicyDecision,
  type ContextSourceDescriptor,
  type ContextSourceReference,
  type ModelInputProjection
} from "../contracts/context";
import type { CoreMessage } from "../contracts/messages";
import { estimateTextTokens } from "./context-budgeter";

export type BuildAccountableTraceSourceOptions = {
  id?: string;
  modelVisible?: boolean;
  priority?: typeof ContextSourcePriority.High | typeof ContextSourcePriority.Medium | typeof ContextSourcePriority.Low;
};

export function buildAccountableTraceSource(
  projection: ModelInputProjection,
  options: BuildAccountableTraceSourceOptions = {}
): ContextSourceDescriptor | undefined {
  const items = [
    ...messageTraceItems(projection.messages),
    ...sourceTraceItems(projection.sourceDescriptors),
    ...decisionTraceItems(projection.policyDecisions),
    ...pressureTraceItems(projection)
  ];
  if (items.length === 0) {
    return undefined;
  }

  const generatedFromDecisionIds = unique(projection.policyDecisions.map((decision) => decision.id));
  const generatedFromSourceIds = unique(
    items.flatMap((item) => item.sourceRefs?.map((reference) => reference.id) ?? [])
  );
  const references = uniqueReferences(items.flatMap((item) => item.sourceRefs ?? []));
  const metadata: AccountableTraceMetadata = {
    ontology: ContextSourceKind.AccountableTrace,
    sensitivity: "internal",
    confidence: "medium",
    scope: "run",
    intendedUsage: ["audit", "replay", "compaction-continuity"],
    generatedFromDecisionIds,
    generatedFromSourceIds,
    items
  };

  return {
    id: options.id ?? `trace-${projection.id}`,
    kind: ContextSourceKind.AccountableTrace,
    priority: options.priority ?? ContextSourcePriority.Medium,
    provenance: { origin: "core" },
    tokenEstimate: { status: "estimated", tokens: estimateTextTokens(JSON.stringify(items)) },
    contentHash: stableHash(JSON.stringify({ generatedFromDecisionIds, generatedFromSourceIds, items })),
    ...(references.length > 0 ? { references } : {}),
    modelVisible: options.modelVisible ?? false,
    metadata
  };
}

function messageTraceItems(messages: readonly CoreMessage[]): AccountableTraceItem[] {
  const items: AccountableTraceItem[] = [];
  messages.forEach((message, index) => {
    if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
      items.push(traceItem("action", "assistant requested tool action", [messageReference(index, "assistant tool action")], "medium"));
    }
    if (message.role === "tool") {
      items.push(traceItem(
        message.isError ? "validation" : "observation",
        message.isError ? "tool returned error observation" : "tool returned observation",
        [messageReference(index, "tool observation")],
        "medium"
      ));
    }
  });
  return items;
}

function sourceTraceItems(sources: readonly ContextSourceDescriptor[]): AccountableTraceItem[] {
  return sources.flatMap((source) =>
    (source.references ?? []).map((reference) =>
      traceItem("evidence", `source evidence: ${source.kind}`, [reference], "low")
    )
  );
}

function decisionTraceItems(decisions: readonly ContextPolicyDecision[]): AccountableTraceItem[] {
  return decisions.map((decision) =>
    traceItem("decision", `context decision: ${decision.kind}`, [decisionReference(decision)], "medium")
  );
}

function pressureTraceItems(projection: ModelInputProjection): AccountableTraceItem[] {
  if (projection.pressure.level === "none") {
    return [];
  }
  return [
    traceItem("observation", `context pressure: ${projection.pressure.level}`, [{
      type: "host-reference",
      id: projection.pressure.id,
      label: "context pressure decision"
    }], "medium")
  ];
}

function traceItem(
  kind: AccountableTraceItem["kind"],
  label: string,
  sourceRefs: ContextSourceReference[],
  confidence: AccountableTraceItem["confidence"]
): AccountableTraceItem {
  return {
    kind,
    label,
    sensitivity: "internal",
    confidence,
    scope: "run",
    intendedUsage: ["audit", "replay"],
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

function decisionReference(decision: ContextPolicyDecision): ContextSourceReference {
  return {
    type: "host-reference",
    id: decision.id,
    label: `${decision.phase}:${decision.kind}`
  };
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
