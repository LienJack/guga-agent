import type { SkillMetadata } from "@guga-agent/core";

export type ParsedSkillFile = {
  metadata?: SkillMetadata;
  body: string;
  error?: string;
};

export function parseSkillFileContent(content: string, location?: string): ParsedSkillFile {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { body: content, error: "SKILL.md is missing YAML frontmatter" };
  }

  const frontmatter = parseSkillFrontmatter(match[1] ?? "");
  const name = frontmatter.name;
  const description = frontmatter.description;
  if (!name || !description) {
    return {
      body: content.slice(match[0].length),
      error: "Skill frontmatter requires name and description"
    };
  }

  return {
    metadata: skillMetadataFromFields({
      name,
      description,
      ...(frontmatter.namespace ? { namespace: frontmatter.namespace } : {}),
      ...(frontmatter.tags ? { tags: frontmatter.tags } : {})
    }, location),
    body: content.slice(match[0].length)
  };
}

export function parseSkillMetadataFrontmatter(frontmatterText: string, location?: string): {
  metadata?: SkillMetadata;
  error?: string;
} {
  const frontmatter = parseSkillFrontmatter(frontmatterText);
  if (!frontmatter.name || !frontmatter.description) {
    return { error: "Skill frontmatter requires name and description" };
  }
  return {
    metadata: skillMetadataFromFields({
      name: frontmatter.name,
      description: frontmatter.description,
      ...(frontmatter.namespace ? { namespace: frontmatter.namespace } : {}),
      ...(frontmatter.tags ? { tags: frontmatter.tags } : {})
    }, location)
  };
}

export function parseSkillFrontmatter(frontmatter: string): {
  name?: string;
  description?: string;
  namespace?: string;
  tags?: string[];
} {
  const fields: {
    name?: string;
    description?: string;
    namespace?: string;
    tags?: string[];
  } = {};

  for (const rawLine of frontmatter.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    const value = stripQuotes(rawValue);
    if (key === "name" && value) {
      fields.name = value;
    } else if (key === "description" && value) {
      fields.description = value;
    } else if (key === "namespace" && value) {
      fields.namespace = value;
    } else if (key === "tags" && value) {
      const tags = parseTags(value);
      if (tags) {
        fields.tags = tags;
      }
    }
  }

  return fields;
}

function stripQuotes(value: string): string {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseTags(value: string): string[] | undefined {
  if (!value.startsWith("[") || !value.endsWith("]")) {
    return value ? [value] : undefined;
  }
  const tags = value
    .slice(1, -1)
    .split(",")
    .map((tag) => stripQuotes(tag.trim()))
    .filter(Boolean);
  return tags.length > 0 ? tags : undefined;
}

function skillMetadataFromFields(fields: {
  name: string;
  description: string;
  namespace?: string;
  tags?: string[];
}, location?: string): SkillMetadata {
  return {
    name: fields.name,
    description: fields.description,
    ...(location ? { location } : {}),
    ...(fields.namespace ? { namespace: fields.namespace } : {}),
    ...(fields.tags ? { tags: fields.tags } : {})
  };
}
