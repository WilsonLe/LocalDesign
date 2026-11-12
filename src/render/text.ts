import type { DesignDocument, DesignNode } from "../core/model";
import { resolveFont } from "./fonts";
import { shapeLine } from "./glyphs";
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
export function measureText(n: DesignNode, doc?: DesignDocument) {
  const font = resolveFont(n, doc);
  const width = (text: string) =>
    font.record
      ? shapeLine(n, font.record, text).width
      : text.length * n.fontSize * 0.55 +
        Math.max(0, Array.from(text).length - 1) * n.letterSpacing;
  const lines: string[] = [];
  for (const paragraph of n.text.normalize("NFC").split("\n")) {
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
