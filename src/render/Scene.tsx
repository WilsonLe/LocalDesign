import type { CSSProperties, PointerEventHandler } from "react";
import type { DesignDocument, DesignNode } from "../core/model";
import { measureText } from "./text";
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
      const { lines } = measureText(n);
      return (
        <text
          fill={n.fill}
          stroke={n.stroke}
          strokeWidth={n.strokeWidth}
          fontFamily="Inter"
          fontSize={n.fontSize}
          fontWeight={n.fontWeight}
          letterSpacing={n.letterSpacing}
          textAnchor={
            n.textAlign === "center"
              ? "middle"
              : n.textAlign === "right"
                ? "end"
                : "start"
          }
          xmlSpace="preserve"
        >
          {lines.map((line, i) => (
            <tspan
              key={i}
              x={
                n.textAlign === "center"
                  ? n.width / 2
                  : n.textAlign === "right"
                    ? n.width
                    : 0
              }
              y={n.fontSize + i * n.fontSize * n.lineHeight}
            >
              {line || " "}
            </tspan>
          ))}
        </text>
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
  return (
    <>
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
