import { imageMime } from "./image-type";
export { imageMime } from "./image-type";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  DesignError,
  requireThat,
  uid,
  validateDocument,
  type DesignDocument,
} from "../core/model";
import { base64, exportFonts, fontsReady } from "../render/fonts";
import { unbase64 } from "../fonts/data";
export { MAX_FILE_BYTES, MAX_EXPANDED_BYTES } from "../core/limits";
import {
  MAX_FILE_BYTES,
  MAX_EXPANDED_BYTES,
  MAX_DOCUMENT_BYTES,
  MAX_FONT_FILE_BYTES,
  MAX_DOCUMENT_FONTS,
  MAX_ASSETS,
  MAX_ARCHIVE_ENTRIES,
  FONT_ARCHIVE_RESERVE,
} from "../core/limits";
import { validateRasterAssets } from "./raster";
export async function nativeExport(doc: DesignDocument): Promise<Blob> {
  validateDocument(doc);
  await validateRasterAssets(doc.assets);
  await fontsReady(doc);
  const portable = structuredClone(doc);
  portable.fonts = structuredClone(exportFonts(doc));
  validateDocument(portable);
  const files: Record<string, Uint8Array> = {};
  for (const a of portable.assets) {
    const path = `assets/${a.id}.${a.mime.split("/")[1]}`;
    files[path] = Uint8Array.from(atob(a.data.split(",")[1]), (c) =>
      c.charCodeAt(0),
    );
    a.data = path;
  }
  for (const font of portable.fonts)
    for (const [i, file] of font.files.entries()) {
      const path = `fonts/${font.id}-${i}.${file.format}`;
      files[path] = unbase64(file.data);
      file.data = path;
    }
  const bundled = portable.fonts.filter((f) => f.source === "bundled");
  if (portable.fonts.length)
    files["fonts/order.json"] = strToU8(
      JSON.stringify(portable.fonts.map((f) => f.id)),
    );
  portable.fonts = portable.fonts.filter((f) => f.source !== "bundled");
  if (bundled.length)
    files["fonts/catalog.json"] = strToU8(JSON.stringify(bundled));
  files["document.json"] = strToU8(JSON.stringify(portable));
  const archive = zipSync(files, { level: 6 });
  requireThat(
    archive.length <= MAX_FILE_BYTES,
    "SIZE_LIMIT",
    `The native file exceeds the ${MAX_FILE_BYTES / 1_000_000} MB portable-file limit.`,
  );
  return new Blob([archive as Uint8Array<ArrayBuffer>], {
    type: "application/x-localdesign",
  });
}
export function nativeImport(
  bytes: Uint8Array,
  preserveIdentity = false,
): DesignDocument {
  requireThat(
    bytes.length <= MAX_FILE_BYTES,
    "SIZE_LIMIT",
    `Native archive exceeds ${MAX_FILE_BYTES / 1_000_000} MB.`,
  );
  let total = 0,
    count = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter(entry) {
        total += entry.originalSize;
        count++;
        requireThat(
          Number.isFinite(entry.originalSize) &&
            entry.originalSize >= 0 &&
            total <= MAX_EXPANDED_BYTES &&
            count <= MAX_ARCHIVE_ENTRIES,
          "ARCHIVE_LIMIT",
          `Archive expands beyond ${MAX_EXPANDED_BYTES / 1_000_000} MB or has too many entries.`,
        );
        requireThat(
          /^(document\.json|assets\/[\w-]+\.(png|jpeg|webp)|fonts\/[\w.-]+)$/.test(
            entry.name,
          ),
          "UNSAFE_ARCHIVE",
          "Unsupported archive path.",
        );
        return true;
      },
    });
  } catch (e) {
    if (e instanceof DesignError) throw e;
    throw new DesignError(
      "INVALID_ARCHIVE",
      "This is not a valid LocalDesign archive.",
    );
  }
  requireThat(
    files["document.json"] &&
      files["document.json"].length <= MAX_DOCUMENT_BYTES,
    "INVALID_ARCHIVE",
    "Missing or oversized document.json.",
  );
  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(files["document.json"]));
  } catch {
    throw new DesignError("INVALID_JSON", "document.json is invalid.");
  }
  requireThat(
    typeof raw === "object" && raw !== null,
    "INVALID_DOCUMENT",
    "Invalid document.",
  );
  const d = raw as DesignDocument;
  requireThat(
    [1, 2, 3].includes(d.schemaVersion),
    "UNSUPPORTED_VERSION",
    "This file needs a different version of LocalDesign.",
  );
  if (d.schemaVersion >= 2 && files["fonts/catalog.json"]) {
    requireThat(
      files["fonts/catalog.json"].length <= FONT_ARCHIVE_RESERVE,
      "FONT_LIMIT",
      "Bundled font catalog is too large.",
    );
    let catalog: unknown;
    try {
      catalog = JSON.parse(strFromU8(files["fonts/catalog.json"]));
    } catch {
      throw new DesignError("INVALID_FONT", "Invalid bundled font catalog.");
    }
    requireThat(
      Array.isArray(catalog) &&
        catalog.length <= 18 &&
        catalog.every((f) => f?.source === "bundled") &&
        (d.fonts === undefined || Array.isArray(d.fonts)),
      "INVALID_FONT",
      "Invalid bundled font catalog.",
    );
    d.fonts = [...(d.fonts ?? []), ...catalog];
  }
  requireThat(
    Array.isArray(d.assets) && d.assets.length <= MAX_ASSETS,
    "INVALID_ASSETS",
    "Invalid asset catalog.",
  );
  for (const a of d.assets) {
    requireThat(
      a &&
        typeof a.data === "string" &&
        /^assets\/[\w-]+\.(png|jpeg|webp)$/.test(a.data),
      "INVALID_ASSET",
      "Asset must reference an archive entry.",
    );
    requireThat(files[a.data], "MISSING_ASSET", `Missing asset: ${a.name}`);
    const data = files[a.data];
    requireThat(
      imageMime(data) === a.mime,
      "ASSET_MIME",
      "Image bytes do not match their declared MIME.",
    );
    a.data = `data:${a.mime};base64,${base64(data)}`;
  }
  requireThat(
    d.fonts === undefined ||
      (Array.isArray(d.fonts) && d.fonts.length <= MAX_DOCUMENT_FONTS),
    "INVALID_FONT",
    "Invalid font catalog.",
  );
  for (const font of d.fonts ?? []) {
    requireThat(
      font &&
        typeof font.id === "string" &&
        /^[\w-]{1,100}$/.test(font.id) &&
        Array.isArray(font.files) &&
        font.files.length >= 1 &&
        font.files.length <= 3,
      "INVALID_FONT",
      "Invalid font record.",
    );
    for (const [i, file] of font.files.entries()) {
      requireThat(
        file &&
          ["ttf", "otf", "woff", "woff2"].includes(file.format) &&
          file.data === `fonts/${font.id}-${i}.${file.format}`,
        "INVALID_FONT",
        "Font must reference its own archive entry.",
      );
      const data = files[file.data];
      requireThat(
        data && data.length <= MAX_FONT_FILE_BYTES,
        "INVALID_FONT",
        "Missing or oversized embedded font.",
      );
      file.data = base64(data);
    }
  }
  const result = validateDocument(d);
  if (d.schemaVersion >= 2 && files["fonts/order.json"]) {
    requireThat(
      files["fonts/order.json"].length <= MAX_DOCUMENT_FONTS * 104 + 2,
      "INVALID_FONT",
      "Font order is too large.",
    );
    let order: unknown;
    try {
      order = JSON.parse(strFromU8(files["fonts/order.json"]));
    } catch {
      throw new DesignError("INVALID_FONT", "Invalid font order.");
    }
    const fonts = new Map(result.fonts.map((f) => [f.id, f]));
    requireThat(
      Array.isArray(order) &&
        order.length === result.fonts.length &&
        new Set(order).size === order.length &&
        order.every((id) => typeof id === "string" && fonts.has(id)),
      "INVALID_FONT",
      "Font order must include each catalog face exactly once.",
    );
    result.fonts = order.map((id) => fonts.get(id)!);
  }
  if (!preserveIdentity) {
    result.id = uid();
    result.revision = 0;
  }
  return result;
}
