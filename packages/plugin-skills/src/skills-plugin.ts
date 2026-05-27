import type { LocalPlugin } from "@guga-agent/core";
import { discoverSkills, type SkillRoot } from "./skill-loader";

export type SkillsPluginOptions = {
  pluginId?: string;
  roots: SkillRoot[];
};

export function createSkillsPlugin(options: SkillsPluginOptions): LocalPlugin {
  const pluginId = options.pluginId ?? "guga-skills";
  return {
    id: pluginId,
    name: "Guga Skills",
    async init(context) {
      const discovery = await discoverSkills(options.roots);
      for (const skill of discovery.skills) {
        context.registerSkill?.(skill.metadata);
      }
    }
  };
}
