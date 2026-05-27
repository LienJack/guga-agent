export type ResearchSourceLayer =
  | "context-pack"
  | "graph"
  | "understand-anything"
  | "source-analysis"
  | "repomix-token-tree"
  | "repomix-packed-context"
  | "raw-source";

export type ResearchSourcePolicyItem = {
  layer: ResearchSourceLayer;
  rank: number;
  description: string;
};

export const defaultResearchSourcePolicy: ResearchSourcePolicyItem[] = [
  { layer: "context-pack", rank: 1, description: "Curated topic context packs" },
  { layer: "graph", rank: 2, description: "Graphify concept graphs" },
  { layer: "understand-anything", rank: 3, description: "Understand-Anything architecture graphs" },
  { layer: "source-analysis", rank: 4, description: "Human-written source analysis" },
  { layer: "repomix-token-tree", rank: 5, description: "Repomix token trees for candidate paths" },
  { layer: "repomix-packed-context", rank: 6, description: "Packed context snippets for source confirmation" },
  { layer: "raw-source", rank: 7, description: "Raw source files as last resort" }
];

export function classifyResearchSource(path: string): ResearchSourceLayer {
  if (path.includes("context-packs/")) {
    return "context-pack";
  }
  if (path.includes("graphify-out/") || path.includes("docs/research/graphs/")) {
    return "graph";
  }
  if (path.includes(".understand-anything/")) {
    return "understand-anything";
  }
  if (path.includes("source-analysis/")) {
    return "source-analysis";
  }
  if (path.includes("repomix/") && path.endsWith("token-tree.txt")) {
    return "repomix-token-tree";
  }
  if (path.includes("repomix/") && (path.endsWith(".xml") || path.includes("context"))) {
    return "repomix-packed-context";
  }
  return "raw-source";
}

export function sortSourcesByPolicy(paths: string[]): string[] {
  const rankByLayer = new Map(defaultResearchSourcePolicy.map((item) => [item.layer, item.rank]));
  return [...paths].sort((left, right) => {
    const leftRank = rankByLayer.get(classifyResearchSource(left)) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = rankByLayer.get(classifyResearchSource(right)) ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank || left.localeCompare(right);
  });
}
