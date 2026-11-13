import { create } from "fontkit";
import { fastLayout } from "./fastLayout";
import { fontInfo, fontKey, unbase64 } from "../fonts/data";
import type { DocumentFont, FontFile } from "../fonts/schema";
import type { DesignNode } from "../core/model";

type Font = ReturnType<typeof create>;
const parsed = new Map<string, { font: Font; bytes: number }>();
let parsedBytes = 0;
const outlines = new Map<string, string>();
let outlineBytes = 0;
function face(file: FontFile) {
  const digest = fontInfo(file).digest;
  const cached = parsed.get(digest);
  if (cached) return cached.font;
  const bytes = unbase64(file.data);
  const expanded = fontInfo(file).expandedBytes;
  while (
    parsed.size &&
    (parsed.size >= 144 || parsedBytes + expanded > 32_000_000)
  ) {
    const first = parsed.keys().next().value!;
    parsedBytes -= parsed.get(first)!.bytes;
    parsed.delete(first);
  }
  const font = create(bytes);
  parsed.set(digest, { font, bytes: expanded });
  parsedBytes += expanded;
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
type Line = { glyphs: PositionedGlyph[]; width: number; geometryKey?: string };
const lines = new Map<string, Line>();
let retainedGlyphs = 0;
function segmentsFor(record: DocumentFont, text: string) {
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
  return segments;
}
function layout(
  font: Font,
  record: DocumentFont,
  text: string,
  tracking: boolean,
  glyphs = true,
) {
  return (
    (record.source === "bundled"
      ? fastLayout(font, text, tracking, glyphs)
      : null) ??
    font.layout(text, tracking ? { liga: false, clig: false } : undefined)
  );
}
// Safe HarfBuzz cluster boundaries retain the same prefix advances when cut.
// Unsafe kerning/ligature/context boundaries remain on the exact standalone path.
export function prefixWidths(
  n: Pick<DesignNode, "fontSize" | "letterSpacing">,
  record: DocumentFont,
  text: string,
) {
  if (record.source !== "bundled") return new Map<number, number>();
  const widths = new Map<number, number>();
  let x = 0,
    spacing = false,
    offset = 0;
  for (const segment of segmentsFor(record, text)) {
    const font = face(segment.file),
      scale = n.fontSize / font.unitsPerEm;
    const run = fastLayout(font, segment.text, !!n.letterSpacing, false);
    if (!run) return new Map<number, number>();
    for (let i = 0; i < run.infos.length; i++) {
      const info = run.infos[i];
      if (
        (info.flags & 1) === 0 &&
        (i === 0 || info.cluster !== run.infos[i - 1].cluster)
      )
        widths.set(offset + info.cluster, x - (spacing ? n.letterSpacing : 0));
      const position = run.positions[i];
      x += position.xAdvance * scale;
      if (position.xAdvance) {
        x += n.letterSpacing;
        spacing = true;
      }
    }
    offset += segment.text.length;
    widths.set(offset, x - (spacing ? n.letterSpacing : 0));
  }
  return widths;
}
const widths = new Map<string, number>();
let widthCharacters = 0;
type WidthRun = { unitsPerEm: number; advances: number[] };
const widthRuns = new Map<string, { runs: WidthRun[]; bytes: number }>();
let widthRunBytes = 0;
function widthLayout(
  record: DocumentFont,
  text: string,
  tracking: boolean,
  faceKey: string,
) {
  // Prefix wrapping repeats the same shaping at many font sizes. Retain only
  // the unscaled advances; accumulate them in the original order at each size.
  const key = `${record.source}:${faceKey}:${tracking}:${text}`;
  const prior = widthRuns.get(key);
  if (prior) return prior.runs;
  const runs = segmentsFor(record, text).map((segment) => {
    const font = face(segment.file);
    return {
      unitsPerEm: font.unitsPerEm,
      advances: layout(
        font,
        record,
        segment.text,
        tracking,
        false,
      ).positions.map((position) => position.xAdvance),
    };
  });
  const bytes =
    key.length * 2 +
    runs.reduce((sum, run) => sum + 64 + run.advances.length * 8, 0);
  while (
    widthRuns.size &&
    (widthRuns.size >= 8192 || widthRunBytes + bytes > 4_000_000)
  ) {
    const first = widthRuns.keys().next().value!;
    widthRunBytes -= widthRuns.get(first)!.bytes;
    widthRuns.delete(first);
  }
  if (bytes <= 4_000_000) {
    widthRuns.set(key, { runs, bytes });
    widthRunBytes += bytes;
  }
  return runs;
}
export function lineWidth(
  n: Pick<DesignNode, "fontSize" | "letterSpacing">,
  record: DocumentFont,
  text: string,
) {
  text = text.normalize("NFC");
  const faceKey = fontKey(record);
  const key = `${faceKey}:${n.fontSize}:${n.letterSpacing}:${text}`;
  const prior = widths.get(key);
  if (prior !== undefined) return prior;
  let x = 0,
    spacing = false;
  for (const run of widthLayout(record, text, !!n.letterSpacing, faceKey)) {
    const scale = n.fontSize / run.unitsPerEm;
    for (const advance of run.advances) {
      x += advance * scale;
      if (advance) {
        x += n.letterSpacing;
        spacing = true;
      }
    }
  }
  const width = x - (spacing ? n.letterSpacing : 0);
  while (
    widths.size &&
    (widths.size >= 8192 || widthCharacters + key.length > 1_000_000)
  ) {
    const first = widths.keys().next().value!;
    widthCharacters -= first.length;
    widths.delete(first);
  }
  widths.set(key, width);
  widthCharacters += key.length;
  return width;
}
export function shapeLine(
  n: Pick<DesignNode, "fontSize" | "letterSpacing">,
  record: DocumentFont,
  text: string,
): Line {
  text = text.normalize("NFC");
  const key = `${fontKey(record)}:${n.fontSize}:${n.letterSpacing}:${text}`;
  const old = lines.get(key);
  if (old) return old;
  const segments = segmentsFor(record, text);
  let x = 0,
    y = 0,
    spacing = false;
  const glyphs: PositionedGlyph[] = [];
  for (const segment of segments) {
    const font = face(segment.file),
      scale = n.fontSize / font.unitsPerEm;
    const run = layout(font, record, segment.text, !!n.letterSpacing);
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
  const result = {
    glyphs,
    width: x - (spacing ? n.letterSpacing : 0),
    geometryKey: `${fontKey(record)}:${n.letterSpacing / n.fontSize}:${text}`,
  };
  while (
    lines.size &&
    (lines.size >= 4096 || retainedGlyphs + glyphs.length > 50000)
  ) {
    const first = lines.keys().next().value!;
    retainedGlyphs -= lines.get(first)!.glyphs.length;
    lines.delete(first);
  }
  lines.set(key, result);
  retainedGlyphs += glyphs.length;
  return result;
}

const relativeOutlines = new Map<
  string,
  { x: number; y: number; rest: string }
>();
let relativeBytes = 0;
function relativeOutline(glyph: PositionedGlyph) {
  const key = glyph.id;
  const old = relativeOutlines.get(key);
  if (old) return old;
  let x = 0,
    y = 0,
    sx = 0,
    sy = 0,
    firstX = 0,
    firstY = 0,
    rest = "";
  for (const [i, command] of [
    ...glyph.path.matchAll(/([MLQCZ])([^MLQCZ]*)/g),
  ].entries()) {
    const op = command[1];
    if (op === "Z") {
      rest += "z";
      x = sx;
      y = sy;
      continue;
    }
    const values = command[2].trim().split(/[ ,]+/).map(Number);
    const endX = values.at(-2)!,
      endY = values.at(-1)!;
    if (i === 0) {
      firstX = endX;
      firstY = endY;
    } else
      rest +=
        op.toLowerCase() + values.map((v, j) => v - (j % 2 ? y : x)).join(" ");
    x = endX;
    y = endY;
    if (op === "M") {
      sx = x;
      sy = y;
    }
  }
  const result = { x: firstX, y: firstY, rest };
  while (
    relativeOutlines.size &&
    relativeBytes + key.length + rest.length > 4_000_000
  ) {
    const first = relativeOutlines.keys().next().value!;
    relativeBytes -= first.length + relativeOutlines.get(first)!.rest.length;
    relativeOutlines.delete(first);
  }
  relativeOutlines.set(key, result);
  relativeBytes += key.length + rest.length;
  return result;
}

type Compact = { id: string; paths: string[]; scale: number };
const geometries = new Map<string, Pick<Compact, "id" | "paths">>();
let geometryBytes = 0;
let nextGeometry = 0;
const compactLines = new WeakMap<Line, Compact | null>();
export function compactLine(line: Line): Compact | null {
  if (compactLines.has(line)) return compactLines.get(line)!;
  // Repeated complex outlines must not expand a bounded glyph run without limit.
  if (
    line.glyphs.reduce((sum, glyph) => sum + glyph.path.length, 0) > 250_000
  ) {
    compactLines.set(line, null);
    return null;
  }
  const scale = line.glyphs[0]?.scale ?? 1;
  if (line.glyphs.some((glyph) => glyph.scale !== scale)) {
    compactLines.set(line, null);
    return null;
  }
  const geometry = line.geometryKey && geometries.get(line.geometryKey);
  if (geometry) {
    const result = { ...geometry, scale };
    compactLines.set(line, result);
    return result;
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
    const outline = relativeOutline(glyph);
    const path = `M${glyph.x / scale + outline.x} ${-glyph.y / scale + outline.y}${outline.rest}`;
    bytes += path.length;
    if (bytes > 500_000) {
      compactLines.set(line, null);
      return null;
    }
    current += path;
    right = glyph.ink.x + glyph.ink.width + glyph.scale;
  }
  if (current) paths.push(current);
  const result = { id: `compact-${nextGeometry++}`, paths, scale };
  if (line.geometryKey) {
    const size =
      line.geometryKey.length +
      result.id.length +
      paths.reduce((sum, path) => sum + path.length, 0);
    while (geometries.size && geometryBytes + size > 4_000_000) {
      const first = geometries.keys().next().value!;
      geometryBytes -=
        first.length +
        geometries.get(first)!.id.length +
        geometries
          .get(first)!
          .paths.reduce((sum, path) => sum + path.length, 0);
      geometries.delete(first);
    }
    geometries.set(line.geometryKey, result);
    geometryBytes += size;
  }
  compactLines.set(line, result);
  return result;
}
