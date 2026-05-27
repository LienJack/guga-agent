import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverSkills, loadSkillBody, resolveSkillAssetPath } from "./skill-loader";

describe("skill loader", () => {
  it("discovers metadata without exposing skill body content", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "guga-skills-"));
    await mkdir(path.join(root, "typescript"), { recursive: true });
    await writeFile(path.join(root, "typescript", "SKILL.md"), [
      "---",
      "name: typescript-review",
      "description: Review TypeScript changes",
      "tags: [typescript, review]",
      "---",
      "",
      "# Private Body",
      "",
      "Only load this on demand."
    ].join("\n"));

    const result = await discoverSkills([{ path: root, namespace: "project" }]);

    expect(result.invalid).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0]?.metadata).toMatchObject({
      name: "typescript-review",
      description: "Review TypeScript changes",
      namespace: "project",
      tags: ["typescript", "review"]
    });
    expect(JSON.stringify(result.skills[0]?.metadata)).not.toContain("Only load this on demand");

    await expect(loadSkillBody(result.skills[0]!)).resolves.toContain("Only load this on demand.");
  });

  it("reports invalid skills and deterministic duplicate name conflicts", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "guga-skills-"));
    await mkdir(path.join(root, "a"), { recursive: true });
    await mkdir(path.join(root, "b"), { recursive: true });
    await mkdir(path.join(root, "broken"), { recursive: true });
    await writeFile(path.join(root, "a", "SKILL.md"), "---\nname: duplicate\ndescription: First\n---\nFirst");
    await writeFile(path.join(root, "b", "SKILL.md"), "---\nname: duplicate\ndescription: Second\n---\nSecond");
    await writeFile(path.join(root, "broken", "SKILL.md"), "---\nname: broken\n---\nNo description");

    const result = await discoverSkills([{ path: root }]);

    expect(result.skills.map((skill) => skill.metadata.description)).toEqual(["First"]);
    expect(result.conflicts).toEqual([
      expect.objectContaining({ name: "duplicate" })
    ]);
    expect(result.invalid).toEqual([
      expect.objectContaining({ reason: "Skill frontmatter requires name and description" })
    ]);
  });

  it("keeps asset resolution inside the skill directory", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "guga-skills-"));
    await mkdir(path.join(root, "asset-skill", "assets"), { recursive: true });
    await writeFile(path.join(root, "asset-skill", "SKILL.md"), "---\nname: asset\ndescription: Asset skill\n---\nBody");

    const result = await discoverSkills([{ path: root }]);
    const skill = result.skills[0]!;

    expect(resolveSkillAssetPath(skill, "assets/example.txt")).toBe(path.join(root, "asset-skill", "assets", "example.txt"));
    expect(() => resolveSkillAssetPath(skill, "../outside.txt")).toThrow("escapes skill directory");
  });
});
