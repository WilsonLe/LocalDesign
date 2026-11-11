import {
  blankDocument,
  makeNode,
  requireThat,
  uid,
  validateDocument,
} from "../core/model";
import { base64 } from "../render/fonts";
import { imageMime, MAX_FILE_BYTES, nativeImport } from "./native";
import { svgImport } from "./svg";
export async function importFile(file: File) {
  requireThat(
    file.size <= MAX_FILE_BYTES,
    "SIZE_LIMIT",
    "Imports are limited to 32 MB.",
  );
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (file.name.toLowerCase().endsWith(".localdesign"))
    return { document: nativeImport(bytes), warnings: [] };
  if (file.name.toLowerCase().endsWith(".svg"))
    return svgImport(await file.text());
  const mime = imageMime(bytes);
  requireThat(
    mime,
    "UNSUPPORTED_FILE",
    "Choose a .localdesign, safe SVG, PNG, JPEG or WebP file.",
  );
  const url = URL.createObjectURL(new Blob([bytes]));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    requireThat(
      image.width > 0 &&
        image.height > 0 &&
        image.width * image.height <= 40_000_000,
      "IMAGE_LIMIT",
      "Images must be smaller than 40 million pixels.",
    );
    const doc = blankDocument(file.name.replace(/\.[^.]+$/, ""));
    const asset = {
      id: uid(),
      name: file.name,
      mime,
      data: `data:${mime};base64,${base64(bytes)}`,
      width: image.width,
      height: image.height,
    };
    doc.assets.push(asset);
    doc.nodes.push(
      makeNode("image", doc.pages[0].id, {
        name: file.name,
        assetId: asset.id,
        width: image.width,
        height: image.height,
      }),
    );
    return { document: validateDocument(doc), warnings: [] };
  } finally {
    URL.revokeObjectURL(url);
  }
}
