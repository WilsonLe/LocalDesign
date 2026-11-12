import { indexNodes } from "../core/tree";
import {
  MAX_EXPORT_AXIS,
  MAX_EXPORT_SCALE,
  MAX_RASTER_PIXELS,
} from "../core/limits";
import { renderToStaticMarkup } from "react-dom/server";
import { bounds } from "../core/geometry";
import { roots, requireThat, Paint, type DesignDocument } from "../core/model";
import { Scene } from "../render/Scene";
import {
  exportFonts,
  fontCSS,
  fontsReady,
  fontWarnings,
} from "../render/fonts";
export type ExportOptions = {
  scale?: number;
  composition?: boolean;
  background?: string;
  quality?: number;
};
export function exportBounds(
  doc: DesignDocument,
  pageId: string,
  ids?: string[],
) {
  requireThat(
    doc.pages.some((page) => page.id === pageId),
    "MISSING_PAGE",
    "Unknown export page.",
  );
  requireThat(
    !ids ||
      ids.every((id) =>
        doc.nodes.some((node) => node.id === id && node.pageId === pageId),
      ),
    "MISSING_NODE",
    "Export IDs must exist on the requested page.",
  );
  const selected = ids?.length
    ? roots(doc, ids)
    : doc.nodes.filter(
        (node) => node.pageId === pageId && !node.parentId && !node.hidden,
      );
  return bounds(doc, selected);
}
export function exportDimensions(
  box: { width: number; height: number },
  scale = 1,
) {
  requireThat(
    Number.isFinite(scale) && scale > 0 && scale <= MAX_EXPORT_SCALE,
    "EXPORT_SCALE",
    "Export scale must be greater than 0 and at most 4.",
  );
  const width = Math.max(1, Math.ceil(box.width * scale)),
    height = Math.max(1, Math.ceil(box.height * scale));
  requireThat(
    width <= MAX_EXPORT_AXIS && height <= MAX_EXPORT_AXIS,
    "EXPORT_LIMIT",
    "Export dimensions must be at most 16,384 pixels.",
  );
  return { width, height };
}
export async function svgExport(
  doc: DesignDocument,
  pageId: string,
  ids?: string[],
  options: ExportOptions = {},
): Promise<Blob> {
  await fontsReady(doc);
  const selected = ids?.length
    ? roots(doc, ids)
    : doc.nodes.filter((n) => n.pageId === pageId && !n.parentId && !n.hidden);
  requireThat(
    selected.every((n) => n.pageId === pageId),
    "INVALID_SELECTION",
    "Export nodes must be on the current page.",
  );
  const b = exportBounds(doc, pageId, ids);
  const dimensions = exportDimensions(b, options.scale);
  if (options.background) Paint.parse(options.background);
  // Selected nested layers retain their world transform by rendering the full ancestry with other branches removed.
  const wanted = new Set<string>();
  const selectedIds = new Set(selected.map((n) => n.id));
  const { byId } = indexNodes(doc);
  for (const n of selected) {
    wanted.add(n.id);
    let p = n.parentId;
    while (p) {
      wanted.add(p);
      p = byId.get(p)?.parentId ?? null;
    }
  }
  const sub =
    ids?.length && !options.composition
      ? {
          ...doc,
          nodes: doc.nodes
            .filter((n) => {
              let p: typeof n | undefined = n;
              while (p) {
                if (selectedIds.has(p.id)) return true;
                p = p.parentId ? byId.get(p.parentId) : undefined;
              }
              return wanted.has(n.id);
            })
            .map((n) =>
              wanted.has(n.id) && !selectedIds.has(n.id)
                ? {
                    ...n,
                    fill: "none",
                    stroke: "none",
                    clip: false,
                    opacity: 1,
                  }
                : n,
            ),
        }
      : doc;
  const records = exportFonts(sub);
  const css = fontCSS(records);
  return new Blob(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      renderToStaticMarkup(
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={dimensions.width}
          height={dimensions.height}
          viewBox={`${b.x} ${b.y} ${b.width} ${b.height}`}
        >
          <defs>
            <style>{css}</style>
          </defs>
          <metadata>
            {JSON.stringify({
              fonts: records.map(({ files, ...meta }) => ({
                ...meta,
                fileCount: files.length,
              })),
              warnings: fontWarnings(sub),
            })}
          </metadata>
          {options.background && options.background !== "none" && (
            <rect
              x={b.x}
              y={b.y}
              width={b.width}
              height={b.height}
              fill={options.background}
            />
          )}
          <Scene doc={sub} pageId={pageId} />
        </svg>,
      ),
    ],
    { type: "image/svg+xml" },
  );
}
export async function pngExport(
  doc: DesignDocument,
  pageId: string,
  ids?: string[],
  options: ExportOptions = {},
): Promise<Blob> {
  return rasterExport(doc, pageId, "png", ids, options);
}
export async function rasterExport(
  doc: DesignDocument,
  pageId: string,
  format: "png" | "jpeg",
  ids?: string[],
  options: ExportOptions = {},
): Promise<Blob> {
  await fontsReady(doc);
  const dimensions = exportDimensions(
    exportBounds(doc, pageId, ids),
    options.scale,
  );
  requireThat(
    dimensions.width * dimensions.height <= MAX_RASTER_PIXELS,
    "EXPORT_LIMIT",
    "Raster export is limited to 40 million pixels.",
  );
  requireThat(
    format !== "jpeg" ||
      options.quality === undefined ||
      (Number.isFinite(options.quality) &&
        options.quality >= 0.1 &&
        options.quality <= 1),
    "EXPORT_QUALITY",
    "JPEG quality must be between 0.1 and 1.",
  );
  const svg = await svgExport(doc, pageId, ids, options),
    url = URL.createObjectURL(svg);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    requireThat(
      image.width * image.height <= MAX_RASTER_PIXELS,
      "EXPORT_LIMIT",
      "Raster export is limited to 40 million pixels.",
    );
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    requireThat(ctx, "CANVAS_UNAVAILABLE", "Canvas rendering is unavailable.");
    if (format === "jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b
            ? resolve(b)
            : reject(new Error(`${format.toUpperCase()} encoding failed.`)),
        `image/${format}`,
        format === "jpeg" ? (options.quality ?? 0.92) : undefined,
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
