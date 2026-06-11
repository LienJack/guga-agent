import type { ModelInputProjection, ProjectionHashDescriptor } from "../contracts/context";
import { summarizeContextSourceMetadata } from "./context-source-metadata";

export function computeProjectionHash(projection: ModelInputProjection): ProjectionHashDescriptor {
  const payload = {
    version: "m4-projection-v1",
    provider: projection.provider
      ? {
          providerId: projection.provider.providerId,
          modelId: projection.provider.modelId,
          purpose: projection.provider.purpose,
          contextWindow: projection.provider.metadata?.contextWindow,
          maxOutputTokens: projection.provider.metadata?.maxOutputTokens
        }
      : undefined,
    sources: projection.sourceDescriptors.map((source) => ({
      id: source.id,
      kind: source.kind,
      priority: source.priority,
      contentHash: source.contentHash,
      modelVisible: source.modelVisible,
      protected: source.protected ?? false,
      references: source.references?.map((reference) => ({ type: reference.type, id: reference.id })),
      metadataSummary: summarizeContextSourceMetadata(source)
    })),
    policyDecisions: projection.policyDecisions.map((decision) => ({
      id: decision.id,
      kind: decision.kind,
      phase: decision.phase,
      reason: "reason" in decision ? decision.reason : undefined
    }))
  };

  return {
    algorithm: "sha256",
    inputVersion: "m4-projection-v1",
    value: deterministicHash(JSON.stringify(payload))
  };
}

function deterministicHash(input: string): string {
  let hashA = 0x811c9dc5;
  let hashB = 0x01000193;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    hashA ^= code;
    hashA = Math.imul(hashA, 0x01000193) >>> 0;
    hashB = Math.imul(hashB ^ code, 0x85ebca6b) >>> 0;
  }
  return `${hashA.toString(16).padStart(8, "0")}${hashB.toString(16).padStart(8, "0")}`;
}
