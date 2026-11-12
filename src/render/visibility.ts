import type { DesignDocument, DesignNode } from "../core/model";
import { transform } from "../core/geometry";
import type { NodeIndex } from "../core/tree";
import { textShape } from "./textShape";

export type ViewBox = { x: number; y: number; width: number; height: number };
const intersects = (a: ViewBox, b: ViewBox) =>
  a.x <= b.x + b.width &&
  a.x + a.width >= b.x &&
  a.y <= b.y + b.height &&
  a.y + a.height >= b.y;

// Inverse-transform all four viewport corners: conservative under nested rotations.
function localView(view: ViewBox, node: DesignNode): ViewBox {
  const points = [
    { x: view.x, y: view.y },
    { x: view.x + view.width, y: view.y },
    { x: view.x, y: view.y + view.height },
    { x: view.x + view.width, y: view.y + view.height },
  ].map((p) => transform(p, node, true));
  const x = Math.min(...points.map((p) => p.x));
  const y = Math.min(...points.map((p) => p.y));
  return {
    x,
    y,
    width: Math.max(...points.map((p) => p.x)) - x,
    height: Math.max(...points.map((p) => p.y)) - y,
  };
}

// This is a view filter only. Export and the document/selection owners keep all nodes.
export function visibleNodes(
  doc: DesignDocument,
  roots: DesignNode[],
  index: NodeIndex,
  view: ViewBox,
) {
  const visible = new Set<string>();
  function visit(node: DesignNode, parentView: ViewBox): boolean {
    if (node.hidden) return false;
    const local = localView(parentView, node);
    const stroke = node.stroke === "none" ? 0 : node.strokeWidth / 2;
    const box = {
      x: -stroke,
      y: -stroke,
      width: node.width + stroke * 2,
      height: node.height + stroke * 2,
    };
    const inBox = intersects(local, box);
    const clipped = node.type === "frame" && node.clip;
    if (clipped && !inBox) return false;
    let childVisible = false;
    for (const child of index.children.get(node.id) ?? [])
      childVisible = visit(child, local) || childVisible;
    const ink =
      node.type === "text" ? textShape(node, doc).measurement.inkBounds : null;
    const paint = {
      x: Math.min(0, ink?.x ?? 0) - stroke,
      y: Math.min(0, ink?.y ?? 0) - stroke,
      width:
        Math.max(node.width, ink ? ink.x + ink.width : 0) -
        Math.min(0, ink?.x ?? 0) +
        stroke * 2,
      height:
        Math.max(node.height, ink ? ink.y + ink.height : 0) -
        Math.min(0, ink?.y ?? 0) +
        stroke * 2,
    };
    // Path data is not constrained to its logical box. Never reject it by that box.
    if (childVisible || node.type === "path" || intersects(local, paint)) {
      visible.add(node.id);
      return true;
    }
    return false;
  }
  roots.forEach((node) => visit(node, view));
  return visible;
}
