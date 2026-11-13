import { useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import type { DesignEngine } from "../core/engine";
import { uid } from "../core/model";
import { findIcons, iconCatalog } from "../icons/catalog";

export function IconResources({
  engine,
  onError,
  onInserted,
}: {
  engine: DesignEngine;
  onError: (message: string) => void;
  onInserted: () => void;
}) {
  const [query, setQuery] = useState(""),
    [offset, setOffset] = useState(0),
    [size, setSize] = useState(24),
    [weight, setWeight] = useState(2),
    [color, setColor] = useState("#888888");
  const icons = findIcons(query);
  const selected = engine.document.nodes.find(
    (node) => engine.selection.length === 1 && node.id === engine.selection[0],
  );
  const parent =
    selected && ["frame", "group"].includes(selected.type) ? selected : null;
  const insert = (iconId: string) => {
    const id = uid();
    try {
      engine.dispatch([
        {
          op: "icon_insert",
          id,
          iconId,
          pageId: engine.pageId,
          parentId: parent?.id ?? null,
          size,
          color,
          strokeWidth: weight,
          x: parent ? 24 : (160 - engine.viewport.x) / engine.viewport.zoom,
          y: parent ? 24 : (160 - engine.viewport.y) / engine.viewport.zoom,
        },
      ]);
      engine.select([id]);
      onInserted();
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <div className="resource-sections">
      <label>
        Find icons
        <Input
          aria-label="Find icons"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOffset(0);
          }}
        />
      </label>
      <div className="icon-options">
        <label>
          Size
          <Input
            aria-label="Icon size"
            type="number"
            min={1}
            max={2000}
            value={size}
            onChange={(event) => setSize(Number(event.target.value))}
          />
        </label>
        <label>
          Weight
          <Input
            aria-label="Icon weight"
            type="number"
            min={0}
            max={1000}
            step={0.5}
            value={weight}
            onChange={(event) => setWeight(Number(event.target.value))}
          />
        </label>
        <label>
          Color
          <Input
            aria-label="Icon color"
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
          />
        </label>
      </div>
      <div className="resource-destination">
        Destination:{" "}
        {parent?.name ??
          engine.document.pages.find((page) => page.id === engine.pageId)?.name}
      </div>
      <div className="icon-grid">
        {icons.slice(offset, offset + 12).map((icon) => (
          <Button
            key={icon.id}
            aria-label={`Insert ${icon.name} icon`}
            onClick={() => insert(icon.id)}
          >
            <svg
              aria-hidden="true"
              className="size-6"
              viewBox="0 0 24 24"
              width="24"
              height="24"
            >
              <path
                d={icon.path}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>{icon.name}</span>
          </Button>
        ))}
      </div>
      {!icons.length && <div role="status">No matching icons</div>}
      <div className="button-row">
        <Button
          disabled={!offset}
          onClick={() => setOffset(Math.max(0, offset - 12))}
        >
          Previous icons
        </Button>
        <Button
          disabled={offset + 12 >= icons.length}
          onClick={() => setOffset(offset + 12)}
        >
          Next icons
        </Button>
      </div>
      <details className="resource-license">
        <summary>Lucide license</summary>
        <pre>{iconCatalog.license}</pre>
      </details>
    </div>
  );
}
