import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { NativeSelect } from "../components/ui/native-select";
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Copy,
  Group,
  Trash2,
  Ungroup,
} from "lucide-react";
import type { DesignEngine, Snapshot } from "../core/engine";
import type { Command } from "../core/commands";
import { uid, type DesignNode } from "../core/model";
import { measureText } from "../render/text";
import { FontControls, FontManager } from "./Fonts";
function Field({
  label,
  value,
  onChange,
  type = "text",
  step,
  min,
  max,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  step?: number;
  min?: number;
  max?: number;
}) {
  const cancelBlur = useRef(false);
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <Input
        type={type}
        value={draft}
        step={step}
        min={min}
        max={max}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (cancelBlur.current) {
            cancelBlur.current = false;
            return;
          }
          if (draft !== String(value)) onChange(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            cancelBlur.current = true;
            setDraft(String(value));
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}
function TextEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="field">
      <span>Text content</span>
      <Textarea
        aria-label="Text content"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onChange(draft);
        }}
        rows={3}
      />
    </label>
  );
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="inspector-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
export const Inspector = memo(function Inspector({
  engine,
  document: doc,
  pageId,
  selection,
  onError,
}: {
  engine: DesignEngine;
  document: Snapshot["document"];
  pageId: string;
  selection: string[];
  onError: (m: string) => void;
}) {
  const snapshot = { document: doc, selection };
  const nodes = doc.nodes.filter((n) => selection.includes(n.id)),
    n = nodes[0],
    page = doc.pages.find((p) => p.id === pageId)!;
  const run = (commands: Command[]) => {
    try {
      engine.dispatch(commands);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  const patch = (value: Partial<DesignNode>) =>
    run([{ op: "update", ids: selection, patch: value }]);
  const numeric = (
    key: keyof DesignNode,
    value: number,
    label: string,
    step = 1,
    min?: number,
    max?: number,
  ) => (
    <Field
      label={label}
      value={Math.round(value * 100) / 100}
      type="number"
      step={step}
      min={min}
      max={max}
      onChange={(v) => {
        if (!Number.isFinite(Number(v)) || v === "") {
          onError(`${label} needs a valid number.`);
          return;
        }
        patch({ [key]: Number(v) });
      }}
    />
  );
  return (
    <div className="inspector">
      <div className="panel-heading">
        <strong>Design</strong>
        <span>
          {n ? (nodes.length > 1 ? `${nodes.length} layers` : n.type) : "Page"}
        </span>
      </div>
      {!n ? (
        <>
          <Section title="Canvas">
            <Field
              label="Page name"
              value={page.name}
              onChange={(name) =>
                run([{ op: "page_update", id: page.id, patch: { name } }])
              }
            />
            <Field
              label="Background"
              value={page.background}
              onChange={(background) =>
                run([{ op: "page_update", id: page.id, patch: { background } }])
              }
            />
            <Input
              aria-label="Page background color"
              type="color"
              value={page.background === "none" ? "#202023" : page.background}
              onChange={(e) =>
                run([
                  {
                    op: "page_update",
                    id: page.id,
                    patch: { background: e.target.value },
                  },
                ])
              }
            />
          </Section>
          <FontManager engine={engine} snapshot={snapshot} />
        </>
      ) : (
        <>
          <Section title={nodes.length > 1 ? "Selection" : "Layer"}>
            <Field
              label="Name"
              value={n.name}
              onChange={(name) => patch({ name })}
            />
            <div className="checks">
              <label>
                <Input
                  type="checkbox"
                  checked={n.locked}
                  onChange={(e) => patch({ locked: e.target.checked })}
                />
                Locked
              </label>
              <label>
                <Input
                  type="checkbox"
                  checked={!n.hidden}
                  onChange={(e) => patch({ hidden: !e.target.checked })}
                />
                Visible
              </label>
            </div>
          </Section>
          <Section title="Layout">
            <div className="property-grid">
              {numeric("x", n.x, "X")}
              {numeric("y", n.y, "Y")}
              {numeric("width", n.width, "W", 1, 0.1)}
              {numeric("height", n.height, "H", 1, 0.1)}
              {numeric("rotation", n.rotation, "Rotation")}
              {numeric("radius", n.radius, "Radius", 1, 0)}
            </div>
            <label className="field">
              <span>Parent</span>
              <NativeSelect
                value={n.parentId ?? ""}
                onChange={(e) =>
                  run([
                    {
                      op: "reparent",
                      ids: selection,
                      parentId: e.target.value || null,
                    },
                  ])
                }
              >
                <option value="">Page root</option>
                {doc.nodes
                  .filter(
                    (p) =>
                      p.pageId === pageId &&
                      p.id !== n.id &&
                      ["frame", "group"].includes(p.type),
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </NativeSelect>
            </label>
            <div className="icon-row" aria-label="Align layers">
              {(
                [
                  ["left", AlignLeft],
                  ["center", AlignCenter],
                  ["right", AlignRight],
                ] as const
              ).map(([axis, Icon]) => (
                <Button
                  key={axis}
                  title={`Align ${axis}`}
                  aria-label={`Align ${axis}`}
                  onClick={() => run([{ op: "align", ids: selection, axis }])}
                >
                  <Icon size={15} />
                </Button>
              ))}
              <Button
                aria-label="Align top"
                title="Align top"
                onClick={() =>
                  run([{ op: "align", ids: selection, axis: "top" }])
                }
              >
                ⊤
              </Button>
              <Button
                aria-label="Align middle"
                title="Align middle"
                onClick={() =>
                  run([{ op: "align", ids: selection, axis: "middle" }])
                }
              >
                ↕
              </Button>
              <Button
                aria-label="Align bottom"
                title="Align bottom"
                onClick={() =>
                  run([{ op: "align", ids: selection, axis: "bottom" }])
                }
              >
                ⊥
              </Button>
            </div>
            {nodes.length >= 3 && (
              <div className="button-row">
                <Button
                  onClick={() =>
                    run([
                      { op: "distribute", ids: selection, axis: "horizontal" },
                    ])
                  }
                >
                  Distribute X
                </Button>
                <Button
                  onClick={() =>
                    run([
                      { op: "distribute", ids: selection, axis: "vertical" },
                    ])
                  }
                >
                  Distribute Y
                </Button>
              </div>
            )}
          </Section>
          <Section title="Appearance">
            <div className="color-row">
              <Input
                aria-label="Fill color"
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(n.fill) ? n.fill : "#ffffff"}
                onChange={(e) => patch({ fill: e.target.value })}
              />
              <Field
                label="Fill"
                value={n.fill}
                onChange={(fill) => patch({ fill })}
              />
            </div>
            <div className="property-grid">
              <Field
                label="Stroke"
                value={n.stroke}
                onChange={(stroke) => patch({ stroke })}
              />
              {numeric("strokeWidth", n.strokeWidth, "Weight", 1, 0)}
              {numeric("opacity", n.opacity, "Opacity", 0.05, 0, 1)}
            </div>
          </Section>
          {n.type === "text" && (
            <Section title="Typography">
              <TextEditor
                key={n.id}
                value={n.text}
                onChange={(text) => patch({ text })}
              />
              <FontControls
                engine={engine}
                snapshot={snapshot}
                node={n}
                onError={onError}
              />
              <div className="property-grid">
                {numeric("fontSize", n.fontSize, "Size", 1, 1)}
                {numeric(
                  "lineHeight",
                  n.lineHeight,
                  "Line height",
                  0.1,
                  0.5,
                  5,
                )}
                {numeric("letterSpacing", n.letterSpacing, "Tracking", 0.1)}
              </div>
              <label className="field">
                <span>Text align</span>
                <NativeSelect
                  value={n.textAlign}
                  onChange={(e) =>
                    patch({
                      textAlign: e.target.value as DesignNode["textAlign"],
                    })
                  }
                >
                  <option>left</option>
                  <option>center</option>
                  <option>right</option>
                </NativeSelect>
              </label>
              {measureText(n, doc).overflow && (
                <p className="warning">
                  Text overflows this box. Increase its height or adjust type
                  size.
                </p>
              )}
              {measureText(n, doc).fallbackWarning && (
                <p className="warning">{measureText(n, doc).fallbackWarning}</p>
              )}
            </Section>
          )}
          {n.type === "path" && (
            <Section title="Vector path">
              <Field
                label="Path data"
                value={n.path}
                onChange={(path) => patch({ path })}
              />
            </Section>
          )}
          {n.type === "frame" && (
            <Section title="Auto layout">
              <label className="field">
                <span>Direction</span>
                <NativeSelect
                  value={n.layout.direction}
                  onChange={(e) =>
                    patch({
                      layout: {
                        ...n.layout,
                        direction: e.target
                          .value as DesignNode["layout"]["direction"],
                      },
                    })
                  }
                >
                  <option value="none">Free position</option>
                  <option value="horizontal">Horizontal</option>
                  <option value="vertical">Vertical</option>
                </NativeSelect>
              </label>
              {n.layout.direction !== "none" && (
                <>
                  <div className="property-grid">
                    <Field
                      label="Gap"
                      type="number"
                      value={n.layout.gap}
                      onChange={(v) =>
                        patch({ layout: { ...n.layout, gap: Number(v) } })
                      }
                    />
                    <Field
                      label="Padding"
                      type="number"
                      value={n.layout.padding}
                      onChange={(v) =>
                        patch({ layout: { ...n.layout, padding: Number(v) } })
                      }
                    />
                  </div>
                  <label className="field">
                    <span>Alignment</span>
                    <NativeSelect
                      value={n.layout.align}
                      onChange={(e) =>
                        patch({
                          layout: {
                            ...n.layout,
                            align: e.target
                              .value as DesignNode["layout"]["align"],
                          },
                        })
                      }
                    >
                      <option>start</option>
                      <option>center</option>
                      <option>end</option>
                    </NativeSelect>
                  </label>
                </>
              )}
              <label className="check-line">
                <Input
                  type="checkbox"
                  checked={n.clip}
                  onChange={(e) => patch({ clip: e.target.checked })}
                />
                Clip content
              </label>
            </Section>
          )}
          <Section title="Arrange">
            <div className="button-row">
              <Button
                onClick={() =>
                  run([{ op: "order", ids: selection, direction: "front" }])
                }
              >
                <ArrowUp size={13} />
                Front
              </Button>
              <Button
                onClick={() =>
                  run([{ op: "order", ids: selection, direction: "back" }])
                }
              >
                <ArrowDown size={13} />
                Back
              </Button>
            </div>
            <div className="button-row">
              <Button
                onClick={() =>
                  run([{ op: "order", ids: selection, direction: "forward" }])
                }
              >
                Forward
              </Button>
              <Button
                onClick={() =>
                  run([{ op: "order", ids: selection, direction: "backward" }])
                }
              >
                Backward
              </Button>
            </div>
            <div className="button-row">
              <Button
                onClick={() => {
                  const r = engine.dispatch([
                    { op: "duplicate", ids: selection, dx: 24, dy: 24 },
                  ]);
                  engine.select(
                    r.createdIds.filter((id) =>
                      engine.document.nodes.some(
                        (n) =>
                          n.id === id &&
                          !r.createdIds.includes(n.parentId ?? ""),
                      ),
                    ),
                  );
                }}
              >
                <Copy size={13} />
                Duplicate
              </Button>
              <Button onClick={() => run([{ op: "delete", ids: selection }])}>
                <Trash2 size={13} />
                Delete
              </Button>
            </div>
            <div className="button-row">
              <Button
                onClick={() =>
                  run([{ op: "group", ids: selection, id: uid() }])
                }
              >
                <Group size={13} />
                Group
              </Button>
              <Button onClick={() => run([{ op: "ungroup", ids: selection }])}>
                <Ungroup size={13} />
                Ungroup
              </Button>
            </div>
          </Section>
        </>
      )}
    </div>
  );
});
