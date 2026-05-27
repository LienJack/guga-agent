import { scanMemoryCandidateContent, type MemoryCandidateKind, type MemoryCandidateScope } from "./memory-candidates";
import type { GovernedMemoryItem } from "./memory-governance";

export type MemoryRetrievalDiagnostic = {
  code: string;
  message: string;
};

export type MemoryRetrievalOptions = {
  scope: MemoryCandidateScope;
  kind?: MemoryCandidateKind;
  tags?: string[];
  includeSuperseded?: boolean;
  maxResults?: number;
};

export type MemoryRetrievalResult = {
  item: GovernedMemoryItem;
  score: number;
  matchedTerms: string[];
  reasons: string[];
};

export type MemoryRetrievalResponse = {
  results: MemoryRetrievalResult[];
  diagnostics: MemoryRetrievalDiagnostic[];
};

export type RenderMemoryRetrievalOptions = {
  maxItems?: number;
  maxContentChars?: number;
  includeReasons?: boolean;
  includeSourceRefs?: boolean;
  title?: string;
};

export function searchGovernedMemoryItems(
  items: readonly GovernedMemoryItem[],
  query: string,
  options: MemoryRetrievalOptions
): MemoryRetrievalResponse {
  const diagnostics: MemoryRetrievalDiagnostic[] = [];
  if (!options.scope) {
    diagnostics.push({ code: "MEMORY_RETRIEVAL_SCOPE_REQUIRED", message: "Memory retrieval requires an explicit scope" });
  }
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) {
    diagnostics.push({ code: "MEMORY_RETRIEVAL_QUERY_REQUIRED", message: "Memory retrieval query must contain searchable terms" });
  }
  if (diagnostics.length > 0) {
    return { results: [], diagnostics };
  }

  const results = items
    .filter((item) => item.scope === options.scope)
    .filter((item) => options.includeSuperseded || item.status === "active")
    .filter((item) => item.safety.status === "safe" && scanMemoryCandidateContent(item.content).status === "safe")
    .filter((item) => options.kind === undefined || item.kind === options.kind)
    .filter((item) => tagsMatch(item.tags, options.tags))
    .map((item) => scoreItem(item, queryTerms, options))
    .filter((result) => result.score > 0)
    .sort(compareResults)
    .slice(0, options.maxResults ?? 8);

  return { results, diagnostics };
}

export function renderMemoryRetrievalBlock(
  results: readonly MemoryRetrievalResult[],
  options: RenderMemoryRetrievalOptions = {}
): string {
  const maxItems = options.maxItems ?? 8;
  const maxContentChars = options.maxContentChars ?? 240;
  const title = options.title ?? "Memory Retrieval";
  const renderable = results
    .filter((result) => result.item.status === "active" && result.item.safety.status === "safe" && scanMemoryCandidateContent(result.item.content).status === "safe")
    .sort(compareResults)
    .slice(0, maxItems);

  if (renderable.length === 0) {
    return `## ${title}\n\nNo matching active safe memory items.`;
  }

  const lines = renderable.map((result) => {
    const source = options.includeSourceRefs
      ? ` [source:${result.item.sourceRefs.map((ref) => ref.eventId).join(",")}]`
      : "";
    const reasons = options.includeReasons ? ` [reason:${result.reasons.join(",")}]` : "";
    return `- (${result.item.scope}/${result.item.kind}, ${result.score.toFixed(2)}) ${truncate(result.item.content, maxContentChars)}${source}${reasons}`;
  });
  return [`## ${title}`, "", ...lines].join("\n");
}

function scoreItem(item: GovernedMemoryItem, queryTerms: readonly string[], options: MemoryRetrievalOptions): MemoryRetrievalResult {
  const contentTerms = new Set(tokenize(`${item.content} ${item.kind} ${(item.tags ?? []).join(" ")}`));
  const matchedTerms = queryTerms.filter((term) => contentTerms.has(term));
  const tagMatches = (item.tags ?? []).filter((tag) => queryTerms.includes(tag.toLowerCase()));
  const kindMatch = queryTerms.includes(item.kind);
  const reasons = [
    ...(matchedTerms.length > 0 ? [`term:${matchedTerms.join("|")}`] : []),
    ...(kindMatch ? [`kind:${item.kind}`] : []),
    ...(tagMatches.length > 0 ? [`tag:${tagMatches.join("|")}`] : []),
    ...(options.kind ? [`filter-kind:${options.kind}`] : []),
    ...(options.tags && options.tags.length > 0 ? [`filter-tags:${options.tags.join("|")}`] : [])
  ];
  const score =
    matchedTerms.length * 10 +
    tagMatches.length * 3 +
    (kindMatch ? 2 : 0) +
    item.importance * 2 +
    item.confidence;

  return {
    item,
    score,
    matchedTerms,
    reasons
  };
}

function compareResults(left: MemoryRetrievalResult, right: MemoryRetrievalResult): number {
  return right.score - left.score || right.item.importance - left.item.importance || left.item.createdAt.localeCompare(right.item.createdAt) || left.item.id.localeCompare(right.item.id);
}

function tokenize(input: string): string[] {
  return Array.from(new Set(input.toLowerCase().match(/[a-z0-9_]+/g) ?? []));
}

function tagsMatch(itemTags: readonly string[] | undefined, filterTags: readonly string[] | undefined): boolean {
  if (!filterTags || filterTags.length === 0) {
    return true;
  }
  const tags = new Set((itemTags ?? []).map((tag) => tag.toLowerCase()));
  return filterTags.every((tag) => tags.has(tag.toLowerCase()));
}

function truncate(content: string, maxContentChars: number): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.length <= maxContentChars ? normalized : `${normalized.slice(0, Math.max(0, maxContentChars - 3))}...`;
}
