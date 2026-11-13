import { useState } from "react";
import { ArrowDownToLine } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { NativeSelect } from "../components/ui/native-select";
import type { DesignDocument } from "../core/model";
import type { ExportOptions } from "../files/export";
import { MAX_PDF_PAGES } from "../core/limits";

export type ExportRequest = {
  format: "native" | "svg" | "png" | "jpeg" | "pdf";
  ids?: string[];
  options?: ExportOptions;
  frameIds?: string[];
};
export function ExportPanel({
  document: doc,
  pageId,
  selection,
  busy,
  onExport,
}: {
  document: DesignDocument;
  pageId: string;
  selection: string[];
  busy: boolean;
  onExport: (request: ExportRequest) => void;
}) {
  const [scale, setScale] = useState(1),
    [composition, setComposition] = useState(false),
    [background, setBackground] = useState("none"),
    [custom, setCustom] = useState("#ffffff"),
    [quality, setQuality] = useState(92);
  const [multiple, setMultiple] = useState(false),
    [frameIds, setFrameIds] = useState<string[]>([]),
    [query, setQuery] = useState(""),
    [offset, setOffset] = useState(0);
  const frames = doc.nodes.filter(
    (node) =>
      node.type === "frame" &&
      (!query || node.name.toLowerCase().includes(query.toLowerCase())),
  );
  const backgroundValue =
    background === "none"
      ? undefined
      : background === "canvas"
        ? doc.pages.find((page) => page.id === pageId)?.background
        : background === "custom"
          ? custom
          : "#ffffff";
  const exportAs = (format: ExportRequest["format"]) =>
    onExport({
      format,
      ids: format !== "native" && selection.length ? [...selection] : undefined,
      options:
        format === "native"
          ? undefined
          : {
              scale,
              composition,
              background: backgroundValue,
              quality: format === "jpeg" ? quality / 100 : undefined,
            },
      frameIds: format === "pdf" && multiple ? [...frameIds] : undefined,
    });
  return (
    <>
      <Button
        className="export-option"
        disabled={busy}
        onClick={() => exportAs("native")}
      >
        <div className="file-type">LD</div>
        <div>
          <strong>LocalDesign file</strong>
        </div>
        <ArrowDownToLine size={16} />
      </Button>
      <div className="export-scope">
        <span>
          {selection.length
            ? `${selection.length} layers selected`
            : "Current page"}
        </span>
      </div>
      <details className="export-settings">
        <summary>Options</summary>
        <div className="resource-sections">
          <label>
            Scale
            <NativeSelect
              aria-label="Export scale"
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
            >
              {[0.25, 0.5, 1, 2, 3, 4].map((value) => (
                <option key={value} value={value}>
                  {value}×
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="export-check">
            <Input
              type="checkbox"
              aria-label="Include surrounding artwork"
              checked={composition}
              disabled={!selection.length}
              onChange={(e) => setComposition(e.target.checked)}
            />
            <span>Include surrounding artwork</span>
          </label>
          <label>
            Background
            <NativeSelect
              aria-label="Export background"
              value={background}
              onChange={(e) => setBackground(e.target.value)}
            >
              <option value="none">Default</option>
              <option value="white">White</option>
              <option value="canvas">Canvas color</option>
              <option value="custom">Custom</option>
            </NativeSelect>
          </label>
          {background === "custom" && (
            <label>
              Color
              <Input
                type="color"
                aria-label="Export background color"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
              />
            </label>
          )}
          <label>
            JPEG quality
            <Input
              aria-label="JPEG quality"
              type="number"
              min={10}
              max={100}
              step={1}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
            />
          </label>
          <label className="export-check">
            <Input
              type="checkbox"
              aria-label="One PDF page per frame"
              checked={multiple}
              onChange={(e) => setMultiple(e.target.checked)}
            />
            <span>One PDF page per frame</span>
          </label>
          {multiple && (
            <section>
              <h3>PDF pages</h3>
              <label>
                Find frames
                <Input
                  aria-label="Find PDF frames"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setOffset(0);
                  }}
                />
              </label>
              <ul className="resource-records">
                {frames.slice(offset, offset + 50).map((frame) => (
                  <li key={frame.id}>
                    <label className="export-check">
                      <Input
                        type="checkbox"
                        aria-label={`Include ${frame.name} in PDF`}
                        checked={frameIds.includes(frame.id)}
                        disabled={
                          !frameIds.includes(frame.id) &&
                          frameIds.length >= MAX_PDF_PAGES
                        }
                        onChange={(e) =>
                          setFrameIds(
                            e.target.checked
                              ? [...frameIds, frame.id]
                              : frameIds.filter((id) => id !== frame.id),
                          )
                        }
                      />
                      <span>
                        {frame.name} ·{" "}
                        {
                          doc.pages.find((page) => page.id === frame.pageId)
                            ?.name
                        }
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="button-row">
                <Button
                  disabled={!offset}
                  onClick={() => setOffset(Math.max(0, offset - 50))}
                >
                  Previous frames
                </Button>
                <Button
                  disabled={offset + 50 >= frames.length}
                  onClick={() => setOffset(offset + 50)}
                >
                  Next frames
                </Button>
              </div>
              <ol className="resource-records">
                {frameIds.map((id, index) => (
                  <li key={id}>
                    <strong>
                      {index + 1}.{" "}
                      {doc.nodes.find((node) => node.id === id)?.name ??
                        "Missing frame"}
                    </strong>
                    <div className="button-row">
                      {([-1, 1] as const).map((delta) => (
                        <Button
                          key={delta}
                          aria-label={`Move PDF page ${index + 1} ${delta < 0 ? "earlier" : "later"}`}
                          disabled={
                            index + delta < 0 ||
                            index + delta >= frameIds.length
                          }
                          onClick={() => {
                            const next = [...frameIds];
                            [next[index], next[index + delta]] = [
                              next[index + delta],
                              next[index],
                            ];
                            setFrameIds(next);
                          }}
                        >
                          {delta < 0 ? "Earlier" : "Later"}
                        </Button>
                      ))}
                      <Button
                        aria-label={`Remove PDF page ${index + 1}`}
                        onClick={() =>
                          setFrameIds(frameIds.filter((value) => value !== id))
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </details>
      <div className="button-row">
        {(["svg", "png", "jpeg", "pdf"] as const).map((format) => (
          <Button
            key={format}
            className="export-format"
            disabled={
              busy || (format === "pdf" && multiple && !frameIds.length)
            }
            onClick={() => exportAs(format)}
          >
            <strong>{format.toUpperCase()}</strong>
          </Button>
        ))}
      </div>
    </>
  );
}
