import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";

// Explicit local inventory, built only from the lockfile-pinned package, never fetched at runtime.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const names = [
  "house",
  "search",
  "menu",
  "x",
  "check",
  "plus",
  "minus",
  "arrow-left",
  "arrow-right",
  "arrow-up",
  "arrow-down",
  "chevron-left",
  "chevron-right",
  "chevron-down",
  "user",
  "users",
  "settings",
  "bell",
  "mail",
  "calendar",
  "clock",
  "heart",
  "star",
  "bookmark",
  "folder",
  "file",
  "image",
  "download",
  "upload",
  "link",
  "external-link",
  "copy",
  "trash",
  "pencil",
  "lock",
  "eye",
  "eye-off",
  "play",
  "pause",
  "info",
  "circle-question-mark",
  "triangle-exclamation-point",
  "shopping-cart",
  "credit-card",
  "globe",
  "map-pin",
  "sun",
  "moon",
];
const synonyms = {
  house: ["home"],
  x: ["close", "cancel"],
  search: ["find"],
  settings: ["gear", "preferences"],
  mail: ["email", "message"],
  trash: ["delete", "remove"],
  pencil: ["edit"],
  "circle-question-mark": ["help", "question"],
  "triangle-exclamation-point": ["warning", "alert"],
  "shopping-cart": ["basket", "store"],
  "credit-card": ["payment"],
  "map-pin": ["location"],
};
function nativePath([tag, a]) {
  const n = (key, fallback = 0) => Number(a[key] ?? fallback);
  switch (tag) {
    case "path":
      return `M0 0 ${a.d}`; // Relative first moves must start at the original origin.
    case "line":
      return `M${n("x1")} ${n("y1")}L${n("x2")} ${n("y2")}`;
    case "circle": {
      const x = n("cx"),
        y = n("cy"),
        r = n("r");
      return `M${x - r} ${y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`;
    }
    case "rect": {
      const x = n("x"),
        y = n("y"),
        w = n("width"),
        h = n("height"),
        r = Math.min(n("rx"), w / 2, h / 2);
      if (!r) return `M${x} ${y}h${w}v${h}h${-w}Z`;
      return `M${x + r} ${y}H${x + w - r}a${r} ${r} 0 0 1 ${r} ${r}V${y + h - r}a${r} ${r} 0 0 1 ${-r} ${r}H${x + r}a${r} ${r} 0 0 1 ${-r} ${-r}V${y + r}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
    }
    default:
      throw new Error(`Unsupported bundled icon primitive ${tag}`);
  }
}
const packageRoot = path.join(root, "node_modules/lucide-react");
const pkg = JSON.parse(
  await readFile(path.join(packageRoot, "package.json"), "utf8"),
);
if (pkg.version !== "1.72.0")
  throw new Error("Review the catalog and licensing before updating Lucide.");
const license = await readFile(path.join(packageRoot, "LICENSE"), "utf8");
const icons = [];
for (const name of names) {
  const { __iconData: data } = await import(`lucide-react/icons/${name}`);
  if (!data) throw new Error(`Choose a canonical upstream icon: ${name}`);
  icons.push({
    id: name,
    name: name
      .split("-")
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join(" "),
    keywords: [
      ...new Set([...(data.aliases ?? []), ...(synonyms[name] ?? [])]),
    ],
    path: data.node.map(nativePath).join(" "),
  });
}
const catalog = {
  source: "https://github.com/lucide-icons/lucide",
  version: pkg.version,
  viewBox: 24,
  license,
  icons,
};
const output = await format(JSON.stringify(catalog), { parser: "json" });
const destination = path.join(root, "src/icons/catalog.json");
if (process.argv.includes("--check")) {
  if ((await readFile(destination, "utf8")) !== output)
    throw new Error(
      "Bundled icon paths differ from the pinned source. Run node scripts/build-icons.mjs.",
    );
  if (
    (await readFile(path.join(root, "public/lucide-LICENSE.txt"), "utf8")) !==
    license
  )
    throw new Error(
      "The bundled Lucide notice differs from its pinned source.",
    );
} else {
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, output);
  await writeFile(path.join(root, "public/lucide-LICENSE.txt"), license);
}
console.log(
  `Verified ${icons.length} native icons from Lucide ${pkg.version}.`,
);
