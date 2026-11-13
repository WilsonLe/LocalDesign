import { ancestors, type DesignDocument, type DesignNode } from "../core/model";

// Choose a readable creation paint; theme changes never recolor saved artwork.
export function initialTextFill(
  doc: DesignDocument,
  pageId: string,
  parent?: DesignNode,
) {
  let rgb = document.documentElement.classList.contains("dark")
    ? [10, 10, 10]
    : [255, 255, 255];
  const paints = [
    doc.pages.find((p) => p.id === pageId)!.background,
    ...(parent
      ? [...ancestors(doc, parent)]
          .reverse()
          .concat(parent)
          .map((n) => n.fill)
      : []),
  ];
  for (const paint of paints) {
    if (paint === "none") continue;
    const hex = paint.slice(1);
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join("") : hex;
    const alpha = full.length === 8 ? parseInt(full.slice(6), 16) / 255 : 1;
    rgb = rgb.map(
      (c, i) =>
        parseInt(full.slice(i * 2, i * 2 + 2), 16) * alpha + c * (1 - alpha),
    );
  }
  const linear = rgb
    .map((c) => c / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luminance =
    linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  return luminance > 0.179 ? "#171717" : "#f5f5f5";
}
