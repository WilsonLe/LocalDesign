import {
  memo,
  useMemo,
  type CSSProperties,
  type PointerEventHandler,
} from "react";
import { indexNodes, type NodeIndex } from "../core/tree";
import { ancestors, type DesignDocument, type DesignNode } from "../core/model";
import { textLineOrigin } from "./text";
import { textShape } from "./textShape";
import { compactLine } from "./glyphs";
import { visibleNodes, type ViewBox } from "./visibility";
export const NodeShape = memo(
  function NodeShape({
    node: n,
    doc,
    glyphPrefix = "",
    compactText = false,
  }: {
    node: DesignNode;
    doc: DesignDocument;
    glyphPrefix?: string;
    compactText?: boolean;
  }) {
    const style = {
      fill: n.fill,
      stroke: n.stroke,
      strokeWidth: n.strokeWidth,
    };
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
        const { lines, font } = textShape(n, doc);
        return (
          <g aria-label={n.text} data-font-id={font.id}>
            <title>{n.text}</title>
            {font.record &&
              lines.map((shaped, i) => {
                const origin = textLineOrigin(n, shaped.width, i);
                const compact =
                  compactText && n.stroke === "none"
                    ? compactLine(shaped)
                    : null;
                return (
                  <g key={i} transform={`translate(${origin.x} ${origin.y})`}>
                    {compact
                      ? compact.map((d, j) => (
                          <path
                            key={j}
                            d={d}
                            fill={n.fill}
                            data-compact-text=""
                          />
                        ))
                      : shaped.glyphs.map((glyph, j) => (
                          <use
                            key={j}
                            href={`#${glyphPrefix}${glyph.id}`}
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
  },
  (previous, next) =>
    previous.node === next.node &&
    previous.doc.assets === next.doc.assets &&
    previous.doc.fonts === next.doc.fonts &&
    previous.glyphPrefix === next.glyphPrefix &&
    previous.compactText === next.compactText,
);

export function SceneNode({
  node: n,
  doc,
  onPointerDown,
  interactive = false,
  glyphPrefix = "",
  index,
  visible,
  compactText = false,
}: {
  node: DesignNode;
  doc: DesignDocument;
  index: NodeIndex;
  visible?: Set<string>;
  compactText?: boolean;
  onPointerDown?: PointerEventHandler<SVGGElement>;
  interactive?: boolean;
  glyphPrefix?: string;
}) {
  if (n.hidden || (visible && !visible.has(n.id))) return null;
  const children = index.children.get(n.id) ?? [];
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
      <NodeShape
        node={n}
        doc={doc}
        glyphPrefix={glyphPrefix}
        compactText={compactText}
      />
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
            index={index}
            visible={visible}
            compactText={compactText}
            doc={doc}
            onPointerDown={onPointerDown}
            interactive={interactive}
            glyphPrefix={glyphPrefix}
          />
        ))}
      </g>
    </g>
  );
}
export const Scene = memo(function Scene({
  doc,
  pageId,
  rootIds,
  interactive = false,
  onPointerDown,
  glyphPrefix = "",
  viewBox,
  compactText = false,
}: {
  doc: DesignDocument;
  pageId: string;
  rootIds?: string[];
  viewBox?: ViewBox;
  compactText?: boolean;
  interactive?: boolean;
  onPointerDown?: PointerEventHandler<SVGGElement>;
  glyphPrefix?: string;
}) {
  const index = useMemo(() => indexNodes(doc), [doc.nodes]);
  const roots = doc.nodes.filter((n) =>
    rootIds ? rootIds.includes(n.id) : n.pageId === pageId && !n.parentId,
  );
  const visible = viewBox
    ? visibleNodes(doc, roots, index, viewBox)
    : undefined;
  const glyphs = new Map<string, string>();
  for (const node of doc.nodes.filter(
    (n) =>
      (!visible || visible.has(n.id)) &&
      n.type === "text" &&
      n.pageId === pageId &&
      !n.hidden &&
      !ancestors(doc, n, index.byId).some((p) => p.hidden),
  )) {
    for (const line of textShape(node, doc).lines) {
      if (compactText && node.stroke === "none" && compactLine(line)) continue;
      for (const glyph of line.glyphs) glyphs.set(glyph.id, glyph.path);
    }
  }
  return (
    <>
      <defs>
        {[...glyphs].map(([id, d]) => (
          <path key={id} id={`${glyphPrefix}${id}`} d={d} />
        ))}
      </defs>
      {roots.map((n) => (
        <SceneNode
          key={n.id}
          node={n}
          index={index}
          visible={visible}
          compactText={compactText}
          doc={doc}
          interactive={interactive}
          onPointerDown={onPointerDown}
          glyphPrefix={glyphPrefix}
        />
      ))}
    </>
  );
});
