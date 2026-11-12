import type { DesignDocument, DesignNode } from "../core/model";
import { fontEpoch, resolveFont } from "./fonts";
import { measureText } from "./text";
import { shapeLine } from "./glyphs";

// Scene snapshots retain node identity during pan/zoom and unchanged gesture previews.
// Weak keys release the shaped runs with the snapshot, independent of the small
// transient prefix cache used while wrapping. Resolved records invalidate readiness.
const shapes = new WeakMap<
  DesignNode,
  {
    fonts: DesignDocument["fonts"];
    epoch: number;
    value: ReturnType<typeof compute>;
  }
>();
function compute(
  node: DesignNode,
  doc: DesignDocument,
  font: ReturnType<typeof resolveFont>,
) {
  const measurement = measureText(node, doc);
  return {
    font,
    measurement,
    lines: font.record
      ? measurement.lines.map((line) => shapeLine(node, font.record!, line))
      : [],
  };
}
export function textShape(node: DesignNode, doc: DesignDocument) {
  const epoch = fontEpoch();
  const cached = shapes.get(node);
  if (cached && cached.fonts === doc.fonts && cached.epoch === epoch)
    return cached.value;
  const value = compute(node, doc, resolveFont(node, doc));
  shapes.set(node, { fonts: doc.fonts, epoch, value });
  return value;
}
