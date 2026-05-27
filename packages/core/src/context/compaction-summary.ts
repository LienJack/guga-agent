import type { CompactionSummaryFields, ContextSourceReference, ModelInputProjection } from "../contracts/context";

export function localSkeletonSummary(projection: ModelInputProjection): CompactionSummaryFields {
  return {
    objective: firstUserMessage(projection) ?? "unknown",
    completedWork: [],
    currentBlockers: [],
    nextSteps: [],
    keyFilesAndSymbols: keyReferences(projection).map((reference) => reference.label ?? reference.id),
    toolResultReferences: toolReferences(projection),
    unresolvedQuestions: [],
    userConstraints: []
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
