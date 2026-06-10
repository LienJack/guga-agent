import { ContextSourceKind, type CompactionSummaryFields, type ContextSourceDescriptor, type ContextSourceReference, type ModelInputProjection, type StateProjectionItem, type AccountableTraceItem } from "../contracts/context";

export function localSkeletonSummary(projection: ModelInputProjection): CompactionSummaryFields {
  const stateItems = stateProjectionItems(projection.sourceDescriptors);
  const traceItems = accountableTraceItems(projection.sourceDescriptors);
  return {
    objective: firstReferencedMessage(projection, stateItems.filter((item) => item.kind === "objective")) ??
      firstUserMessage(projection) ??
      "unknown",
    completedWork: traceItems
      .filter((item) => item.kind === "action" || item.kind === "observation" || item.kind === "validation")
      .map((item) => item.label),
    currentBlockers: traceItems
      .filter((item) => item.kind === "validation" && item.label.toLowerCase().includes("error"))
      .map((item) => item.label),
    nextSteps: referencedMessages(projection, stateItems.filter((item) => item.kind === "next_step")),
    keyFilesAndSymbols: keyReferences(projection).map((reference) => reference.label ?? reference.id),
    toolResultReferences: toolReferences(projection),
    unresolvedQuestions: referencedMessages(projection, stateItems.filter((item) => item.kind === "open_question")),
    userConstraints: referencedMessages(projection, stateItems.filter((item) => item.kind === "constraint"))
  };
}

function firstUserMessage(projection: ModelInputProjection): string | undefined {
  return projection.messages.find((message) => message.role === "user")?.content;
}

function keyReferences(projection: ModelInputProjection): ContextSourceReference[] {
  return projection.sourceDescriptors.flatMap((source) => source.references ?? []);
}

function toolReferences(projection: ModelInputProjection): ContextSourceReference[] {
  return keyReferences(projection).filter((reference) => reference.type === "tool-result");
}

function stateProjectionItems(sources: readonly ContextSourceDescriptor[]): StateProjectionItem[] {
  return sources
    .filter((source) => source.kind === ContextSourceKind.StateProjection)
    .flatMap((source) => metadataItems(source.metadata))
    .filter(isStateProjectionItem);
}

function accountableTraceItems(sources: readonly ContextSourceDescriptor[]): AccountableTraceItem[] {
  return sources
    .filter((source) => source.kind === ContextSourceKind.AccountableTrace)
    .flatMap((source) => metadataItems(source.metadata))
    .filter(isAccountableTraceItem);
}

function metadataItems(metadata: ContextSourceDescriptor["metadata"]): unknown[] {
  const items = metadata?.items;
  return Array.isArray(items) ? items : [];
}

function firstReferencedMessage(projection: ModelInputProjection, items: readonly StateProjectionItem[]): string | undefined {
  return referencedMessages(projection, items).at(0);
}

function referencedMessages(projection: ModelInputProjection, items: readonly StateProjectionItem[]): string[] {
  const values = items.flatMap((item) =>
    (item.sourceRefs ?? [])
      .filter((reference) => reference.type === "message")
      .map((reference) => messageContentForReference(projection, reference))
      .filter((content): content is string => typeof content === "string" && content.trim().length > 0)
  );
  return Array.from(new Set(values));
}

function messageContentForReference(
  projection: ModelInputProjection,
  reference: ContextSourceReference
): string | undefined {
  const index = Number(reference.id.replace(/^message-/, ""));
  if (!Number.isInteger(index) || index < 0) {
    return undefined;
  }
  const message = projection.messages[index];
  if (!message || (message.role !== "user" && message.role !== "system")) {
    return undefined;
  }
  return message.content;
}

function isStateProjectionItem(input: unknown): input is StateProjectionItem {
  return isRecord(input) && typeof input.kind === "string" && typeof input.label === "string";
}

function isAccountableTraceItem(input: unknown): input is AccountableTraceItem {
  return isRecord(input) && typeof input.kind === "string" && typeof input.label === "string";
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
