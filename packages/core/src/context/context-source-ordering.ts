import { ContextSourcePriority, type ContextSourceDescriptor } from "../contracts/context";

const PRIORITY_RANK: Record<ContextSourcePriority, number> = {
  [ContextSourcePriority.Critical]: 0,
  [ContextSourcePriority.High]: 1,
  [ContextSourcePriority.Medium]: 2,
  [ContextSourcePriority.Low]: 3
};

export function orderContextSources(sources: readonly ContextSourceDescriptor[]): ContextSourceDescriptor[] {
  return [...sources].sort((left, right) => {
    const priorityDelta = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    const leftIndex = firstIndex(left);
    const rightIndex = firstIndex(right);
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return left.id.localeCompare(right.id);
  });
}

function firstIndex(source: ContextSourceDescriptor): number {
  return source.messageIndexes?.[0] ?? Number.MAX_SAFE_INTEGER;
}
