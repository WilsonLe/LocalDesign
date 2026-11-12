import type { CSSProperties, PointerEventHandler } from "react";
import { ancestors, type DesignDocument, type DesignNode } from "../core/model";
import { measureText } from "./text";
import { resolveFont } from "./fonts";
import { shapeLine } from "./glyphs";
export function NodeShape({
  node: n,
  doc,
}: {
  node: DesignNode;
  doc: DesignDocument;
}) {
  const style = { fill: n.fill, stroke: n.stroke, strokeWidth: n.strokeWidth };
  switch (n.type) {
    case "rectangle":
    case "frame":
      return (
        <rect width={n.width} height={n.height} rx={n.radius} {...style} />
      );
    case "ellipse":
      return (
        <ellipse
          cx={n.width / 2}
          cy={n.height / 2}
          rx={n.width / 2}
          ry={n.height / 2}
          {...style}
        />
      );
    case "line":
      return <line x1={0} y1={0} x2={n.width} y2={n.height} {...style} />;
    case "path":
      return <path d={n.path} {...style} />;
    case "text": {
      const { lines } = measureText(n, doc);
      const font = resolveFont(n, doc);
      return (
        <g aria-label={n.text} data-font-id={font.id}>
          <title>{n.text}</title>
          {font.record &&
            lines.map((line, i) => {
              const shaped = shapeLine(n, font.record!, line);
              const x =
                n.textAlign === "center"
                  ? (n.width - shaped.width) / 2
                  : n.textAlign === "right"
                    ? n.width - shaped.width
                    : 0;
              const baseline = n.fontSize + i * n.fontSize * n.lineHeight;
              return (
                <g key={i} transform={`translate(${x} ${baseline})`}>
                  {shaped.glyphs.map((glyph, j) => (
                    <use
                      key={j}
                      href={`#${glyph.id}`}
                      transform={`translate(${glyph.x} ${glyph.y}) scale(${glyph.scale} ${-glyph.scale})`}
                      fill={n.fill}
                      stroke={n.stroke}
                      strokeWidth={n.strokeWidth / glyph.scale}
                    />
                  ))}
                </g>
              );
            })}
        </g>
      );
    }
    case "image":
      return (
        <image
          href={doc.assets.find((a) => a.id === n.assetId)?.data}
          width={n.width}
          height={n.height}
          preserveAspectRatio="xMidYMid slice"
        />
      );
    case "group":
      return null;
  }
}
export function SceneNode({
  node: n,
  doc,
  onPointerDown,
  interactive = false,
}: {
  node: DesignNode;
  doc: DesignDocument;
  onPointerDown?: PointerEventHandler<SVGGElement>;
  interactive?: boolean;
}) {
  if (n.hidden) return null;
  const children = doc.nodes.filter((c) => c.parentId === n.id);
  return (
    <g
      data-node-id={interactive ? n.id : undefined}
      transform={`translate(${n.x} ${n.y}) rotate(${n.rotation})`}
      opacity={n.opacity}
      onPointerDown={onPointerDown}
      style={
        interactive
          ? { cursor: n.locked ? "not-allowed" : "default" }
          : undefined
      }
    >
      {n.clip && n.type === "frame" && (
        <defs>
          <clipPath id={`clip-${n.id}`}>
            <rect width={n.width} height={n.height} rx={n.radius} />
          </clipPath>
        </defs>
      )}
      <NodeShape node={n} doc={doc} />
      {interactive && (
        <rect
          width={n.width}
          height={n.height}
          fill="transparent"
          stroke="none"
          style={{ pointerEvents: "all" } as CSSProperties}
        />
      )}
      <g
        clipPath={
          n.clip && n.type === "frame" ? `url(#clip-${n.id})` : undefined
        }
      >
        {children.map((child) => (
          <SceneNode
            key={child.id}
            node={child}
            doc={doc}
            onPointerDown={onPointerDown}
            interactive={interactive}
          />
        ))}
      </g>
    </g>
  );
}
export function Scene({
  doc,
  pageId,
  rootIds,
  interactive = false,
  onPointerDown,
}: {
  doc: DesignDocument;
  pageId: string;
  rootIds?: string[];
  interactive?: boolean;
  onPointerDown?: PointerEventHandler<SVGGElement>;
}) {
  const glyphs = new Map<string, string>();
  for (const node of doc.nodes.filter(
    (n) =>
      n.type === "text" &&
      n.pageId === pageId &&
      !n.hidden &&
      !ancestors(doc, n).some((p) => p.hidden),
  )) {
    const font = resolveFont(node, doc);
    if (font.record)
      for (const line of measureText(node, doc).lines)
        for (const glyph of shapeLine(node, font.record, line).glyphs)
          glyphs.set(glyph.id, glyph.path);
  }
  return (
    <>
      <defs>
        {[...glyphs].map(([id, d]) => (
          <path key={id} id={id} d={d} />
        ))}
      </defs>
      {doc.nodes
        .filter((n) =>
          rootIds ? rootIds.includes(n.id) : n.pageId === pageId && !n.parentId,
        )
        .map((n) => (
          <SceneNode
            key={n.id}
            node={n}
            doc={doc}
            interactive={interactive}
            onPointerDown={onPointerDown}
          />
        ))}
    </>
  );
}
