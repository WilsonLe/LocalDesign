import { create } from "fontkit";
import { fontInfo, fontKey, unbase64 } from "../fonts/data";
import type { DocumentFont, FontFile } from "../fonts/schema";
import type { DesignNode } from "../core/model";

type Font = ReturnType<typeof create>;
const parsed = new Map<string, Font>();
const outlines = new Map<string, string>();
let outlineBytes = 0;
function face(file: FontFile) {
  const digest = fontInfo(file).digest;
  let font = parsed.get(digest);
  if (!font) {
    // At most two maximum-expanded faces, plus small used-glyph path caches.
    if (parsed.size >= 2) parsed.delete(parsed.keys().next().value!);
    font = create(unbase64(file.data));
    parsed.set(digest, font);
  }
  return font;
}
type PositionedGlyph = {
  id: string;
  path: string;
  x: number;
  y: number;
  scale: number;
  ink: { x: number; y: number; width: number; height: number };
};
type Line = { glyphs: PositionedGlyph[]; width: number };
const lines = new Map<string, Line>();
let retainedGlyphs = 0;
export function shapeLine(
  n: Pick<DesignNode, "fontSize" | "letterSpacing">,
  record: DocumentFont,
  text: string,
): Line {
  text = text.normalize("NFC");
  const key = `${fontKey(record)}:${n.fontSize}:${n.letterSpacing}:${text}`;
  const old = lines.get(key);
  if (old) return old;
  const segments: { file: FontFile; text: string }[] = [];
  for (const char of Array.from(text)) {
    const file =
      record.files.find((f) =>
        fontInfo(f).characters.has(char.codePointAt(0)!),
      ) ?? record.files[0];
    const last = segments.at(-1);
    if (last?.file === file) last.text += char;
    else segments.push({ file, text: char });
  }
  let x = 0,
    y = 0,
    spacing = false;
  const glyphs: PositionedGlyph[] = [];
  for (const segment of segments) {
    const font = face(segment.file),
      scale = n.fontSize / font.unitsPerEm;
    const run = font.layout(
      segment.text,
      n.letterSpacing ? { liga: false, clig: false } : undefined,
    );
    for (let i = 0; i < run.glyphs.length; i++) {
      const glyph = run.glyphs[i],
        position = run.positions[i],
        pathKey = `${fontInfo(segment.file).digest}:${glyph.id}`;
      let path = outlines.get(pathKey);
      if (path === undefined) {
        path = glyph.path.toSVG();
        if (outlineBytes + path.length > 4_000_000) {
          outlines.clear();
          outlineBytes = 0;
        }
        outlines.set(pathKey, path);
        outlineBytes += path.length;
      }
      if (path) {
        const box = glyph.path.bbox;
        const gx = x + position.xOffset * scale,
          gy = y - position.yOffset * scale;
        glyphs.push({
          id: `glyph-${fontInfo(segment.file).digest}-${glyph.id}`,
          path,
          x: gx,
          y: gy,
          scale,
          ink: {
            x: gx + box.minX * scale,
            y: gy - box.maxY * scale,
            width: (box.maxX - box.minX) * scale,
            height: (box.maxY - box.minY) * scale,
          },
        });
      }
      x += position.xAdvance * scale;
      y -= position.yAdvance * scale;
      if (position.xAdvance) {
        x += n.letterSpacing;
        spacing = true;
      }
    }
  }
  const result = { glyphs, width: x - (spacing ? n.letterSpacing : 0) };
  while (
    lines.size &&
    (lines.size >= 256 || retainedGlyphs + glyphs.length > 50000)
  ) {
    const first = lines.keys().next().value!;
    retainedGlyphs -= lines.get(first)!.glyphs.length;
    lines.delete(first);
  }
  lines.set(key, result);
  retainedGlyphs += glyphs.length;
  return result;
}

const compactLines = new WeakMap<Line, string[] | null>();
export function compactLine(line: Line): string[] | null {
  if (compactLines.has(line)) return compactLines.get(line)!;
  // Repeated complex outlines must not expand a bounded glyph run without limit.
  if (
    line.glyphs.reduce((sum, glyph) => sum + glyph.path.length, 0) > 250_000
  ) {
    compactLines.set(line, null);
    return null;
  }
  const paths: string[] = [];
  let current = "",
    bytes = 0,
    right = -Infinity;
  for (const glyph of line.glyphs) {
    // Keep overlapping outlines as separate paint operations (combining marks,
    // italic overhangs, RTL and negative tracking). Disjoint contours can share a path.
    if (glyph.ink.x - glyph.scale <= right) {
      paths.push(current);
      current = "";
    }
    let coordinate = 0;
    const path = glyph.path.replace(
      /-?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi,
      (number) => {
        const x = coordinate++ % 2 === 0;
        return String(
          Number(number) * (x ? glyph.scale : -glyph.scale) +
            (x ? glyph.x : glyph.y),
        );
      },
    );
    bytes += path.length;
    if (bytes > 500_000) {
      compactLines.set(line, null);
      return null;
    }
    current += path;
    right = glyph.ink.x + glyph.ink.width + glyph.scale;
  }
  if (current) paths.push(current);
  compactLines.set(line, paths);
  return paths;
}
