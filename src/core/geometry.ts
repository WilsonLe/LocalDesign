import { ancestors, type DesignDocument, type DesignNode } from "./model";
export type Point = { x: number; y: number };
export function transform(p: Point, n: DesignNode, inverse = false): Point {
  const a = ((n.rotation * Math.PI) / 180) * (inverse ? -1 : 1);
  const q = inverse ? { x: p.x - n.x, y: p.y - n.y } : p;
  const r = {
    x: q.x * Math.cos(a) - q.y * Math.sin(a),
    y: q.x * Math.sin(a) + q.y * Math.cos(a),
  };
  return inverse ? r : { x: r.x + n.x, y: r.y + n.y };
}
export function worldPoint(
  d: DesignDocument,
  n: DesignNode,
  p: Point = { x: 0, y: 0 },
): Point {
  let q = transform(p, n);
  for (const parent of ancestors(d, n)) q = transform(q, parent);
  return q;
}
export function localPoint(
  d: DesignDocument,
  parent: DesignNode | undefined,
  p: Point,
): Point {
  if (!parent) return p;
  let q = p;
  for (const n of [...ancestors(d, parent)].reverse())
    q = transform(q, n, true);
  return transform(q, parent, true);
}
export function worldRotation(d: DesignDocument, n: DesignNode) {
  return n.rotation + ancestors(d, n).reduce((s, n) => s + n.rotation, 0);
}
export function bounds(d: DesignDocument, nodes: DesignNode[]) {
  if (!nodes.length) return { x: 0, y: 0, width: 800, height: 600 };
  const points = nodes.flatMap((n) =>
    [
      { x: 0, y: 0 },
      { x: n.width, y: 0 },
      { x: n.width, y: n.height },
      { x: 0, y: n.height },
    ].map((p) => worldPoint(d, n, p)),
  );
  const x = Math.min(...points.map((p) => p.x)),
    y = Math.min(...points.map((p) => p.y));
  return {
    x,
    y,
    width: Math.max(1, Math.max(...points.map((p) => p.x)) - x),
    height: Math.max(1, Math.max(...points.map((p) => p.y)) - y),
  };
}
export function applyLayouts(d: DesignDocument) {
  const containers = d.nodes
    .filter((n) => n.type === "frame" && n.layout.direction !== "none")
    .sort((a, b) => ancestors(d, b).length - ancestors(d, a).length);
  for (const frame of containers) {
    const { direction, gap, padding, align } = frame.layout;
    let offset = padding;
    for (const n of d.nodes.filter(
      (n) => n.parentId === frame.id && !n.hidden,
    )) {
      const horizontal = direction === "horizontal";
      const space = (horizontal ? frame.height : frame.width) - padding * 2;
      const size = horizontal ? n.height : n.width;
      const cross =
        padding +
        (align === "center"
          ? (space - size) / 2
          : align === "end"
            ? space - size
            : 0);
      n.x = horizontal ? offset : cross;
      n.y = horizontal ? cross : offset;
      offset += (horizontal ? n.width : n.height) + gap;
    }
  }
}
