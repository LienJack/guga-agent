import { existsSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve, sep } from "node:path";

export type GugaHomeSource = "default" | "env";

export type GugaHomePaths = {
  home: string;
  homeSource: GugaHomeSource;
  projectRoot: string;
  projectKey: string;
  config: {
    userToml: string;
    userJson: string;
    projectToml: string;
    projectJson: string;
  };
  sessionsRoot: string;
  eventsRoot: string;
  sessionFactsRoot: string;
  artifactsRoot: string;
  memoryRoot: string;
  cacheRoot: string;
  logsRoot: string;
  profilesRoot: string;
};

export type ResolveGugaHomeOptions = {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  homeDir?: string;
};

export class GugaHomeError extends Error {
  readonly source: GugaHomeSource;
  readonly value: string;

  constructor(source: GugaHomeSource, value: string, message: string) {
    super(`Invalid Guga home from ${source}: ${message}`);
    this.name = "GugaHomeError";
    this.source = source;
    this.value = value;
  }
}

export function resolveGugaHome(options: ResolveGugaHomeOptions = {}): GugaHomePaths {
  const env = options.env ?? process.env;
  const cwd = canonicalPath(options.cwd ?? process.cwd());
  const homeDir = canonicalPath(options.homeDir ?? homedir());
  const homeSource: GugaHomeSource = env.GUGA_HOME ? "env" : "default";
  const home = resolveHomePath(env.GUGA_HOME, { cwd, homeDir, source: homeSource });
  const projectRoot = findProjectRoot(cwd);
  const projectKey = projectKeyForRoot(projectRoot);
  const projectSessionRoot = join(home, "sessions", "projects", projectKey);
  return {
    home,
    homeSource,
    projectRoot,
    projectKey,
    config: {
      userToml: join(home, "config.toml"),
      userJson: join(home, "config.json"),
      projectToml: join(projectRoot, ".guga", "config.toml"),
      projectJson: join(projectRoot, ".guga", "config.json")
    },
    sessionsRoot: projectSessionRoot,
    eventsRoot: join(projectSessionRoot, "events"),
    sessionFactsRoot: join(projectSessionRoot, "sessions"),
    artifactsRoot: join(home, "artifacts", "projects", projectKey),
    memoryRoot: join(home, "memory"),
    cacheRoot: join(home, "cache"),
    logsRoot: join(home, "logs"),
    profilesRoot: join(home, "profiles")
  };
}

export function projectKeyForRoot(projectRoot: string): string {
  const canonical = canonicalPath(projectRoot);
  const label = safePathSegment(basename(canonical) || "project");
  const hash = createHash("sha256").update(canonical).digest("hex").slice(0, 10);
  return `${label}-${hash}`;
}

export function safePathSegment(input: string): string {
  const segment = input
    .replaceAll(/[^a-zA-Z0-9._=-]/g, "__")
    .replaceAll("..", "__");
  return segment.length > 0 && segment !== "." && segment !== ".." ? segment : "project";
}

function resolveHomePath(
  override: string | undefined,
  options: { cwd: string; homeDir: string; source: GugaHomeSource }
): string {
  if (!override) {
    return join(options.homeDir, ".guga");
  }
  if (override.trim().length === 0) {
    throw new GugaHomeError(options.source, override, "GUGA_HOME must not be empty");
  }
  if (override.includes("\0")) {
    throw new GugaHomeError(options.source, override, "GUGA_HOME must not contain null bytes");
  }
  const expanded = override === "~" || override.startsWith(`~${sep}`)
    ? join(options.homeDir, override.slice(2))
    : override;
  return canonicalPath(isAbsolute(expanded) ? expanded : resolve(options.cwd, expanded));
}

function findProjectRoot(cwd: string): string {
  let current = cwd;
  while (true) {
    if (existsSync(join(current, ".git"))) {
      return current;
    }
    const parent = resolve(current, "..");
    if (parent === current) {
      return cwd;
    }
    current = parent;
  }
}

function canonicalPath(path: string): string {
  const absolute = resolve(path);
  try {
    return realpathSync.native(absolute);
  } catch {
    return absolute;
  }
}
