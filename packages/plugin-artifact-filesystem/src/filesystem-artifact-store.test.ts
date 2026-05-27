import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { FilesystemArtifactStore } from "./filesystem-artifact-store";

const tempRoots: string[] = [];

describe("FilesystemArtifactStore", () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("writes content and verifiable manifest metadata", async () => {
    const root = await tempRoot();
    const store = new FilesystemArtifactStore({ rootDir: root, now: () => "2026-05-27T00:00:00.000Z" });

    const put = store.putArtifact({
      artifactId: "tool-output-1",
      data: "large output",
      mimeType: "text/plain; charset=utf-8",
      label: "tool output",
      privacyTags: ["tool-result", "workspace"],
      retention: "session",
      actor: { type: "tool", id: "fs_read" },
      metadata: { purpose: "test" }
    });

    expect(put).toMatchObject({
      ok: true,
      reference: {
        artifactId: "tool-output-1",
        sizeBytes: 12,
        mimeType: "text/plain; charset=utf-8",
        privacyTags: ["tool-result", "workspace"],
        retention: "session",
        redaction: { state: "none" },
        transitions: [{ type: "created", actor: { type: "tool", id: "fs_read" } }]
      }
    });
    expect(put.ok ? put.reference.contentHash.value : "").toHaveLength(64);
    await expect(readFile(join(root, "manifests", "tool-output-1.json"), "utf8")).resolves.toContain("\"schemaVersion\": 1");
  });

  it("reopens content across store instances and verifies the hash", async () => {
    const root = await tempRoot();
    const store = new FilesystemArtifactStore({ rootDir: root });
    store.putArtifact({ artifactId: "reopen", data: "persistent", mimeType: "text/plain" });

    const reopened = new FilesystemArtifactStore({ rootDir: root });

    expect(reopened.readArtifact("reopen")).toMatchObject({
      ok: true,
      data: "persistent",
      reference: { artifactId: "reopen" }
    });
  });

  it("treats existing artifact ids as immutable idempotent writes", async () => {
    const root = await tempRoot();
    const store = new FilesystemArtifactStore({ rootDir: root, now: () => "2026-05-27T00:00:00.000Z" });

    const first = store.putArtifact({ artifactId: "stable", data: "persistent", mimeType: "text/plain" });
    const same = new FilesystemArtifactStore({ rootDir: root, now: () => "2026-05-27T01:00:00.000Z" }).putArtifact({
      artifactId: "stable",
      data: "persistent",
      mimeType: "text/plain",
      label: "ignored retry label"
    });
    const conflict = store.putArtifact({ artifactId: "stable", data: "changed", mimeType: "text/plain" });

    expect(same).toEqual(first);
    expect(conflict).toMatchObject({
      ok: false,
      status: "unavailable",
      reason: expect.stringContaining("already exists with different content hash")
    });
    await expect(readFile(join(root, "content", "stable.bin"), "utf8")).resolves.toBe("persistent");
  });

  it("returns structured not_found and hash_mismatch failures", async () => {
    const root = await tempRoot();
    const store = new FilesystemArtifactStore({ rootDir: root });

    expect(store.readArtifact("missing")).toMatchObject({
      ok: false,
      status: "not_found",
      diagnostic: { kind: "artifact_missing", recoverable: true }
    });

    store.putArtifact({ artifactId: "corrupt", data: "trusted", mimeType: "text/plain" });
    await writeFile(join(root, "content", "corrupt.bin"), "changed");

    expect(store.readArtifact("corrupt")).toMatchObject({
      ok: false,
      status: "hash_mismatch",
      diagnostic: { kind: "hash_chain_mismatch", recoverable: false }
    });
  });

  it("returns structured diagnostics for invalid ids and decode failures", async () => {
    const root = await tempRoot();
    const store = new FilesystemArtifactStore({ rootDir: root });

    expect(store.putArtifact({ artifactId: "../escape", data: "bad", mimeType: "text/plain" })).toMatchObject({
      ok: false,
      status: "unavailable",
      reason: expect.stringContaining("Invalid artifact id")
    });
    expect(store.readArtifact("../escape")).toMatchObject({
      ok: false,
      status: "unavailable",
      diagnostic: { kind: "schema_invalid", recoverable: false }
    });
    expect(store.tombstoneArtifact("../escape", { reason: "invalid" })).toMatchObject({
      ok: false,
      status: "unavailable",
      diagnostic: { kind: "schema_invalid", recoverable: false }
    });

    store.putArtifact({ artifactId: "json", data: { ok: true }, mimeType: "application/json" });
    await writeFile(join(root, "content", "json.bin"), "not-json");
    const manifestPath = join(root, "manifests", "json.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    manifest.contentHash = {
      algorithm: "sha256",
      value: "0c21a879c732a67910d80988df4919d794f6a070aab610ef865032a28046b021"
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    expect(store.readArtifact("json")).toMatchObject({
      ok: false,
      status: "unavailable",
      diagnostic: { kind: "schema_invalid", recoverable: false }
    });
  });

  it("records tombstone transitions and prevents normal reads", async () => {
    const root = await tempRoot();
    const store = new FilesystemArtifactStore({ rootDir: root, now: () => "2026-05-27T00:00:00.000Z" });
    store.putArtifact({ artifactId: "secret", data: "sensitive", mimeType: "text/plain" });

    const tombstone = store.tombstoneArtifact("secret", {
      reason: "user requested deletion",
      createdAt: "2026-05-27T01:00:00.000Z",
      actor: { type: "user", id: "u1" }
    });

    expect(tombstone).toMatchObject({
      ok: true,
      reference: {
        redaction: {
          state: "tombstoned",
          reason: "user requested deletion",
          actor: { type: "user", id: "u1" }
        },
        transitions: [
          { type: "created" },
          { type: "tombstoned", reason: "user requested deletion", actor: { type: "user", id: "u1" } }
        ]
      }
    });
    expect(store.readArtifact("secret")).toMatchObject({
      ok: false,
      status: "tombstoned",
      diagnostic: { recoverable: true }
    });
  });
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "guga-artifacts-"));
  tempRoots.push(root);
  return root;
}
