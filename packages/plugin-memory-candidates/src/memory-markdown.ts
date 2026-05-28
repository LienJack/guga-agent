import { scanMemoryCandidateContent, type MemoryCandidateKind, type MemoryCandidateScope } from "./memory-candidates";
import type { GovernedMemoryItem } from "./memory-governance";

export type RenderCuratedMemoryMarkdownOptions = {
  scopes?: MemoryCandidateScope[];
  kinds?: MemoryCandidateKind[];
  maxItems?: number;
  maxContentChars?: number;
  includeSourceRefs?: boolean;
  includeTags?: boolean;
  title?: string;
};

export function renderCuratedMemoryMarkdown(
  items: readonly GovernedMemoryItem[],
  options: RenderCuratedMemoryMarkdownOptions = {}
): string {
  const title = options.title ?? "Curated Memory";
  const maxItems = options.maxItems ?? 50;
  const maxContentChars = options.maxContentChars ?? 280;
  const renderable = items
    .filter((item) => item.status === "active")
    .filter((item) => item.safety.status === "safe" && scanMemoryCandidateContent(item.content).status === "safe")
    .filter((item) => !options.scopes || options.scopes.includes(item.scope))
    .filter((item) => !options.kinds || options.kinds.includes(item.kind))
    .sort(compareItems)
    .slice(0, maxItems);

  if (renderable.length === 0) {
    return `# ${title}\n\nNo active safe memory items.`;
  }

  const lines = [`# ${title}`, ""];
  let currentGroup = "";
  for (const item of renderable) {
    const group = `${item.scope} / ${item.kind}`;
    if (group !== currentGroup) {
      currentGroup = group;
      lines.push(`## ${group}`, "");
    }
    lines.push(`- ${truncate(item.content, maxContentChars)}`);
    lines.push(`  - confidence: ${item.confidence.toFixed(2)}`);
    lines.push(`  - importance: ${item.importance.toFixed(2)}`);
    if (options.includeTags && item.tags && item.tags.length > 0) {
      lines.push(`  - tags: ${item.tags.join(", ")}`);
    }
    if (options.includeSourceRefs) {
      lines.push(`  - sources: ${item.sourceRefs.map((ref) => ref.eventId).join(", ")}`);
    }
  }
  return lines.join("\n");
}

function compareItems(left: GovernedMemoryItem, right: GovernedMemoryItem): number {
  return (
    left.scope.localeCompare(right.scope) ||
    left.kind.localeCompare(right.kind) ||
    right.importance - left.importance ||
    left.createdAt.localeCompare(right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function truncate(content: string, maxContentChars: number): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.length <= maxContentChars ? normalized : `${normalized.slice(0, Math.max(0, maxContentChars - 3))}...`;
}
