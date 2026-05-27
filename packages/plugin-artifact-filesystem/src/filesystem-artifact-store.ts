import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type {
  ArtifactStore,
  JsonObject,
  JsonValue,
  PutArtifactOptions,
  PutArtifactResult,
  ReadArtifactResult,
  StoreCorruptionDiagnostic,
  TombstoneArtifactResult
} from "@guga-agent/core";
import {
  artifactReferenceFromManifest,
  createArtifactManifest,
  tombstoneManifest,
  type ArtifactManifest
} from "./artifact-manifest";

export type FilesystemArtifactStoreOptions = {
  rootDir: string;
  now?: () => string;
};

type ArtifactUnavailable = {
  ok: false;
  status: "unavailable";
  reason: string;
};

type ReadArtifactUnavailable = {
  ok: false;
  status: "unavailable";
  diagnostic: StoreCorruptionDiagnostic;
};

export class FilesystemArtifactStore implements ArtifactStore {
  private readonly rootDir: string;
  private readonly now: () => string;

  constructor(options: FilesystemArtifactStoreOptions) {
    this.rootDir = resolve(options.rootDir);
    this.now = options.now ?? (() => new Date().toISOString());
    mkdirSync(this.contentDir, { recursive: true });
    mkdirSync(this.manifestDir, { recursive: true });
  }

  putArtifact(options: PutArtifactOptions): PutArtifactResult {
    const safeId = parseArtifactId(options.artifactId ?? randomUUID());
    if (!safeId.ok) {
      return safeId.result;
    }

    const artifactId = safeId.artifactId;
    const bytesResult = bytesFromData(options.data);
    if (!bytesResult.ok) {
      return bytesResult.result;
    }

    const bytes = bytesResult.bytes;
    const contentHash = sha256(bytes);
    const existing = this.readManifest(artifactId);
    if (existing.ok) {
      if (hashEquals(existing.manifest.contentHash, contentHash)) {
        return { ok: true, reference: artifactReferenceFromManifest(existing.manifest) };
      }
      return {
        ok: false,
        status: "unavailable",
        reason: `Artifact ${artifactId} already exists with different content hash`
      };
    }
    if (existing.status === "unavailable") {
      return {
        ok: false,
        status: "unavailable",
        reason: existing.diagnostic.message
      };
    }

    const createdAt = this.now();
    const manifestOptions = {
      artifactId,
      contentPath: this.relativeContentPath(artifactId),
      contentHash,
      sizeBytes: bytes.byteLength,
      mimeType: options.mimeType,
      createdAt
    };
    const manifest = createArtifactManifest({
      ...manifestOptions,
      ...(options.label ? { label: options.label } : {}),
      ...(options.privacyTags ? { privacyTags: options.privacyTags } : {}),
      ...(options.retention ? { retention: options.retention } : {}),
      ...(options.actor ? { actor: options.actor } : {}),
      ...(options.metadata ? { metadata: options.metadata } : {})
    });

    try {
      writeFileAtomic(this.contentPath(artifactId), bytes);
      writeJsonAtomic(this.manifestPath(artifactId), manifest);
    } catch (error) {
      return {
        ok: false,
        status: "unavailable",
        reason: error instanceof Error ? error.message : `Unable to write artifact ${artifactId}`
      };
    }

    return {
      ok: true,
      reference: artifactReferenceFromManifest(manifest)
    };
  }

