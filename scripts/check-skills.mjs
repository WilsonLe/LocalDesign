import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
const root = resolve(import.meta.dirname, ".."),
  manifestPath = resolve(root, "public/skills/manifest.json"),
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
let count = 0;
function assert(value, message) {
  if (!value) throw new Error(message);
}
function checkLinks(path, content) {
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const link = match[1];
    if (/^(https?:|#)/.test(link)) continue;
    assert(
      existsSync(resolve(dirname(path), link.split("#")[0])),
      `Unresolved required reference in ${path}: ${link}`,
    );
  }
  assert(
    !/\.codex\/|\.agents\/skills\/[^\s]+\/[^\s]+\.py|skill:\/\/|CAPABILITIES\.md|\.\.\/orchestration/.test(
      content,
    ),
    `Host dependency in ${path}`,
  );
}
for (const skill of manifest.skills) {
  const path = resolve(root, "public/skills", skill.path),
    text = readFileSync(path, "utf8"),
    bytes = Buffer.byteLength(text),
    sha256 = createHash("sha256").update(text).digest("hex");
  assert(
    bytes <= manifest.maxResponseBytes,
    `Skill ${skill.id} exceeds response budget`,
  );
  if (process.argv.includes("--update")) {
    skill.bytes = bytes;
    skill.sha256 = sha256;
  } else
    assert(
      skill.bytes === bytes && skill.sha256 === sha256,
      `Stale digest for ${skill.id}; intentionally update reviewed adaptations`,
    );
  checkLinks(path, text);
  for (const section of [
    "Inputs",
    "Tool loop",
    "Errors",
    "Completion evidence",
    "Attribution",
  ])
    assert(text.includes(section), `Incomplete ${skill.id}: ${section}`);
  for (const tool of [
    "localdesign_catalog",
    "localdesign_inspect_document",
    "localdesign_apply_edits",
    "localdesign_export_design",
  ])
    assert(text.includes(tool), `Missing mapping ${tool}`);
  count++;
}
function walk(path) {
  for (const name of readdirSync(path)) {
    const p = resolve(path, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith(".md")) checkLinks(p, readFileSync(p, "utf8"));
  }
}
walk(resolve(root, ".agents"));
assert(
  manifest.source.commit.length === 40 && manifest.source.license === "MIT",
  "Missing immutable source/license",
);
assert(manifest.sourceInventory.length > 20, "Source inventory missing");
if (process.argv.includes("--update"))
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(
  `Verified ${count} complete runtime skills, digests, response budgets, provenance and development reference closure.`,
);
