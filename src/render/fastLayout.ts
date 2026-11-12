import type { create } from "fontkit";
type Font = ReturnType<typeof create>;
let hb: typeof import("harfbuzzjs") | undefined;
export async function prepareFastLayout() {
  hb ??= await import("harfbuzzjs");
}
const faces = new WeakMap<
  Font,
  { face: import("harfbuzzjs").Font; id: number }
>();
let nextFace = 0;
type Run = {
  infos: import("harfbuzzjs").GlyphInfo[];
  positions: import("harfbuzzjs").GlyphPosition[];
};
const runs = new Map<string, Run>();
let runBytes = 0;
const characters = new WeakMap<Font, Set<number>>();
let buffer: import("harfbuzzjs").Buffer | undefined;
// Reuse the validated face's decompressed shaping tables. Glyph outlines remain
// Fontkit's original paths; transformed glyf/loca tables are not needed here.
function shapingData(font: Font) {
  const tags = [
    "head",
    "hhea",
    "hmtx",
    "maxp",
    "cmap",
    "GDEF",
    "GPOS",
    "GSUB",
    "kern",
  ];
  const tables = tags.sort().flatMap((tag) => {
    const table = font.directory.tables[tag];
    if (!table) return [];
    if (table.transformed) throw new Error("Transformed shaping table");
    const stream = font._getTableStream(tag);
    return [{ tag, bytes: stream.readBuffer(table.length).slice() }];
  });
  const bytes = new Uint8Array(
    12 +
      16 * tables.length +
      tables.reduce((sum, t) => sum + ((t.bytes.length + 3) & ~3), 0),
  );
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x00010000);
  view.setUint16(4, tables.length);
  const power = 2 ** Math.floor(Math.log2(tables.length));
  view.setUint16(6, power * 16);
  view.setUint16(8, Math.log2(power));
  view.setUint16(10, tables.length * 16 - power * 16);
  let offset = 12 + tables.length * 16;
  tables.forEach((table, i) => {
    const entry = 12 + i * 16;
    for (let j = 0; j < 4; j++) bytes[entry + j] = table.tag.charCodeAt(j);
    view.setUint32(entry + 8, offset);
    view.setUint32(entry + 12, table.bytes.length);
    bytes.set(table.bytes, offset);
    offset += (table.bytes.length + 3) & ~3;
  });
  return bytes.buffer;
}
export function fastLayout(
  font: Font,
  text: string,
  tracking: boolean,
  glyphs = true,
) {
  if (
    !hb ||
    !/^[\u0020-\u024f\u1e00-\u1eff\u2000-\u2029\u2030-\u205e\u20a0-\u20cf]*$/u.test(
      text,
    ) ||
    /[\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u2029]/u.test(text)
  )
    return null;
  let supported = characters.get(font);
  if (!supported) {
    supported = new Set(font.characterSet);
    characters.set(font, supported);
  }
  if (Array.from(text).some((char) => !supported.has(char.codePointAt(0)!)))
    return null;
  let face = faces.get(font);
  if (!face) {
    try {
      face = {
        face: new hb.Font(new hb.Face(new hb.Blob(shapingData(font)))),
        id: nextFace++,
      };
      faces.set(font, face);
    } catch {
      return null;
    }
  }
  const key = `${face.id}:${tracking}:${text}`;
  let run = runs.get(key);
  if (!run) {
    buffer ??= new hb.Buffer();
    buffer.reset();
    buffer.addText(text);
    buffer.guessSegmentProperties();
    buffer.setLanguage("en");
    hb.shape(
      face.face,
      buffer,
      tracking
        ? [hb.Feature.fromString("liga=0")!, hb.Feature.fromString("clig=0")!]
        : [],
    );
    run = {
      infos: buffer.getGlyphInfos(),
      positions: buffer.getGlyphPositions(),
    };
    const bytes = key.length * 2 + run.infos.length * 80;
    while (runs.size && (runs.size >= 8192 || runBytes + bytes > 4_000_000)) {
      const first = runs.keys().next().value!;
      runBytes -= first.length * 2 + runs.get(first)!.infos.length * 80;
      runs.delete(first);
    }
    if (bytes <= 4_000_000) {
      runs.set(key, run);
      runBytes += bytes;
    }
  }
  return {
    infos: run.infos,
    glyphs: glyphs
      ? run.infos.map((glyph) => font.getGlyph(glyph.codepoint))
      : [],
    positions: run.positions,
  };
}
