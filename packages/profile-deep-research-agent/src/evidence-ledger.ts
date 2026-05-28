export type EvidenceStrength = "Fact" | "Inference" | "Pending Verification";

export type EvidenceItem = {
  id: string;
  claim: string;
  strength: EvidenceStrength;
  source: string;
  summary: string;
  capturedAt: string;
  confidence: number;
};

export type EvidenceLedger = {
  items: EvidenceItem[];
};

export function createEvidenceLedger(items: EvidenceItem[]): EvidenceLedger {
  return {
    items: [...items].sort((left, right) => left.id.localeCompare(right.id))
  };
}

export function evidenceByStrength(ledger: EvidenceLedger): Record<EvidenceStrength, EvidenceItem[]> {
  return {
    Fact: ledger.items.filter((item) => item.strength === "Fact"),
    Inference: ledger.items.filter((item) => item.strength === "Inference"),
    "Pending Verification": ledger.items.filter((item) => item.strength === "Pending Verification")
  };
}

export function validateEvidenceLedger(ledger: EvidenceLedger): string[] {
  const diagnostics: string[] = [];
  const ids = new Set<string>();
  for (const item of ledger.items) {
    if (ids.has(item.id)) {
      diagnostics.push(`Duplicate evidence id: ${item.id}`);
    }
    ids.add(item.id);
    if (item.confidence < 0 || item.confidence > 1) {
      diagnostics.push(`Evidence ${item.id} confidence must be between 0 and 1`);
    }
    if (item.strength === "Fact" && item.source.trim().length === 0) {
      diagnostics.push(`Fact evidence ${item.id} requires a source`);
    }
  }
  return diagnostics;
}
