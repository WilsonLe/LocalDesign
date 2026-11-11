import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { DesignEngine, Snapshot } from "../core/engine";
import type { Command } from "../core/commands";
import {
  ancestors,
  makeNode,
  roots,
  type DesignDocument,
  type DesignNode,
} from "../core/model";
import {
  bounds,
  localPoint,
  worldPoint,
  worldRotation,
  type Point,
} from "../core/geometry";
import { Scene } from "../render/Scene";
export type Tool =
  | "select"
  | "hand"
  | "frame"
  | "rectangle"
  | "ellipse"
  | "line"
  | "path"
  | "text"
  | "image";
type Gesture = {
  mode: "move" | "pan" | "draw" | "resize" | "rotate" | "marquee";
  start: Point;
  client: Point;
  doc: DesignDocument;
  pageId: string;
  nodes: DesignNode[];
  node?: DesignNode;
  handle?: string;
  viewport: Snapshot["viewport"];
  moved: boolean;
  shift: boolean;
};
export function Canvas({
  engine,
  snapshot,
  tool,
  setTool,
  onError,
  onImage,
}: {
  engine: DesignEngine;
  snapshot: Snapshot;
  tool: Tool;
  setTool: (t: Tool) => void;
  onError: (s: string) => void;
  onImage: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null),
    gesture = useRef<Gesture | null>(null),
    space = useRef(false);
  const [preview, setPreview] = useState<DesignDocument | null>(null),
    [marquee, setMarquee] = useState<{
      x: number;
      y: number;
      width: number;
      height: number;
    } | null>(null);
  const { document: doc, pageId, selection, viewport: v } = snapshot;
  const rendered = preview ?? doc;
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          gesture.current = null;
          setPreview(null);
          setMarquee(null);
        }
        if (
          e.code === "Space" &&
          !/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)
        ) {
          space.current = true;
          e.preventDefault();
        }
      },
      up = (e: KeyboardEvent) => {
        if (e.code === "Space") space.current = false;
      };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    const blur = () => {
      space.current = false;
    };
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);
  const client = (e: { clientX: number; clientY: number }): Point => {
    const box = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };
  const world = (p: Point): Point => ({
    x: (p.x - v.x) / v.zoom,
    y: (p.y - v.y) / v.zoom,
  });
  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    e.currentTarget.focus();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = client(e),
      start = world(p),
      target = e.target as Element;
    const handle = target.getAttribute("data-handle") ?? undefined;
    const nodeId = target
      .closest("[data-node-id]")
      ?.getAttribute("data-node-id");
    const clicked = doc.nodes.find((n) => n.id === nodeId);
    let selected = selection;
    let mode: Gesture["mode"];
    let node: DesignNode | undefined;
    if (e.button === 1 || tool === "hand" || space.current) mode = "pan";
    else if (handle) {
      mode = handle === "rotate" ? "rotate" : "resize";
      node = doc.nodes.find((n) => n.id === selection[0]);
    } else if (tool === "image") {
      onImage();
      return;
    } else if (tool !== "select") {
      let parent =
        clicked?.type === "frame"
          ? clicked
          : clicked
            ? ancestors(doc, clicked).find((n) => n.type === "frame")
            : undefined;
      if (tool === "frame") parent = undefined;
      const local = localPoint(doc, parent, start);
      node = makeNode(tool, pageId, {
        ...local,
        parentId: parent?.id ?? null,
        width: tool === "frame" ? 360 : tool === "text" ? 240 : 160,
        height: tool === "frame" ? 240 : tool === "text" ? 80 : 100,
        ...(tool === "path" ? { path: "M0 0 L160 100" } : {}),
      });
      mode = "draw";
    } else if (clicked) {
      if (e.shiftKey) {
        selected = selection.includes(clicked.id)
          ? selection.filter((id) => id !== clicked.id)
          : [...selection, clicked.id];
        engine.select(selected);
      } else if (!selection.includes(clicked.id)) {
        selected = [clicked.id];
        engine.select(selected);
      }
      mode = "move";
    } else {
      if (!e.shiftKey) engine.select([]);
      mode = "marquee";
    }
    gesture.current = {
      mode,
      start,
      client: p,
      doc,
      pageId,
      nodes: roots(doc, selected).filter(
        (n) => !n.locked && !ancestors(doc, n).some((p) => p.locked),
      ),
      node,
      handle,
      viewport: v,
      moved: false,
      shift: e.shiftKey,
    };
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g) return;
    const p = client(e),
      q = {
        x: (p.x - g.viewport.x) / g.viewport.zoom,
        y: (p.y - g.viewport.y) / g.viewport.zoom,
      };
    g.moved ||= Math.hypot(p.x - g.client.x, p.y - g.client.y) > 2;
    if (g.mode === "pan") {
      engine.setViewport({
        ...g.viewport,
        x: g.viewport.x + p.x - g.client.x,
        y: g.viewport.y + p.y - g.client.y,
      });
      return;
    }
    if (g.mode === "marquee") {
      setMarquee({
        x: Math.min(q.x, g.start.x),
        y: Math.min(q.y, g.start.y),
        width: Math.abs(q.x - g.start.x),
        height: Math.abs(q.y - g.start.y),
      });
      return;
    }
    const next = structuredClone(g.doc),
      dx = q.x - g.start.x,
      dy = q.y - g.start.y;
    const snap = (n: number) => (e.altKey ? n : Math.round(n / 4) * 4);
    if (g.mode === "move") {
      for (const original of g.nodes) {
        const node = next.nodes.find((n) => n.id === original.id)!,
          parent = original.parentId
            ? g.doc.nodes.find((n) => n.id === original.parentId)
            : undefined;
        const origin = worldPoint(g.doc, original),
          pos = localPoint(g.doc, parent, {
            x: origin.x + dx,
            y: origin.y + dy,
          });
        node.x = snap(pos.x);
        node.y = snap(pos.y);
      }
    }
    if (g.mode === "draw" && g.node) {
      const node = { ...g.node };
      if (g.moved) {
        const parent = node.parentId
            ? g.doc.nodes.find((n) => n.id === node.parentId)
            : undefined,
          a = localPoint(g.doc, parent, g.start),
          b = localPoint(g.doc, parent, q);
        node.x = snap(Math.min(a.x, b.x));
        node.y = snap(Math.min(a.y, b.y));
        node.width = Math.max(1, snap(Math.abs(b.x - a.x)));
        node.height = Math.max(1, snap(Math.abs(b.y - a.y)));
        if (node.type === "line" || node.type === "path") {
          node.path = `M${b.x < a.x ? node.width : 0} ${b.y < a.y ? node.height : 0} L${b.x < a.x ? 0 : node.width} ${b.y < a.y ? 0 : node.height}`;
          if (node.type === "line" && b.x < a.x !== b.y < a.y)
            node.type = "path";
        }
      }
      next.nodes.push(node);
    }
    if (g.mode === "resize" && g.node) {
      const original = g.node,
        node = next.nodes.find((n) => n.id === original.id)!;
      const a = localPoint(g.doc, original, g.start),
        b = localPoint(g.doc, original, q),
        ddx = b.x - a.x,
        ddy = b.y - a.y;
      let sx = 0,
        sy = 0;
      if (g.handle!.includes("w")) {
        sx = Math.min(original.width - 1, ddx);
        node.width = Math.max(1, snap(original.width - ddx));
      } else node.width = Math.max(1, snap(original.width + ddx));
      if (g.handle!.includes("n")) {
        sy = Math.min(original.height - 1, ddy);
        node.height = Math.max(1, snap(original.height - ddy));
      } else node.height = Math.max(1, snap(original.height + ddy));
      const r = (original.rotation * Math.PI) / 180;
      node.x = original.x + sx * Math.cos(r) - sy * Math.sin(r);
      node.y = original.y + sx * Math.sin(r) + sy * Math.cos(r);
    }
    if (g.mode === "rotate" && g.node) {
      const node = next.nodes.find((n) => n.id === g.node!.id)!,
        origin = worldPoint(g.doc, g.node);
      const degrees =
        ((Math.atan2(q.y - origin.y, q.x - origin.x) -
          Math.atan2(g.start.y - origin.y, g.start.x - origin.x)) *
          180) /
        Math.PI;
      node.rotation = e.shiftKey
        ? Math.round((g.node.rotation + degrees) / 15) * 15
        : g.node.rotation + degrees;
    }
    setPreview(next);
  };
  const end = () => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    try {
      if (g.mode === "marquee" && marquee) {
        const hits = doc.nodes
          .filter((n) => n.pageId === pageId && !n.parentId && !n.hidden)
          .filter((n) => {
            const b = bounds(doc, [n]);
            return (
              b.x >= marquee.x &&
              b.y >= marquee.y &&
              b.x + b.width <= marquee.x + marquee.width &&
              b.y + b.height <= marquee.y + marquee.height
            );
          })
          .map((n) => n.id);
        engine.select(g.shift ? [...new Set([...selection, ...hits])] : hits);
      }
      if (g.mode === "draw" && g.node) {
        const n = preview?.nodes.find((n) => n.id === g.node!.id) ?? g.node;
        engine.edit({
          expectedDocumentId: g.doc.id,
          expectedRevision: g.doc.revision,
          requestId: crypto.randomUUID(),
          commands: [{ op: "create", node: n }],
        });
        engine.select([n.id]);
        setTool("select");
      } else if (
        preview &&
        g.moved &&
        ["move", "resize", "rotate"].includes(g.mode)
      ) {
        const ids = g.mode === "move" ? g.nodes.map((n) => n.id) : [g.node!.id];
        const commands: Command[] = ids.map((id) => {
          const n = preview.nodes.find((n) => n.id === id)!;
          return {
            op: "update",
            ids: [id],
            patch: {
              x: n.x,
              y: n.y,
              width: n.width,
              height: n.height,
              rotation: n.rotation,
            },
          };
        });
        if (commands.length)
          engine.edit({
            expectedDocumentId: g.doc.id,
            expectedRevision: g.doc.revision,
            requestId: crypto.randomUUID(),
            commands,
          });
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreview(null);
      setMarquee(null);
    }
  };
  const cancel = () => {
    gesture.current = null;
    setPreview(null);
    setMarquee(null);
  };
  const selectedNodes = roots(rendered, selection);
  const page = doc.pages.find((p) => p.id === pageId)!;
  useEffect(() => {
    const svg = svgRef.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const view = engine.viewport;
      if (e.ctrlKey || e.metaKey) {
        const box = svg.getBoundingClientRect(),
          x = e.clientX - box.left,
          y = e.clientY - box.top,
          zoom = Math.max(
            0.05,
            Math.min(8, view.zoom * Math.exp(-e.deltaY * 0.006)),
          );
        engine.setViewport({
          zoom,
          x: x - ((x - view.x) * zoom) / view.zoom,
          y: y - ((y - view.y) * zoom) / view.zoom,
        });
      } else engine.setViewport({ x: view.x - e.deltaX, y: view.y - e.deltaY });
    };
    svg.addEventListener("wheel", wheel, { passive: false });
    return () => svg.removeEventListener("wheel", wheel);
  }, [engine]);
  return (
    <div className="canvas-container">
      <svg
        ref={svgRef}
        className={`canvas tool-${tool}`}
        data-testid="canvas"
        tabIndex={0}
        role="application"
        aria-label="Design canvas. Use the layers panel and inspector for keyboard editing."
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={cancel}
        style={{ background: page.background }}
      >
        <defs>
          <pattern
            id="dots"
            width={24 * v.zoom}
            height={24 * v.zoom}
            patternUnits="userSpaceOnUse"
            x={v.x}
            y={v.y}
          >
            <circle cx="1" cy="1" r="0.8" fill="#ffffff" opacity="0.14" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dots)" />
        <g transform={`translate(${v.x} ${v.y}) scale(${v.zoom})`}>
          <Scene doc={rendered} pageId={pageId} interactive />
          {rendered.nodes
            .filter(
              (n) =>
                n.pageId === pageId &&
                n.type === "frame" &&
                !n.parentId &&
                !n.hidden,
            )
            .map((n) => (
              <text
                key={n.id}
                x={n.x}
                y={n.y - 10 / v.zoom}
                fontSize={11 / v.zoom}
                fill="#aaaab3"
                style={{ pointerEvents: "none" }}
              >
                {n.name}
              </text>
            ))}
          {selectedNodes
            .filter((n) => !n.hidden)
            .map((n) => {
              const p = worldPoint(rendered, n),
                rot = worldRotation(rendered, n);
              return (
                <g
                  key={n.id}
                  transform={`translate(${p.x} ${p.y}) rotate(${rot})`}
                >
                  <rect
                    width={n.width}
                    height={n.height}
                    fill="none"
                    stroke="#a59bff"
                    strokeWidth={1.5 / v.zoom}
                    style={{ pointerEvents: "none" }}
                  />
                  {selectedNodes.length === 1 && !n.locked && (
                    <>
                      <line
                        x1={n.width / 2}
                        y1={0}
                        x2={n.width / 2}
                        y2={-24 / v.zoom}
                        stroke="#a59bff"
                        strokeWidth={1 / v.zoom}
                      />
                      <circle
                        data-handle="rotate"
                        cx={n.width / 2}
                        cy={-24 / v.zoom}
                        r={5 / v.zoom}
                        fill="#a59bff"
                        style={{ cursor: "grab" }}
                      />
                      {[
                        ["nw", 0, 0],
                        ["ne", n.width, 0],
                        ["sw", 0, n.height],
                        ["se", n.width, n.height],
                      ].map(([h, x, y]) => (
                        <rect
                          key={h}
                          data-handle={h}
                          x={Number(x) - 4 / v.zoom}
                          y={Number(y) - 4 / v.zoom}
                          width={8 / v.zoom}
                          height={8 / v.zoom}
                          fill="#fff"
                          stroke="#8b7cff"
                          strokeWidth={1 / v.zoom}
                          style={{ cursor: `${h}-resize` }}
                        />
                      ))}
                    </>
                  )}
                </g>
              );
            })}
          {marquee && (
            <rect
              {...marquee}
              fill="#9689ff"
              fillOpacity="0.1"
              stroke="#a59bff"
              strokeWidth={1 / v.zoom}
            />
          )}
        </g>
      </svg>
      {doc.nodes.every((n) => n.pageId !== pageId) && (
        <div className="canvas-empty">
          <div className="empty-cross">+</div>
          <h1>A little space for your next idea.</h1>
          <p>Draw a frame, add a shape, or import a design.</p>
          <span>
            F for frame <i>·</i> R for rectangle <i>·</i> T for text
          </span>
        </div>
      )}
      <div className="canvas-hint">
        {tool === "select"
          ? "Drag to select · Space to pan · ⌘/Ctrl + scroll to zoom"
          : tool === "hand"
            ? "Drag to pan the canvas"
            : `Click or drag to add ${tool === "ellipse" ? "an" : "a"} ${tool}`}
      </div>
    </div>
  );
}
