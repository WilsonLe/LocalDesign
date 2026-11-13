import { requireThat, type DesignDocument } from "../core/model";
import { svgAttributions } from "./attribution";
import {
  MAX_FILE_BYTES,
  MAX_RASTER_PIXELS,
  MAX_PDF_PAGES,
} from "../core/limits";
import {
  exportBounds,
  exportDimensions,
  svgExport,
  pngExport,
  type ExportOptions,
} from "./export";

function preparePaints(svg: SVGSVGElement) {
  for (const element of svg.querySelectorAll("[fill],[stroke]"))
    for (const property of ["fill", "stroke"]) {
      let paint = element.getAttribute(property);
      if (!paint || !/^#(?:[\da-f]{4}|[\da-f]{8})$/i.test(paint)) continue;
      if (paint.length === 5)
        paint = `#${[...paint.slice(1)].map((digit) => digit + digit).join("")}`;
      element.setAttribute(property, paint.slice(0, 7));
      element.setAttribute(
        `${property}-opacity`,
        String(parseInt(paint.slice(7), 16) / 255),
      );
    }
}

/** Chromium accepts some PNGs that strict PDF image decoders reject (for example a bad IDAT CRC).
 * Re-encode the browser-decoded pixels so the PDF carries the same image, including alpha,
 * instead of letting the converter silently omit it. This also normalizes WebP support. */
async function prepareImages(svg: SVGSVGElement, pdf: import("jspdf").jsPDF) {
  const canonical = new Map<string, string>();
  for (const element of svg.querySelectorAll("image")) {
    const source = element.getAttribute("href") ?? "";
    requireThat(
      /^data:image\/(png|jpeg|webp);base64,/.test(source),
      "INVALID_ASSET",
      "PDF images must be embedded raster assets.",
    );
    let data = canonical.get(source);
    if (!data) {
      const image = new Image();
      image.src = source;
      await image.decode();
      requireThat(
        image.naturalWidth * image.naturalHeight <= MAX_RASTER_PIXELS,
        "IMAGE_LIMIT",
        "PDF images are limited to 40 million pixels.",
      );
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      requireThat(
        context,
        "CANVAS_UNAVAILABLE",
        "Canvas rendering is unavailable.",
      );
      context.drawImage(image, 0, 0);
      data = canvas.toDataURL("image/png");
      // Fail before conversion if an image cannot be embedded; svg2pdf only warns on that error.
      pdf.getImageProperties(data);
      canonical.set(source, data);
    }
    element.setAttribute("href", data);
    // SVG image viewports clip xMidYMid slice. Preserve that clipping in PDF consumers too.
    const namespace = "http://www.w3.org/2000/svg";
    const clip = svg.ownerDocument.createElementNS(namespace, "clipPath"),
      rect = svg.ownerDocument.createElementNS(namespace, "rect");
    const id = `pdf-image-${crypto.randomUUID()}`;
    clip.setAttribute("id", id);
    for (const attribute of ["x", "y", "width", "height"])
      rect.setAttribute(attribute, element.getAttribute(attribute) ?? "0");
    clip.append(rect);
    svg.append(clip);
    element.setAttribute("clip-path", `url(#${id})`);
  }
}

/** Convert our own outlined scene SVG, never third-party markup or a second scene renderer. */
export async function pdfExport(
  doc: DesignDocument,
  pageId: string,
  ids?: string[],
  options: ExportOptions = {},
  frameIds?: string[],
) {
  requireThat(
    !frameIds || (frameIds.length > 0 && frameIds.length <= MAX_PDF_PAGES),
    "PDF_PAGE_LIMIT",
    "Export between 1 and 100 frames per PDF.",
  );
  const pages = frameIds
    ? frameIds.map((id) => {
        const frame = doc.nodes.find((node) => node.id === id);
        requireThat(
          frame?.type === "frame",
          "MISSING_FRAME",
          "PDF pages must reference existing frames.",
        );
        return { pageId: frame.pageId, ids: [id] };
      })
    : [{ pageId, ids }];
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([
    import("jspdf"),
    import("svg2pdf.js"),
  ]);
  const rasterizedPages: number[] = [];
  const notices = new Set<string>();
  let pdf: InstanceType<typeof jsPDF> | undefined;
  for (const page of pages) {
    const blob = await svgExport(doc, page.pageId, page.ids, options);
    requireThat(
      blob.size <= MAX_FILE_BYTES,
      "SIZE_LIMIT",
      "SVG source is too large for PDF conversion.",
    );
    const dimensions = exportDimensions(
      exportBounds(doc, page.pageId, page.ids),
      options.scale,
    );
    const orientation =
      dimensions.width > dimensions.height ? "landscape" : "portrait";
    if (!pdf)
      pdf = new jsPDF({
        unit: "px",
        format: [dimensions.width, dimensions.height],
        orientation,
        hotfixes: ["px_scaling"],
        compress: true,
      });
    else pdf.addPage([dimensions.width, dimensions.height], orientation);
    const xml = new DOMParser().parseFromString(
      await blob.text(),
      "image/svg+xml",
    );
    svgAttributions(xml).forEach((notice) => notices.add(notice));
    // PDF's inherited paint alpha differs from SVG's isolated group compositing.
    // Preserve the renderer's actual pixels for these pages, rather than changing overlaps.
    if (
      [...xml.querySelectorAll("g[opacity]")].some(
        (group) => Number(group.getAttribute("opacity")) < 1,
      )
    ) {
      const png = await pngExport(doc, page.pageId, page.ids, options);
      pdf.addImage(
        new Uint8Array(await png.arrayBuffer()),
        "PNG",
        0,
        0,
        dimensions.width,
        dimensions.height,
      );
      rasterizedPages.push(pages.indexOf(page) + 1);
      continue;
    }
    // Text is already glyph outlines; font CSS/metadata need no second interpretation.
    xml
      .querySelectorAll("style,metadata")
      .forEach((element) => element.remove());
    preparePaints(xml.documentElement as unknown as SVGSVGElement);
    await prepareImages(xml.documentElement as unknown as SVGSVGElement, pdf);
    await svg2pdf(xml.documentElement, pdf, {
      width: dimensions.width,
      height: dimensions.height,
      loadExternalStyleSheets: false,
      loadImages: /^data:image\/(png|jpeg|webp);base64,/,
    });
  }
  requireThat(pdf, "EMPTY_PDF", "No PDF pages.");
  pdf.setProperties({
    title: doc.name,
    creator: "LocalDesign",
    subject: [...notices].join("\n\n---\n\n"),
  });
  const bytes = pdf.output("arraybuffer");
  requireThat(
    bytes.byteLength <= MAX_FILE_BYTES,
    "SIZE_LIMIT",
    "PDF exceeds the portable export limit.",
  );
  return {
    blob: new Blob([bytes], { type: "application/pdf" }),
    warnings: rasterizedPages.length
      ? [
          `PDF pages ${rasterizedPages.join(", ")} use the shared PNG renderer at the selected scale to preserve group transparency.`,
        ]
      : [],
  };
}
