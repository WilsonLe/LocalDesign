import { useId, useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { NativeSelect } from "../components/ui/native-select";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
import type { DesignEngine, Snapshot } from "../core/engine";
import {
  makeNode,
  requireThat,
  type DesignDocument,
  type DesignNode,
} from "../core/model";
import { MAX_FONT_FILE_BYTES } from "../core/limits";
import { localFont } from "../fonts/data";
import {
  availableFonts,
  fontWarnings,
  resolveFont,
  validateFontFaces,
} from "../render/fonts";
import { Scene } from "../render/Scene";
import { measureText } from "../render/text";

function FontSample({
  doc,
  font,
  label,
}: {
  doc: DesignDocument;
  font: Pick<DesignNode, "fontFamily" | "fontId" | "fontWeight" | "fontStyle">;
  label: string;
}) {
  const id = `sample-${useId().replace(/[^\w-]/g, "")}`;
  const node = makeNode("text", doc.pages[0].id, {
    fontFamily: font.fontFamily,
    fontId: font.fontId,
    fontWeight: font.fontWeight,
    fontStyle: font.fontStyle,
    id,
    text: "Aa Bb 0123 · Tiếng Việt",
    fontSize: 22,
    width: 10000,
    height: 100,
    fill: "#171717",
  });
  const metrics = measureText(node, doc),
    ink = metrics.inkBounds;
  const x = Math.min(0, ink?.x ?? 0) - 2,
    y = Math.min(0, ink?.y ?? 0) - 2;
  const width = Math.max(metrics.width, ink ? ink.x + ink.width : 0) - x + 2;
  const height = Math.max(metrics.height, ink ? ink.y + ink.height : 0) - y + 2;
  return (
    <svg
      className="font-sample"
      role="img"
      aria-label={label}
      width={width}
      height={height}
      viewBox={`${x} ${y} ${width} ${height}`}
    >
      <Scene
        doc={{ ...doc, nodes: [node] }}
        pageId={node.pageId}
        glyphPrefix={`${id}-`}
      />
    </svg>
  );
}

export function FontManager({
  engine,
  snapshot,
}: {
  engine: DesignEngine;
  snapshot: Snapshot;
}) {
  const [open, setOpen] = useState(false),
    [license, setLicense] = useState(""),
    [permission, setPermission] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [returnFocus, setReturnFocus] = useState<HTMLElement | null>(null);
  const doc = snapshot.document,
    warnings = fontWarnings(doc);
  const families = [...new Set(availableFonts(doc).map((f) => f.family))];
  return (
    <>
      <Button
        onClick={(e) => {
          setReturnFocus(e.currentTarget);
          setOpen(true);
        }}
        aria-label="Fonts"
      >
        Fonts{warnings.length ? ` · ${warnings.length}` : ""}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="modal font-modal"
          aria-describedby={undefined}
          finalFocus={() => returnFocus}
        >
          <DialogTitle>Fonts</DialogTitle>
          <div className="font-previews">
            {families.map((family) => {
              const choices = availableFonts(doc).filter(
                (f) => f.family === family,
              );
              const face =
                choices.find(
                  (f) => f.weight === "400" && f.style === "normal",
                ) ?? choices[0];
              return (
                <div className="font-preview" key={family}>
                  <strong>{family}</strong>
                  <FontSample
                    doc={doc}
                    font={{
                      fontFamily: face.family,
                      fontWeight: face.weight,
                      fontStyle: face.style,
                      fontId: face.id,
                    }}
                    label={`${family} preview`}
                  />
                </div>
              );
            })}
          </div>
          <h3>Add font</h3>
          <label className="field">
            <span>License / permission</span>
            <Input
              value={license}
              maxLength={4000}
              onChange={(e) => setLicense(e.target.value)}
            />
          </label>
          <label className="font-permission">
            <Input
              type="checkbox"
              checked={permission}
              onChange={(e) => setPermission(e.target.checked)}
            />
            I can redistribute and embed this font for editing
          </label>
          <label className="field">
            <span>Font file</span>
            <Input
              aria-label="Font file"
              type="file"
              accept=".ttf,.otf,.woff,.woff2"
              disabled={busy || !permission || !license.trim()}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                const guard = engine.guard();
                setBusy(true);
                setMessage("");
                try {
                  requireThat(
                    permission && license.trim(),
                    "FONT_LICENSE",
                    "Supply redistribution permission and a license notice.",
                  );
                  requireThat(
                    file.size <= MAX_FONT_FILE_BYTES,
                    "FONT_LIMIT",
                    "Each font must be at most 4 MB.",
                  );
                  const font = localFont(
                    new Uint8Array(await file.arrayBuffer()),
                    file.name,
                    license,
                  );
                  await validateFontFaces([font]);
                  engine.edit({
                    ...guard,
                    commands: [{ op: "font_add", font }],
                  });
                  setMessage(
                    `${font.family} ${font.weight} ${font.style} added.`,
                  );
                } catch (err) {
                  setMessage(err instanceof Error ? err.message : String(err));
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
          {message && <p role="status">{message}</p>}
          {!!warnings.length && (
            <>
              <h3>Font warnings · {warnings.length}</h3>
              <div className="font-warning-list">
                {warnings.slice(0, 100).map((w) => (
                  <div key={w.nodeId}>
                    <Button
                      onClick={() => {
                        const node = doc.nodes.find((n) => n.id === w.nodeId)!;
                        engine.select([node.id], node.pageId);
                        setOpen(false);
                      }}
                    >
                      {doc.nodes.find((n) => n.id === w.nodeId)?.name}
                    </Button>
                    <p className="warning">{w.message}</p>
                  </div>
                ))}
              </div>
            </>
          )}
          <Button onClick={() => setOpen(false)}>Close fonts</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function FontControls({
  engine,
  snapshot,
  node,
  onError,
}: {
  engine: DesignEngine;
  snapshot: Snapshot;
  node: DesignNode;
  onError: (message: string) => void;
}) {
  const doc = snapshot.document,
    catalog = availableFonts(doc),
    families = [...new Set(catalog.map((f) => f.family))],
    font = resolveFont(node, doc);
  const faces = catalog.filter((f) => f.family === node.fontFamily);
  const patch = (value: Partial<DesignNode>) => {
    try {
      engine.dispatch([
        {
          op: "update",
          ids: snapshot.selection.filter((id) =>
            doc.nodes.some((n) => n.id === id && n.type === "text"),
          ),
          patch: value,
        },
      ]);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  const weights = [
    ...new Set(
      faces.filter((f) => f.style === node.fontStyle).map((f) => f.weight),
    ),
  ];
  const styles = [
    ...new Set(
      faces.filter((f) => f.weight === node.fontWeight).map((f) => f.style),
    ),
  ];
  return (
    <>
      <label className="field">
        <span>Font family</span>
        <NativeSelect
          aria-label="Font family"
          value={node.fontFamily}
          onChange={(e) => {
            const family = e.target.value;
            const choices = catalog.filter((f) => f.family === family);
            const face =
              choices.find(
                (f) =>
                  f.weight === node.fontWeight && f.style === node.fontStyle,
              ) ??
              choices.find((f) => f.weight === node.fontWeight) ??
              choices[0];
            patch({
              fontFamily: family,
              fontWeight: face.weight,
              fontStyle: face.style,
              fontId: null,
            });
          }}
        >
          {!families.includes(node.fontFamily) && (
            <option value={node.fontFamily}>{node.fontFamily} (missing)</option>
          )}
          {families.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </NativeSelect>
      </label>
      <div className="property-grid">
        <label className="field">
          <span>Font weight</span>
          <NativeSelect
            aria-label="Font weight"
            value={node.fontWeight}
            onChange={(e) =>
              patch({ fontWeight: e.target.value, fontId: null })
            }
          >
            {!weights.includes(node.fontWeight) && (
              <option value={node.fontWeight}>
                {node.fontWeight} (missing)
              </option>
            )}
            {weights.map((w) => (
              <option key={w}>{w}</option>
            ))}
          </NativeSelect>
        </label>
        <label className="field">
          <span>Font style</span>
          <NativeSelect
            aria-label="Font style"
            value={node.fontStyle}
            onChange={(e) =>
              patch({
                fontStyle: e.target.value as DesignNode["fontStyle"],
                fontId: null,
              })
            }
          >
            {!styles.includes(node.fontStyle) && (
              <option value={node.fontStyle}>{node.fontStyle} (missing)</option>
            )}
            {styles.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </NativeSelect>
        </label>
      </div>
      <div className="type-preview">
        <FontSample doc={doc} font={node} label={`${font.family} preview`} />
      </div>
      <label className="field">
        <span>{font.status === "exact" ? "Font source" : "Replacement"}</span>
        <NativeSelect
          aria-label={font.status === "exact" ? "Font source" : "Replacement"}
          value={node.fontId ?? ""}
          onChange={(e) => patch({ fontId: e.target.value || null })}
        >
          <option value="">Automatic</option>
          {node.fontId && !catalog.some((f) => f.id === node.fontId) && (
            <option value={node.fontId}>Missing font ID</option>
          )}
          {catalog.map((f) => (
            <option key={f.id} value={f.id}>
              {f.family} · {f.weight} {f.style} ·{" "}
              {f.source === "local"
                ? `Local · ${doc.fonts.find((record) => record.id === f.id)?.provenance ?? "Font"} · ${f.id.slice(-8)}`
                : "Bundled"}
            </option>
          ))}
        </NativeSelect>
      </label>
      <FontManager engine={engine} snapshot={snapshot} />
    </>
  );
}
