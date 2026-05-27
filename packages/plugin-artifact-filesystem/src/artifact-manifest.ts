import type {
  ArtifactManifestTransition,
  ArtifactReference,
  ArtifactRetention,
  ArtifactRedaction,
  DurableEventActor,
  HashDescriptor,
  JsonObject
} from "@guga-agent/core";

export type ArtifactManifestTransitionRecord = ArtifactManifestTransition;

export type ArtifactManifest = {
  schemaVersion: 1;
  artifactId: string;
  contentPath: string;
  contentHash: HashDescriptor;
  sizeBytes: number;
  mimeType: string;
  createdAt: string;
  label?: string;
  privacyTags?: string[];
  retention?: ArtifactRetention;
  redaction: ArtifactRedaction;
  transitions: ArtifactManifestTransitionRecord[];
  metadata?: JsonObject;
};

export type CreateArtifactManifestOptions = {
  artifactId: string;
  contentPath: string;
  contentHash: HashDescriptor;
  sizeBytes: number;
  mimeType: string;
  createdAt: string;
  label?: string;
  privacyTags?: string[];
  retention?: ArtifactRetention;
  actor?: DurableEventActor;
  metadata?: JsonObject;
};

export function createArtifactManifest(options: CreateArtifactManifestOptions): ArtifactManifest {
  const manifest: ArtifactManifest = {
    schemaVersion: 1,
    artifactId: options.artifactId,
    contentPath: options.contentPath,
    contentHash: options.contentHash,
    sizeBytes: options.sizeBytes,
    mimeType: options.mimeType,
    createdAt: options.createdAt,
    redaction: { state: "none" as const },
    transitions: [
      {
        type: "created",
        createdAt: options.createdAt,
        metadata: {
          contentHash: options.contentHash.value,
          sizeBytes: options.sizeBytes,
          mimeType: options.mimeType
        }
      }
    ]
  };
  if (options.actor) {
    manifest.transitions[0] = { ...manifest.transitions[0]!, actor: options.actor };
  }
  if (options.label) {
    manifest.label = options.label;
  }
  if (options.privacyTags) {
    manifest.privacyTags = options.privacyTags;
  }
  if (options.retention) {
    manifest.retention = options.retention;
  }
  if (options.metadata) {
    manifest.metadata = options.metadata;
  }
  return manifest;
}

export function artifactReferenceFromManifest(manifest: ArtifactManifest): ArtifactReference {
  const reference: ArtifactReference = {
    artifactId: manifest.artifactId,
    contentHash: manifest.contentHash,
    sizeBytes: manifest.sizeBytes,
    mimeType: manifest.mimeType,
    createdAt: manifest.createdAt,
    redaction: manifest.redaction,
    transitions: manifest.transitions
  };
  if (manifest.label) {
    reference.label = manifest.label;
  }
  if (manifest.privacyTags) {
    reference.privacyTags = manifest.privacyTags;
  }
  if (manifest.retention) {
    reference.retention = manifest.retention;
  }
  if (manifest.redaction.state === "tombstoned") {
    reference.tombstone = {
      reason: manifest.redaction.reason ?? "tombstoned",
      createdAt: manifest.redaction.tombstonedAt ?? manifest.createdAt
    };
    if (manifest.redaction.actor) {
      reference.tombstone.actor = manifest.redaction.actor;
    }
  }
  if (manifest.metadata) {
    reference.metadata = manifest.metadata;
  }
  return reference;
}

export function tombstoneManifest(
  manifest: ArtifactManifest,
  options: { reason: string; createdAt: string; actor?: DurableEventActor }
): ArtifactManifest {
  const redaction: ArtifactRedaction = {
    state: "tombstoned",
    reason: options.reason,
    tombstonedAt: options.createdAt
  };
  if (options.actor) {
    redaction.actor = options.actor;
  }

  const transition: ArtifactManifestTransitionRecord = {
    type: "tombstoned",
    createdAt: options.createdAt,
    reason: options.reason,
    metadata: {
      previousState: manifest.redaction.state,
      contentHash: manifest.contentHash.value
    }
  };
  if (options.actor) {
    transition.actor = options.actor;
  }

  return {
    ...manifest,
    redaction,
    transitions: [...manifest.transitions, transition]
  };
}
