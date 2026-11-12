import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { getSkill, listSkills, bundleVersion } from "../src/skills/catalog";
import { EditSchema } from "../src/core/commands";
import { DesignEngine } from "../src/core/engine";
import { blankDocument } from "../src/core/model";
it("serves complete cold-start packages and schema-valid executable examples without upstream access", () => {
  expect(listSkills()).toHaveLength(3);
  for (const s of listSkills()) {
    const p = getSkill(s.id, bundleVersion);
    expect(p.instructions).toContain("## Errors, recovery and resume");
    const example = p.instructions.match(/```json\n([\s\S]*?)\n```/)?.[1];
    expect(example).toBeTruthy();
    const parsed = EditSchema.parse(JSON.parse(example!)),
      doc = blankDocument();
    doc.id = parsed.expectedDocumentId;
    doc.pages[0].id = "EXAMPLE_PAGE";
    const engine = new DesignEngine(doc);
    engine.edit(parsed);
    expect(engine.document.nodes).toHaveLength(2);
    expect(engine.document.nodes[1].y).toBe(24);
  }
});
it("unknown ID/version errors are explicit and reading skills leaves engine/history unchanged", () => {
  const engine = new DesignEngine(),
    before = engine.getSnapshot();
  getSkill("typography");
  expect(engine.getSnapshot()).toBe(before);
  expect(() => getSkill("unknown")).toThrow(/Unknown skill/);
  expect(() => getSkill("ui-design", "unavailable")).toThrow(/version/);
  expect(listSkills("typography").map((s) => s.id)).toContain("typography");
});
it("development skills give a self-contained evidence-based improvement/resume protocol", () => {
  const improvement = readFileSync(
    ".agents/skills/improvement/SKILL.md",
    "utf8",
  );
  expect(improvement).toContain("real failure");
  expect(improvement).toContain("On resume");
  expect(improvement).toContain("npm run check:skills");
});

it("each package references actual page tools, with no undeclared host operation", async () => {
  const { createTools } = await import("../src/webmcp/tools");
  const { Workspace } = await import("../src/storage/workspace");
  const { Artifacts } = await import("../src/files/artifacts");
  const workspace = new Workspace();
  const controller = new AbortController();
  const tools = createTools(
    workspace,
    new Artifacts(),
    controller.signal,
    () => {},
  );
  const names = new Set(tools.map((t) => t.name));
  for (const skill of listSkills()) {
    const content = getSkill(skill.id).instructions;
    for (const match of content.matchAll(/localdesign_[a-z_]+/g))
      expect(names.has(match[0]), `Unsupported mapping ${match[0]}`).toBe(true);
  }
  const skill = tools.find((t) => t.name === "localdesign_get_skill")!;
  const before = workspace.engine.getSnapshot();
  await skill.execute({ id: "getting-started" });
  expect(workspace.engine.getSnapshot()).toBe(before);
});
