import type { DesignDocument, DesignNode } from "../core/model";
import { resolveFont } from "./fonts";
import { fontKey } from "../fonts/data";
import { lineWidth, prefixWidths, shapeLine } from "./glyphs";
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
export function textLineOrigin(n: DesignNode, width: number, index: number) {
  return {
    x:
      n.textAlign === "center"
        ? (n.width - width) / 2
        : n.textAlign === "right"
          ? n.width - width
          : 0,
    y: n.fontSize + index * n.fontSize * n.lineHeight,
  };
}
type Measurement = ReturnType<typeof computeMeasurement>;
const measurements = new Map<string, Measurement>();
let retainedCharacters = 0;
export function measureText(
  n: DesignNode,
  doc?: DesignDocument,
  font = resolveFont(n, doc),
): Measurement {
  // Position, rotation and paint do not change wrapping or glyph metrics.
  // Include resolved bytes and request identity so replacement/readiness cannot go stale.
  const key = JSON.stringify([
    n.text,
    n.width,
    n.height,
    n.fontSize,
    n.lineHeight,
    n.letterSpacing,
    n.textAlign,
    font.requested,
    font.id,
    font.family,
    font.weight,
    font.style,
    font.record ? fontKey(font.record) : null,
    font.status,
    font.warning,
  ]);
  const old = measurements.get(key);
  if (old) return old;
  const result = computeMeasurement(n, font);
  while (
    measurements.size &&
    (measurements.size >= 2048 || retainedCharacters + key.length > 1_000_000)
  ) {
    const first = measurements.keys().next().value!;
    retainedCharacters -= first.length;
    measurements.delete(first);
  }
  measurements.set(key, result);
  retainedCharacters += key.length;
  return result;
}
function computeMeasurement(
  n: DesignNode,
  font: ReturnType<typeof resolveFont>,
) {
  let prepared = "",
    prefixes = new Map<number, number>();
  const prepare = (text: string) => {
    prepared = text;
    prefixes = font.record ? prefixWidths(n, font.record, text) : new Map();
  };
  const width = (text: string) => {
    const prefix = prefixes.get(text.length);
    if (prefix !== undefined && prepared.startsWith(text)) return prefix;
    return font.record
      ? lineWidth(n, font.record, text)
      : text.length * n.fontSize * 0.55 +
          Math.max(0, Array.from(text).length - 1) * n.letterSpacing;
  };
  const lines: string[] = [];
  for (const paragraph of n.text.normalize("NFC").split("\n")) {
    prepare(paragraph);
    let line = "";
    for (const { segment: char } of graphemes.segment(paragraph)) {
      if (line && width(line + char) > n.width) {
        const split = line.lastIndexOf(" ");
        if (split > line.length * 0.4) {
          lines.push(line.slice(0, split));
          line = line.slice(split + 1) + char;
        } else {
          lines.push(line);
          line = char;
        }
        // Re-shaping the remaining paragraph at each short wrap is quadratic.
        // Further lines keep exact standalone widths; bulk reuse covers the first.
        prepare("");
      } else line += char;
    }
    lines.push(line);
  }
  const textHeight = lines.length * n.fontSize * n.lineHeight;
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  if (font.record)
    for (const [index, line] of lines.entries()) {
      const shaped = shapeLine(n, font.record, line),
        origin = textLineOrigin(n, shaped.width, index);
      for (const glyph of shaped.glyphs) {
        left = Math.min(left, origin.x + glyph.ink.x);
        top = Math.min(top, origin.y + glyph.ink.y);
        right = Math.max(right, origin.x + glyph.ink.x + glyph.ink.width);
        bottom = Math.max(bottom, origin.y + glyph.ink.y + glyph.ink.height);
      }
    }
  return {
    lines,
    width: Math.max(0, ...lines.map(width)),
    height: textHeight,
    inkBounds: Number.isFinite(left)
      ? { x: left, y: top, width: right - left, height: bottom - top }
      : null,
    overflow: textHeight > n.height || lines.some((l) => width(l) > n.width),
    fallbackWarning:
      [
        font.warning,
        font.missingGlyphCount
          ? `Missing glyphs: ${font.missingGlyphs.join(" ")}. Add a font covering these characters; missing-glyph placeholders are not a typography match.`
          : null,
      ]
        .filter(Boolean)
        .join(" ") || null,
    fontId: font.id,
    requestedFont: font.requested,
    resolvedFont: {
      family: font.family,
      weight: font.weight,
      style: font.style,
    },
    fontStatus: font.status,
    portable: font.portable,
    missingGlyphs: font.missingGlyphs,
    measuredIn: font.record
      ? "shared embedded-font glyph shaping"
      : "approximation; browser preview required",
  };
}
