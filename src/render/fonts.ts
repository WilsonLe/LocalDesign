import type { DesignDocument, DesignNode } from "../core/model";
import { requireThat } from "../core/model";
import {
  base64,
  fontAlias,
  fontInfo,
  fontRanges,
  validateFontRecord,
} from "../fonts/data";
import type { DocumentFont } from "../fonts/schema";
import {
  families,
  bundledCatalog,
  type FontChoice as Choice,
} from "../fonts/bundled";
export { base64 } from "../fonts/data";

const urls = import.meta.glob<string>(
  "/node_modules/@fontsource/{inter,source-serif-4,ibm-plex-mono}/files/*-{latin,latin-ext,vietnamese}-{400,600,700}-{normal,italic}.woff2",
  { eager: true, query: "?url", import: "default" },
);
const bundled = new Map<string, DocumentFont>();
const loading = new Map<string, Promise<void>>();
const loaded = new Set<string>();
let ready: Promise<void> | undefined;
export const fontLimitations =
  "Static TTF/OTF/WOFF/WOFF2 only; 4 MB/file, 12 MB/document, 48 faces. Supply redistribution permission. System fonts are never read or embedded. Missing families/styles/glyphs remain explicit; inspect pixels as well as overflow.";
export function availableFonts(doc?: DesignDocument): Choice[] {
  const local = doc?.fonts ?? [];
  return [
    ...local,
    ...bundledCatalog.filter((f) => !local.some((x) => x.id === f.id)),
  ];
}
export function fontCatalog(doc?: DesignDocument) {
  return availableFonts(doc).map((f) => {
    const record = doc?.fonts.find((x) => x.id === f.id) ?? bundled.get(f.id);
    return {
      id: f.id,
      family: f.family,
      weight: f.weight,
      style: f.style,
      source: f.source,
      category: f.category,
      portable: true,
      systemFont: false,
      license: record
        ? record.license.slice(0, 200)
        : "SIL Open Font License 1.1",
      licenseInNativeFile: true,
      provenance:
        record?.provenance ?? "Bundled @fontsource licensed static subsets",
      ...(record
        ? {
            bytes: record.files.reduce(
              (sum, file) => sum + fontInfo(file).bytes,
              0,
            ),
            loaded: loaded.has(fontAlias(record)),
          }
        : {}),
    };
  });
}
const primary = (family: string) =>
  family
    .split(",")[0]
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .toLowerCase();
export function resolveFont(node: DesignNode, doc?: DesignDocument) {
  const choices = availableFonts(doc),
    requestedFamily = primary(node.fontFamily);
  const alias = families.find((f) => f.category === requestedFamily)?.family;
  const family = alias ?? node.fontFamily;
  const matching = choices.filter((f) => primary(f.family) === primary(family));
  const explicit = node.fontId
    ? choices.find((f) => f.id === node.fontId)
    : undefined;
  const nearest = (list: Choice[]) =>
    [...list].sort(
      (a, b) =>
        (a.style === node.fontStyle ? 0 : 10000) +
        Math.abs(+a.weight - +node.fontWeight) -
        ((b.style === node.fontStyle ? 0 : 10000) +
          Math.abs(+b.weight - +node.fontWeight)),
    )[0];
  const chosen =
    explicit ??
    nearest(matching) ??
    nearest(choices.filter((f) => f.family === "Inter"));
  const record =
    doc?.fonts.find((f) => f.id === chosen.id) ?? bundled.get(chosen.id);
  const exact =
    primary(chosen.family) === requestedFamily &&
    chosen.weight === node.fontWeight &&
    chosen.style === node.fontStyle &&
    (!node.fontId || !!explicit);
  const status =
    node.fontId && explicit
      ? exact
        ? "exact"
        : "mapped"
      : exact
        ? "exact"
        : "substituted";
  const warning =
    status === "exact"
      ? null
      : `${node.fontId && !explicit ? "Missing font ID. " : ""}Requested ${node.fontFamily} ${node.fontWeight} ${node.fontStyle}; ${status === "mapped" ? "mapped" : "substituted"} with ${chosen.family} ${chosen.weight} ${chosen.style}. ${status === "mapped" ? "Clear replacement to restore the request." : "Choose a replacement or add the licensed font."}`;
  const missingGlyphs = record
    ? [
        ...new Set(
          Array.from(node.text.normalize("NFC")).filter(
            (c) =>
              !/\s/u.test(c) &&
              !record.files.some((f) =>
                fontInfo(f).characters.has(c.codePointAt(0)!),
              ),
          ),
        ),
      ]
    : [];
  return {
    ...chosen,
    cssFamily: record ? fontAlias(record) : `LD-${chosen.id}`,
    record,
    status,
    requested: {
      family: node.fontFamily,
      weight: node.fontWeight,
      style: node.fontStyle,
      fontId: node.fontId,
    },
    warning,
    missingGlyphs: missingGlyphs.slice(0, 16),
    missingGlyphCount: missingGlyphs.length,
    portable: missingGlyphs.length === 0,
    loaded: !!record && loaded.has(fontAlias(record)),
  };
}
export function fontCSS(records: DocumentFont[]) {
  return records
    .flatMap((font) =>
      font.files.flatMap((file, i) =>
        fontRanges(font)[i]
          ? [
              `@font-face{font-family:'${fontAlias(font)}';font-style:${font.style};font-weight:${font.weight};font-display:block;src:${fontSource(file)};unicode-range:${fontRanges(font)[i]};}`,
            ]
          : [],
      ),
    )
    .join("\n");
}
function fontSource(file: DocumentFont["files"][number]) {
  return `url('data:font/${file.format};base64,${file.data}') format('${file.format === "ttf" ? "truetype" : file.format === "otf" ? "opentype" : file.format}')`;
}
export async function validateFontFaces(fonts: DocumentFont[]) {
  for (const font of fonts) {
    validateFontRecord(font);
    if (typeof document === "undefined") continue;
    const key = fontAlias(font);
    if (!loading.has(key)) {
      const pending = (async () => {
        const faces = await Promise.all(
          font.files.map(async (file, i) => {
            const range = fontRanges(font)[i];
            const face = new FontFace(key, fontSource(file), {
              weight: font.weight,
              style: font.style,
              unicodeRange: range || "U+0-10FFFF",
            });
            await face.load();
            return range ? face : null;
          }),
        );
        faces.forEach((face) => {
          if (face) document.fonts.add(face);
        });
        loaded.add(key);
      })();
      loading.set(key, pending);
      pending.catch(() => {
        if (loading.get(key) === pending) loading.delete(key);
      });
    }
    try {
      await loading.get(key);
    } catch {
      throw new Error(
        "The browser could not decode this font. Choose a valid static font; the current design was preserved.",
      );
    }
  }
}
export async function fontsReady(doc?: DesignDocument) {
  if (!ready) {
    ready = (async () => {
      if (typeof document === "undefined") return;
      for (const family of families) {
        const response = await fetch(
          `${import.meta.env.BASE_URL}${family.slug}-OFL.txt`,
        );
        requireThat(
          response.ok,
          "FONT_UNAVAILABLE",
          "Font license could not load. Reload and retry.",
        );
        const license = await response.text();
        for (const face of bundledCatalog.filter(
          (f) => f.family === family.family,
        )) {
          const files = await Promise.all(
            ["latin", "latin-ext", "vietnamese"].map(async (subset) => {
              const url =
                urls[
                  `/node_modules/@fontsource/${family.slug}/files/${family.slug}-${subset}-${face.weight}-${face.style}.woff2`
                ];
              const res = await fetch(url);
              requireThat(
                res.ok,
                "FONT_UNAVAILABLE",
                "Bundled font could not load. Reload and retry.",
              );
              return {
                format: "woff2" as const,
                data: base64(new Uint8Array(await res.arrayBuffer())),
              };
            }),
          );
          const record: DocumentFont = {
            id: face.id,
            family: face.family,
            weight: face.weight,
            style: face.style,
            source: "bundled",
            files,
            license,
            provenance: `@fontsource/${family.slug}; SIL OFL 1.1`,
            redistributionAllowed: true,
          };
          validateFontRecord(record);
          bundled.set(face.id, record);
        }
      }
      await validateFontFaces([...bundled.values()]);
    })();
    ready.catch(() => {
      ready = undefined;
    });
  }
  await ready;
  if (doc) await validateFontFaces(doc.fonts);
}
export function exportFonts(doc: DesignDocument) {
  const records = new Map(doc.fonts.map((f) => [f.id, f]));
  for (const node of doc.nodes.filter((n) => n.type === "text")) {
    const resolved = resolveFont(node, doc);
    requireThat(
      resolved.record,
      "FONT_UNAVAILABLE",
      "Wait for fonts before exporting.",
    );
    records.set(resolved.id, resolved.record);
  }
  return availableFonts(doc).flatMap(({ id }) => {
    const record = records.get(id);
    return record ? [record] : [];
  });
}
export function fontWarnings(doc: DesignDocument) {
  return doc.nodes
    .filter((n) => n.type === "text")
    .flatMap((n) => {
      const f = resolveFont(n, doc);
      return f.warning || f.missingGlyphCount
        ? [
            {
              nodeId: n.id,
              requested: f.requested,
              resolved: {
                id: f.id,
                family: f.family,
                weight: f.weight,
                style: f.style,
              },
              status: f.status,
              missingGlyphs: f.missingGlyphs,
              portable: f.portable,
              message: [
                f.warning,
                f.missingGlyphCount
                  ? `Missing glyphs: ${f.missingGlyphs.join(" ")}. Add a font covering these characters; missing-glyph placeholders are not a typography match.`
                  : null,
              ]
                .filter(Boolean)
                .join(" "),
            },
          ]
        : [];
    });
}