  readArtifact(artifactId: string): ReadArtifactResult {
    const manifestResult = this.readManifest(artifactId);
    if (!manifestResult.ok) {
      return manifestResult;
    }

    const { manifest } = manifestResult;
    if (manifest.redaction.state === "tombstoned" || manifest.redaction.state === "redacted") {
      return {
        ok: false,
        status: "tombstoned",
        diagnostic: diagnostic("artifact_missing", artifactId, `Artifact ${artifactId} is ${manifest.redaction.state}`, true, {
          redaction: manifest.redaction,
          transitions: manifest.transitions
        })
      };
    }

    const contentPathResult = this.resolveContentPath(manifest.contentPath, artifactId);
    if (!contentPathResult.ok) {
      return contentPathResult.result;
    }
    const contentPath = contentPathResult.path;
    if (!existsSync(contentPath)) {
      return {
        ok: false,
        status: "not_found",
        diagnostic: diagnostic("artifact_missing", artifactId, `Artifact content is missing for ${artifactId}`, true)
      };
    }

    let bytes: Uint8Array;
    try {
      bytes = readFileSync(contentPath);
    } catch (error) {
      return {
        ok: false,
        status: "unavailable",
        diagnostic: diagnostic("unknown", artifactId, error instanceof Error ? error.message : `Artifact content cannot be read for ${artifactId}`, false)
      };
    }
    const actualHash = sha256(bytes);
    if (actualHash.value !== manifest.contentHash.value) {
      return {
        ok: false,
        status: "hash_mismatch",
        diagnostic: diagnostic("hash_chain_mismatch", artifactId, `Artifact hash mismatch for ${artifactId}`, false, {
          expected: manifest.contentHash.value,
          actual: actualHash.value
        })
      };
    }

    const dataResult = dataFromBytes(bytes, manifest.mimeType, artifactId);
    if (!dataResult.ok) {
      return dataResult.result;
    }

    return {
      ok: true,
      data: dataResult.data,
      reference: artifactReferenceFromManifest(manifest)
    };
  }

  tombstoneArtifact(
    artifactId: string,
    options: { reason: string; createdAt?: string; actor?: PutArtifactOptions["actor"] }
  ): TombstoneArtifactResult {
    const manifestResult = this.readManifest(artifactId);
    if (!manifestResult.ok) {
      return {
        ok: false,
        status: manifestResult.status,
        diagnostic: manifestResult.diagnostic
      };
    }

    const manifest = tombstoneManifest(manifestResult.manifest, {
      reason: options.reason,
      createdAt: options.createdAt ?? this.now(),
      ...(options.actor ? { actor: options.actor } : {})
    });
    try {
      writeJsonAtomic(this.manifestPath(manifestResult.manifest.artifactId), manifest);
    } catch (error) {
      return {
        ok: false,
        status: "unavailable",
        diagnostic: diagnostic("unknown", artifactId, error instanceof Error ? error.message : `Unable to tombstone artifact ${artifactId}`, false)
      };
    }
    return {
      ok: true,
      reference: artifactReferenceFromManifest(manifest)
    };
  }

  private readManifest(artifactId: string):
    | { ok: true; manifest: ArtifactManifest }
    | { ok: false; status: "not_found" | "unavailable"; diagnostic: StoreCorruptionDiagnostic } {
    let safeId: string;
    try {
      safeId = safeArtifactId(artifactId);
    } catch (error) {
      return {
        ok: false,
        status: "unavailable",
        diagnostic: diagnostic("schema_invalid", artifactId, error instanceof Error ? error.message : `Invalid artifact id: ${artifactId}`, false)
      };
    }
    const manifestPath = this.manifestPath(safeId);
    if (!existsSync(manifestPath)) {
      return {
        ok: false,
        status: "not_found",
        diagnostic: diagnostic("artifact_missing", artifactId, `Artifact manifest not found for ${artifactId}`, true)
      };
    }

    try {
      const text = readFileSync(manifestPath, "utf8");
      const manifest = JSON.parse(text) as ArtifactManifest;
      if (manifest.artifactId !== safeId || manifest.schemaVersion !== 1) {
        return {
          ok: false,
          status: "unavailable",
          diagnostic: diagnostic("schema_invalid", artifactId, `Artifact manifest is invalid for ${artifactId}`, false)
        };
      }
      return { ok: true, manifest };
    } catch (error) {
      return {
        ok: false,
        status: "unavailable",
        diagnostic: diagnostic("schema_invalid", artifactId, `Artifact manifest cannot be read for ${artifactId}`, false, {
          error: error instanceof Error ? error.message : "unknown"
        })
      };
    }
  }

  private get contentDir(): string {
    return join(this.rootDir, "content");
  }

  private get manifestDir(): string {
    return join(this.rootDir, "manifests");
  }

  private contentPath(artifactId: string): string {
    return join(this.contentDir, `${artifactId}.bin`);
  }

