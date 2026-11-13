import { WindowedList } from "./WindowedList";
import { indexNodes } from "../core/tree";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Frame,
  Image,
  Layers as LayersIcon,
  LockKeyhole,
  Plus,
  Search,
  Type,
  UnlockKeyhole,
  Trash2,
} from "lucide-react";
import type { DesignEngine, Snapshot } from "../core/engine";
import { ancestors, uid, type DesignNode } from "../core/model";
import { worldPoint } from "../core/geometry";
import type { Command } from "../core/commands";
export const Layers = memo(function Layers({
  engine,
  document: doc,
  pageId,
  selection,
  onError,
  onFocusLayer,
}: {
  engine: DesignEngine;
  document: Snapshot["document"];
  pageId: string;
  selection: string[];
  onError: (s: string) => void;
  onFocusLayer: (id: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [collapsed, setCollapsed] = useState(new Set<string>());
  const activePage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const page = activePage.current;
    if (!page) return;
    // Size notifications arrive after layout, so revealing the page does not
    // force a synchronous reflow of the newly mounted SVG. A closed drawer
    // keeps its observer until it is opened and has a real scroll area.
    const observer = new ResizeObserver(([entry]) => {
      if (!entry?.contentRect.height) return;
      page.scrollIntoView({ block: "nearest" });
      observer.disconnect();
    });
    observer.observe(page.parentElement!);
    return () => observer.disconnect();
  }, [pageId]);
  const run = (commands: Command[]) => {
    try {
      engine.dispatch(commands);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  const index = useMemo(() => indexNodes(doc), [doc.nodes]);
  // Display reading order only: never reorder scene nodes (paint/layout order).
  const childrenByParent = useMemo(() => {
    const childrenByParent = new Map<string | null, DesignNode[]>();
    const positions = new Map<string, { x: number; y: number }>();
    for (const node of doc.nodes) {
      if (node.pageId !== pageId) continue;
      const key = node.parentId ?? null;
      const siblings = childrenByParent.get(key) ?? [];
      siblings.push(node);
      childrenByParent.set(key, siblings);
      positions.set(node.id, worldPoint(doc, node, undefined, index));
    }
    for (const siblings of childrenByParent.values())
      siblings.sort((a, b) => {
        const p = positions.get(a.id)!,
          q = positions.get(b.id)!;
        return p.y - q.y || p.x - q.x;
      });
    return childrenByParent;
  }, [doc, pageId, index]);
  const rows = useMemo(() => {
    const matches = new Set<string>();
    const term = query.toLowerCase();
    if (term)
      for (const node of doc.nodes) {
        if (node.pageId === pageId && node.name.toLowerCase().includes(term)) {
          matches.add(node.id);
          for (const parent of ancestors(doc, node, index.byId))
            matches.add(parent.id);
        }
      }
    const result: { node: DesignNode; depth: number }[] = [];
    const visit = (parentId: string | null, depth: number) => {
      for (const node of childrenByParent.get(parentId) ?? []) {
        if (term && !matches.has(node.id)) continue;
        result.push({ node, depth });
        if (term || !collapsed.has(node.id)) visit(node.id, depth + 1);
      }
    };
    visit(null, 0);
    return result;
  }, [doc, pageId, query, collapsed, childrenByParent, index]);
  const rowIds = useMemo(() => rows.map(({ node }) => node.id), [rows]);
  const selected = new Set(selection);
  const activate = (id: string, shift: boolean) => {
    engine.select(
      shift
        ? selection.includes(id)
          ? selection.filter((selected) => selected !== id)
          : [...selection, id]
        : [id],
    );
    onFocusLayer(id);
  };
  const row = (n: DesignNode, depth = 0) => {
    const children = childrenByParent.get(n.id) ?? [],
      isCollapsed = collapsed.has(n.id) && !query;
    const Icon =
      n.type === "frame"
        ? Frame
        : n.type === "text"
          ? Type
          : n.type === "image"
            ? Image
            : LayersIcon;
    return (
      <div key={n.id}>
        <div
          className={`layer-row ${selected.has(n.id) ? "selected" : ""} ${n.hidden ? "hidden-layer" : ""}`}
          style={{ paddingLeft: 10 + depth * 14 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) activate(n.id, e.shiftKey);
          }}
        >
          <span className="collapse-hit-target">
            <Button
              className="collapse-layer"
              aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${n.name}`}
              disabled={!children.length}
              onClick={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(n.id)) next.delete(n.id);
                  else next.add(n.id);
                  return next;
                })
              }
            >
              {children.length ? (
                isCollapsed ? (
                  <ChevronRight size={12} />
                ) : (
                  <ChevronDown size={12} />
                )
              ) : (
                <span />
              )}
            </Button>
          </span>
          <Button
            className="layer-select"
            aria-label={`Select ${n.name}`}
            aria-pressed={selected.has(n.id)}
            onClick={(e) => activate(n.id, e.shiftKey)}
          >
            <Icon size={13} />
            <span>{n.name}</span>
          </Button>
          <Button
            className="layer-action"
            aria-label={`${n.locked ? "Unlock" : "Lock"} ${n.name}`}
            onClick={() =>
              run([{ op: "update", ids: [n.id], patch: { locked: !n.locked } }])
            }
          >
            {n.locked ? <LockKeyhole size={12} /> : <UnlockKeyhole size={12} />}
          </Button>
          <Button
            className="layer-action"
            aria-label={`${n.hidden ? "Show" : "Hide"} ${n.name}`}
            onClick={() =>
              run([{ op: "update", ids: [n.id], patch: { hidden: !n.hidden } }])
            }
          >
            {n.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
          </Button>
        </div>
      </div>
    );
  };
  return (
    <div className="layers">
      <section className="pages-section">
        <div className="section-heading">
          <h2>Pages</h2>
          <Button
            aria-label="Add page"
            title="Add page"
            onClick={() => {
              const id = uid();
              run([
                {
                  op: "page_create",
                  page: {
                    id,
                    name: `Page ${doc.pages.length + 1}`,
                    background: "none",
                  },
                },
              ]);
              engine.select([], id);
            }}
          >
            <Plus size={14} />
          </Button>
        </div>
        <div className="page-list">
          {doc.pages.map((p) => (
            <div
              className={`page-row ${p.id === pageId ? "active" : ""}`}
              key={p.id}
              ref={p.id === pageId ? activePage : undefined}
            >
              <Button
                aria-pressed={p.id === pageId}
                onClick={() => engine.select([], p.id)}
              >
                <span className="page-indicator" />
                {p.name}
              </Button>
              {doc.pages.length > 1 && (
                <Button
                  aria-label={`Delete ${p.name}`}
                  title="Delete page and its layers (undo available)"
                  onClick={() => run([{ op: "page_delete", id: p.id }])}
                >
                  <Trash2 size={12} />
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>
      <div className="section-heading layers-heading">
        <h2>Layers</h2>
        <span>{doc.nodes.filter((n) => n.pageId === pageId).length}</span>
      </div>
      <label className="layer-search">
        <Search size={13} />
        <Input
          aria-label="Search layers"
          placeholder="Find a layer…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <kbd>⌕</kbd>
      </label>
      {rows.length ? (
        <WindowedList
          key={`${doc.id}:${pageId}:${query}`}
          ids={rowIds}
          renderRow={(i) => row(rows[i].node, rows[i].depth)}
        />
      ) : (
        <div className="layer-list">
          {!doc.nodes.some((n) => n.pageId === pageId) && (
            <div className="layers-empty">
              <LayersIcon size={23} />
              <p>No layers</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
