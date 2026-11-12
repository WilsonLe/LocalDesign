import manifest from "../../public/skills/manifest.json";
import { DesignError } from "../core/model";
const packages = import.meta.glob("../../public/skills/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
export const bundleVersion = manifest.bundleVersion;
export function listSkills(query = "") {
  const q = query.toLowerCase();
  return manifest.skills
    .filter(
      (s) =>
        !q || `${s.id} ${s.title} ${s.whenToUse}`.toLowerCase().includes(q),
    )
    .map(({ path, sha256, bytes, ...skill }) => ({
      ...skill,
      sha256,
      bytes,
      retrievalTool: "localdesign_get_skill",
    }));
}
export function getSkill(id: string, expected?: string) {
  if (expected && expected !== bundleVersion)
    throw new DesignError(
      "SKILL_VERSION_UNAVAILABLE",
      `Available bundle version: ${bundleVersion}`,
    );
  const skill = manifest.skills.find((s) => s.id === id);
  if (!skill)
    throw new DesignError(
      "UNKNOWN_SKILL",
      "Unknown skill. Call localdesign_list_skills for the current catalog.",
    );
  const instructions = packages[`../../public/skills/${skill.path}`];
  if (!instructions)
    throw new DesignError(
      "SKILL_UNAVAILABLE",
      "Skill asset is unavailable. Reload the app.",
    );
  return { ...skill, bundleVersion, source: manifest.source, instructions };
}