  private manifestPath(artifactId: string): string {
    return join(this.manifestDir, `${artifactId}.json`);
  }

  private relativeContentPath(artifactId: string): string {
    return `content/${artifactId}.bin`;
  }

  private resolveContentPath(contentPath: string, artifactId: string):
    | { ok: true; path: string }
    | { ok: false; result: ReadArtifactUnavailable } {
    const resolved = resolve(this.rootDir, contentPath);
    if (!isWithin(this.rootDir, resolved)) {
      return {
        ok: false,
        result: {
          ok: false,
          status: "unavailable",
          diagnostic: diagnostic("schema_invalid", artifactId, `Artifact content path escapes artifact root: ${contentPath}`, false)
        }
      };
    }
    return { ok: true, path: resolved };
  }
}

function bytesFromData(data: PutArtifactOptions["data"]):
  | { ok: true; bytes: Uint8Array }
  | { ok: false; result: ArtifactUnavailable } {
  if (typeof data === "string") {
    return { ok: true, bytes: new TextEncoder().encode(data) };
  }
  if (data instanceof Uint8Array) {
    return { ok: true, bytes: data };
  }
  try {
    return { ok: true, bytes: new TextEncoder().encode(JSON.stringify(data)) };
  } catch (error) {
    return {
      ok: false,
      result: {
        ok: false,
        status: "unavailable",
        reason: error instanceof Error ? error.message : "Artifact data cannot be encoded"
      }
    };
  }
}

function dataFromBytes(bytes: Uint8Array, mimeType: string, artifactId: string):
  | { ok: true; data: string | Uint8Array | JsonValue }
  | { ok: false; result: ReadArtifactUnavailable } {
  try {
    if (mimeType === "application/json" || mimeType.endsWith("+json")) {
      return { ok: true, data: JSON.parse(new TextDecoder().decode(bytes)) as JsonValue };
    }
    if (mimeType.startsWith("text/") || mimeType.includes("charset=utf-8")) {
      return { ok: true, data: new TextDecoder().decode(bytes) };
    }
    return { ok: true, data: bytes };
  } catch (error) {
    return {
      ok: false,
      result: {
        ok: false,
        status: "unavailable",
        diagnostic: diagnostic("schema_invalid", artifactId, error instanceof Error ? error.message : `Artifact content cannot be decoded for ${artifactId}`, false)
      }
    };
  }
}

function sha256(bytes: Uint8Array): { algorithm: "sha256"; value: string } {
  return {
    algorithm: "sha256",
    value: createHash("sha256").update(bytes).digest("hex")
  };
}

function safeArtifactId(id: string): string {
  if (!/^[A-Za-z0-9._:-]+$/.test(id) || id.includes("..") || id.length === 0) {
    throw new Error(`Invalid artifact id: ${id}`);
  }
  return id;
}

function parseArtifactId(artifactId: string):
  | { ok: true; artifactId: string }
  | { ok: false; result: ArtifactUnavailable } {
  try {
    return { ok: true, artifactId: safeArtifactId(artifactId) };
  } catch (error) {
    return {
      ok: false,
      result: {
        ok: false,
        status: "unavailable",
        reason: error instanceof Error ? error.message : `Invalid artifact id: ${artifactId}`
      }
    };
  }
}

function hashEquals(left: { algorithm: string; value: string }, right: { algorithm: string; value: string }): boolean {
  return left.algorithm === right.algorithm && left.value === right.value;
}

function writeFileAtomic(path: string, bytes: Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = `${path}.${randomUUID()}.tmp`;
  writeFileSync(tempPath, bytes);
  renameSync(tempPath, path);
}

function writeJsonAtomic(path: string, value: unknown): void {
  writeFileAtomic(path, new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`));
}

function diagnostic(
  kind: StoreCorruptionDiagnostic["kind"],
  artifactId: string,
  message: string,
  recoverable: boolean,
  metadata?: JsonObject
): StoreCorruptionDiagnostic {
  return {
    kind,
    message,
    recoverable,
    metadata: {
      artifactId,
      ...(metadata ?? {})
    }
  };
}

function isWithin(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !rel.includes(`..${sep}`) && !isAbsolute(rel));
}
