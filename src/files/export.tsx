import { renderToStaticMarkup } from "react-dom/server";
import { bounds } from "../core/geometry";
import { roots, requireThat, type DesignDocument } from "../core/model";
import { Scene } from "../render/Scene";
import { base64, fontBytes, fontCSS, fontsReady } from "../render/fonts";
export async function svgExport(
  doc: DesignDocument,
  pageId: string,
  ids?: string[],
): Promise<Blob> {
  await fontsReady();
  const selected = ids?.length
    ? roots(doc, ids)
    : doc.nodes.filter((n) => n.pageId === pageId && !n.parentId && !n.hidden);
  requireThat(
    selected.every((n) => n.pageId === pageId),
    "INVALID_SELECTION",
    "Export nodes must be on the current page.",
  );
  const b = bounds(doc, selected);
  requireThat(
    b.width <= 16384 && b.height <= 16384,
    "EXPORT_LIMIT",
    "Export dimensions must be at most 16,384 pixels.",
  );
  // Selected nested layers retain their world transform by rendering the full ancestry with other branches removed.
  const wanted = new Set<string>();
  for (const n of selected) {
    wanted.add(n.id);
    let p = n.parentId;
    while (p) {
      wanted.add(p);
      p = doc.nodes.find((n) => n.id === p)?.parentId ?? null;
    }
  }
  const sub = ids?.length
    ? {
        ...doc,
        nodes: doc.nodes
          .filter((n) => {
            let p: typeof n | undefined = n;
            while (p) {
              if (selected.some((s) => s.id === p!.id)) return true;
              p = doc.nodes.find((x) => x.id === p!.parentId);
            }
            return wanted.has(n.id);
          })
          .map((n) =>
            wanted.has(n.id) && !selected.some((s) => s.id === n.id)
              ? { ...n, fill: "none", stroke: "none", clip: false, opacity: 1 }
              : n,
          ),
      }
    : doc;
  const data = await fontBytes();
  const css = fontCSS(data.map((b) => `data:font/woff2;base64,${base64(b)}`));
  return new Blob(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      renderToStaticMarkup(
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={Math.ceil(b.width)}
          height={Math.ceil(b.height)}
          viewBox={`${b.x} ${b.y} ${b.width} ${b.height}`}
        >
          <defs>
            <style>{css}</style>
          </defs>
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
): Promise<Blob> {
  const svg = await svgExport(doc, pageId, ids),
    url = URL.createObjectURL(svg);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    requireThat(
      image.width * image.height <= 40_000_000,
      "EXPORT_LIMIT",
      "PNG export is limited to 40 million pixels.",
    );
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    requireThat(ctx, "CANVAS_UNAVAILABLE", "Canvas rendering is unavailable.");
    ctx.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("PNG encoding failed."))),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
