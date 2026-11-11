import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  DesignError,
  requireThat,
  uid,
  validateDocument,
  type DesignDocument,
} from "../core/model";
import { base64, fontBytes, fonts } from "../render/fonts";
export const MAX_FILE_BYTES = 32_000_000,
  MAX_EXPANDED_BYTES = 80_000_000;
export async function nativeExport(doc: DesignDocument): Promise<Blob> {
  const portable = structuredClone(doc);
  const files: Record<string, Uint8Array> = {};
  for (const a of portable.assets) {
    const path = `assets/${a.id}.${a.mime.split("/")[1]}`;
    files[path] = Uint8Array.from(atob(a.data.split(",")[1]), (c) =>
      c.charCodeAt(0),
    );
    a.data = path;
  }
  const bytes = await fontBytes();
  for (let i = 0; i < fonts.length; i++)
    files[`fonts/inter-${fonts[i].subset}-${fonts[i].weight}.woff2`] = bytes[i];
  files["document.json"] = strToU8(JSON.stringify(portable));
  files["fonts/OFL.txt"] = strToU8(
    await (await fetch(`${import.meta.env.BASE_URL}fonts-OFL.txt`)).text(),
  );
  return new Blob([zipSync(files, { level: 6 }) as Uint8Array<ArrayBuffer>], {
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
    "Native archive exceeds 32 MB.",
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
            count <= 220,
          "ARCHIVE_LIMIT",
          "Archive expands beyond 80 MB or has too many entries.",
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
    files["document.json"] && files["document.json"].length <= 8_000_000,
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
    d.schemaVersion === 1,
    "UNSUPPORTED_VERSION",
    "This file needs a different version of LocalDesign.",
  );
  requireThat(
    Array.isArray(d.assets) && d.assets.length <= 100,
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
  const result = validateDocument(d);
  if (!preserveIdentity) {
    result.id = uid();
    result.revision = 0;
  }
  return result;
}
export function imageMime(
  bytes: Uint8Array,
): "image/png" | "image/jpeg" | "image/webp" | null {
  if (bytes[0] === 137 && strFromU8(bytes.subarray(1, 4)) === "PNG")
    return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  if (
    strFromU8(bytes.subarray(0, 4)) === "RIFF" &&
    strFromU8(bytes.subarray(8, 12)) === "WEBP"
  )
    return "image/webp";
  return null;
}
