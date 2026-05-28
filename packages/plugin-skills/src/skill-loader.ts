import { open, opendir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { SkillMetadata } from "@guga-agent/core";
import { parseSkillFileContent, parseSkillMetadataFrontmatter } from "./skill-frontmatter";

export type SkillRoot = {
  path: string;
  namespace?: string;
};

export type DiscoveredSkill = {
  metadata: SkillMetadata;
  skillDir: string;
  skillFile: string;
};

export type InvalidSkill = {
  path: string;
  reason: string;
};

export type SkillNameConflict = {
  name: string;
  kept: string;
  skipped: string;
};

export type SkillDiscoveryResult = {
  skills: DiscoveredSkill[];
  invalid: InvalidSkill[];
  conflicts: SkillNameConflict[];
};

export async function discoverSkills(roots: SkillRoot[]): Promise<SkillDiscoveryResult> {
  const skillsByName = new Map<string, DiscoveredSkill>();
  const invalid: InvalidSkill[] = [];
  const conflicts: SkillNameConflict[] = [];

  for (const root of roots) {
    const rootPath = path.resolve(root.path);
    if (!(await isDirectory(rootPath))) {
      invalid.push({ path: rootPath, reason: "Skill root is not a directory" });
      continue;
    }
    for (const skillFile of await findSkillFiles(rootPath)) {
      const parsed = await readSkillMetadata(skillFile);
      if (!parsed.metadata) {
        invalid.push({ path: skillFile, reason: parsed.error ?? "Invalid skill metadata" });
        continue;
      }
      const metadata = {
        ...parsed.metadata,
        ...(root.namespace && !parsed.metadata.namespace ? { namespace: root.namespace } : {})
      };
      const skill = {
        metadata,
        skillDir: path.dirname(skillFile),
        skillFile
      };
      const existing = skillsByName.get(metadata.name);
      if (existing) {
        conflicts.push({ name: metadata.name, kept: existing.skillFile, skipped: skillFile });
        continue;
      }
      skillsByName.set(metadata.name, skill);
    }
  }

  return {
    skills: [...skillsByName.values()].sort((left, right) => left.metadata.name.localeCompare(right.metadata.name)),
    invalid,
    conflicts
  };
}

export async function loadSkillBody(skill: DiscoveredSkill): Promise<string> {
  const content = await readFile(skill.skillFile, "utf8");
  return parseSkillFileContent(content, skill.metadata.location).body;
}

export function resolveSkillAssetPath(skill: DiscoveredSkill, relativePath: string): string {
  const resolved = path.resolve(skill.skillDir, relativePath);
  const skillDir = path.resolve(skill.skillDir);
  if (resolved !== skillDir && !resolved.startsWith(`${skillDir}${path.sep}`)) {
    throw new Error(`Skill asset path escapes skill directory: ${relativePath}`);
  }
  return resolved;
}

async function findSkillFiles(root: string): Promise<string[]> {
  const matches: string[] = [];
  await walk(root, matches);
  return matches.sort();
}

async function walk(directory: string, matches: string[]): Promise<void> {
  const entries = await opendir(directory);
  for await (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(entryPath, matches);
    } else if (entry.isFile() && entry.name === "SKILL.md") {
      matches.push(entryPath);
    }
  }
}

async function isDirectory(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

async function readSkillMetadata(skillFile: string): Promise<{
  metadata?: SkillMetadata;
  error?: string;
}> {
  const handle = await open(skillFile, "r");
  try {
    let content = "";
    const buffer = Buffer.alloc(4096);
    while (content.length < 64 * 1024) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) {
        break;
      }
      content += buffer.subarray(0, bytesRead).toString("utf8");
      const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
      if (match) {
        return parseSkillMetadataFrontmatter(match[1] ?? "", path.relative(process.cwd(), skillFile));
      }
    }
    return { error: "SKILL.md is missing YAML frontmatter" };
  } finally {
    await handle.close();
  }
}
