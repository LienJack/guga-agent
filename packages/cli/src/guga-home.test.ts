import { mkdirSync, realpathSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { GugaHomeError, projectKeyForRoot, resolveGugaHome, safePathSegment } from "./guga-home";

describe("Guga home resolver", () => {
  it("defaults to home/.guga and partitions git projects by a stable key", async () => {
    const root = await tempRoot();
    const homeDir = join(root, "home");
    const repo = join(root, "repo");
    const nested = join(repo, "packages/cli");
    mkdirSync(join(repo, ".git"), { recursive: true });
    mkdirSync(nested, { recursive: true });

    const resolved = resolveGugaHome({ env: {}, cwd: nested, homeDir });

    expect(resolved.home).toBe(join(homeDir, ".guga"));
    expect(resolved.homeSource).toBe("default");
    expect(resolved.projectRoot).toBe(realpathSync.native(repo));
    expect(resolved.projectKey).toBe(projectKeyForRoot(repo));
    expect(resolved.config.userToml).toBe(join(homeDir, ".guga/config.toml"));
    expect(resolved.config.projectToml).toBe(join(realpathSync.native(repo), ".guga/config.toml"));
    expect(resolved.sessionsRoot).toBe(join(homeDir, ".guga/sessions/projects", resolved.projectKey));
    expect(resolved.eventsRoot).toBe(join(resolved.sessionsRoot, "events"));
    expect(resolved.sessionFactsRoot).toBe(join(resolved.sessionsRoot, "sessions"));
    expect(resolved.artifactsRoot).toBe(join(homeDir, ".guga/artifacts/projects", resolved.projectKey));
    expect(resolved.credentialsRoot).toBe(join(homeDir, ".guga/credentials"));
    expect(resolved.memoryRoot).toBe(join(homeDir, ".guga/memory"));
  });

  it("uses an absolute GUGA_HOME override for every derived root", async () => {
    const root = await tempRoot();
    const home = join(root, "custom-guga");
    const cwd = join(root, "repo");
    mkdirSync(join(cwd, ".git"), { recursive: true });

    const resolved = resolveGugaHome({ env: { GUGA_HOME: home }, cwd, homeDir: join(root, "home") });

    expect(resolved.home).toBe(home);
    expect(resolved.homeSource).toBe("env");
    expect(resolved.config.userJson).toBe(join(home, "config.json"));
    expect(resolved.sessionsRoot.startsWith(home)).toBe(true);
    expect(resolved.artifactsRoot.startsWith(home)).toBe(true);
    expect(resolved.memoryRoot).toBe(join(home, "memory"));
  });

  it("falls back to cwd when no git root exists", async () => {
    const root = await tempRoot();
    const cwd = join(root, "loose-project");
    mkdirSync(cwd, { recursive: true });

    const resolved = resolveGugaHome({ env: {}, cwd, homeDir: join(root, "home") });

    expect(resolved.projectRoot).toBe(realpathSync.native(cwd));
    expect(resolved.projectKey).toBe(projectKeyForRoot(cwd));
  });

  it("keeps same-basename projects in different partitions", async () => {
    const root = await tempRoot();
    const left = join(root, "left/app");
    const right = join(root, "right/app");
    mkdirSync(left, { recursive: true });
    mkdirSync(right, { recursive: true });

    expect(basename(left)).toBe(basename(right));
    expect(projectKeyForRoot(left)).not.toBe(projectKeyForRoot(right));
  });

  it("sanitizes path segments so project keys never contain traversal", () => {
    expect(safePathSegment("../bad project")).not.toContain("..");
    expect(safePathSegment("../bad project")).not.toContain("/");
  });

  it("rejects malformed GUGA_HOME overrides with an actionable diagnostic", async () => {
    const root = await tempRoot();

    expect(() => resolveGugaHome({
      env: { GUGA_HOME: "   " },
      cwd: root,
      homeDir: join(root, "home")
    })).toThrow(GugaHomeError);
  });
});

async function tempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "guga-home-"));
}
