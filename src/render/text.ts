import type { DesignNode } from "../core/model";
let context: CanvasRenderingContext2D | null | undefined;
export function measureText(n: DesignNode) {
  if (context === undefined)
    context =
      typeof document === "undefined"
        ? null
        : document.createElement("canvas").getContext("2d");
  if (context) context.font = `${n.fontWeight} ${n.fontSize}px Inter`;
  const width = (text: string) =>
    (context
      ? context.measureText(text).width
      : text.length * n.fontSize * 0.55) +
    Math.max(0, Array.from(text).length - 1) * n.letterSpacing;
  const lines: string[] = [];
  for (const paragraph of n.text.split("\n")) {
    let line = "";
    for (const char of Array.from(paragraph)) {
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
  return {
    lines,
    width: Math.max(0, ...lines.map(width)),
    height: textHeight,
    overflow: textHeight > n.height || lines.some((l) => width(l) > n.width),
    fallbackWarning:
      /[^\u0000-\u024f\u0300-\u036f\u1e00-\u1eff\u2000-\u206f\u20a0-\u20cf\u2122\u2191\u2193\u2212\u2215]/u.test(
        n.text,
      )
        ? "Some glyphs may use a system fallback. Verify appearance before export."
        : null,
    fontId: `inter-${n.fontWeight}`,
    measuredIn: context
      ? "browser canvas"
      : "approximation; browser preview required",
  };
}
