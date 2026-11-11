import { useState } from "react";
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
import type { Command } from "../core/commands";
export function Layers({
  engine,
  snapshot,
  onError,
}: {
  engine: DesignEngine;
  snapshot: Snapshot;
  onError: (s: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [collapsed, setCollapsed] = useState(new Set<string>());
  const { document: doc, pageId, selection } = snapshot;
  const run = (commands: Command[]) => {
    try {
      engine.dispatch(commands);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  const visible = (n: DesignNode) =>
    !query ||
    n.name.toLowerCase().includes(query.toLowerCase()) ||
    doc.nodes.some(
      (c) =>
        c.name.toLowerCase().includes(query.toLowerCase()) &&
        ancestors(doc, c).some((p) => p.id === n.id),
    );
  const row = (n: DesignNode, depth = 0) => {
    if (!visible(n)) return null;
    const children = doc.nodes.filter((c) => c.parentId === n.id),
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
          className={`layer-row ${selection.includes(n.id) ? "selected" : ""} ${n.hidden ? "hidden-layer" : ""}`}
          style={{ paddingLeft: 10 + depth * 14 }}
        >
          <button
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
          </button>
          <button
            className="layer-select"
            aria-label={`Select ${n.name}`}
            aria-pressed={selection.includes(n.id)}
            onClick={(e) =>
              engine.select(
                e.shiftKey
                  ? selection.includes(n.id)
                    ? selection.filter((id) => id !== n.id)
                    : [...selection, n.id]
                  : [n.id],
              )
            }
          >
            <Icon size={13} />
            <span>{n.name}</span>
          </button>
          <button
            className="layer-action"
            aria-label={`${n.locked ? "Unlock" : "Lock"} ${n.name}`}
            onClick={() =>
              run([{ op: "update", ids: [n.id], patch: { locked: !n.locked } }])
            }
          >
            {n.locked ? <LockKeyhole size={12} /> : <UnlockKeyhole size={12} />}
          </button>
          <button
            className="layer-action"
            aria-label={`${n.hidden ? "Show" : "Hide"} ${n.name}`}
            onClick={() =>
              run([{ op: "update", ids: [n.id], patch: { hidden: !n.hidden } }])
            }
          >
            {n.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        </div>
        {!isCollapsed && [...children].reverse().map((c) => row(c, depth + 1))}
      </div>
    );
  };
  return (
    <div className="layers">
      <div className="project-label">
        <div className="project-icon">
          <Frame size={16} />
        </div>
        <div>
          <strong>Local workspace</strong>
          <span>No account. Just your ideas.</span>
        </div>
      </div>
      <section className="pages-section">
        <div className="section-heading">
          <h2>Pages</h2>
          <button
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
                    background: "#202023",
                  },
                },
              ]);
              engine.select([], id);
            }}
          >
            <Plus size={14} />
          </button>
        </div>
        {doc.pages.map((p) => (
          <div
            className={`page-row ${p.id === pageId ? "active" : ""}`}
            key={p.id}
          >
            <button
              aria-pressed={p.id === pageId}
              onClick={() => engine.select([], p.id)}
            >
              <span className="page-indicator" />
              {p.name}
            </button>
            {doc.pages.length > 1 && (
              <button
                aria-label={`Delete ${p.name}`}
                title="Delete page and its layers (undo available)"
                onClick={() => run([{ op: "page_delete", id: p.id }])}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
      </section>
      <div className="section-heading layers-heading">
        <h2>Layers</h2>
        <span>{doc.nodes.filter((n) => n.pageId === pageId).length}</span>
      </div>
      <label className="layer-search">
        <Search size={13} />
        <input
          aria-label="Search layers"
          placeholder="Find a layer…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <kbd>⌕</kbd>
      </label>
      <div className="layer-list">
        {[...doc.nodes]
          .reverse()
          .filter((n) => n.pageId === pageId && !n.parentId)
          .map((n) => row(n))}
        {!doc.nodes.some((n) => n.pageId === pageId) && (
          <div className="layers-empty">
            <LayersIcon size={23} />
            <p>Your layers live here</p>
            <span>
              Add something to the canvas
              <br />
              and make it yours.
            </span>
          </div>
        )}
      </div>
      <div className="layers-footer">
        <span className="local-dot" />
        <span>Browser local</span>
        <span className="version">v0.1</span>
      </div>
    </div>
  );
}
