import { create, registerFormat } from "fontkit/core";
import { TTFFont } from "fontkit/formats/TTFFont";
import { WOFFFont } from "fontkit/formats/WOFFFont";
import { WOFF2Font } from "fontkit/formats/WOFF2Font";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { requireThat, DesignError } from "../core/model";
import { MAX_FONT_FILE_BYTES, MAX_FONT_EXPANDED_BYTES } from "../core/limits";
import { FontSchema, type DocumentFont, type FontFile } from "./schema";
import { bundledCatalog } from "./bundled";
import bundledIntegrity from "./bundled-integrity.json";
registerFormat(TTFFont);
registerFormat(WOFFFont);
registerFormat(WOFF2Font);

export function base64(bytes: Uint8Array) {
  let str = "";
  for (let i = 0; i < bytes.length; i += 8192)
    str += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(str);
}
export const unbase64 = (data: string) =>
  Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
const hash = (data: Uint8Array | string) =>
  bytesToHex(
    sha256(typeof data === "string" ? new TextEncoder().encode(data) : data),
  );
type FontInfo = {
  digest: string;
  family: string;
  weight: string;
  style: DocumentFont["style"];
  format: FontFile["format"];
  characters: Set<number>;
  unicodeRange: string;
  notice: string;
  bytes: number;
};
const cache = new Map<string, FontInfo>();
let cachedBytes = 0;
function ranges(points: number[]) {
  const sorted = [...new Set(points)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    while (sorted[i + 1] === sorted[i] + 1) i++;
    out.push(
      `U+${start.toString(16)}${start === sorted[i] ? "" : `-${sorted[i].toString(16)}`}`,
    );
  }
  return out.join(",");
}
export function readFont(bytes: Uint8Array): FontInfo {
  requireThat(
    bytes.length >= 12 && bytes.length <= MAX_FONT_FILE_BYTES,
    "FONT_LIMIT",
    "Each font must be at most 4 MB.",
  );
  const signature = String.fromCharCode(...bytes.subarray(0, 4));
  const format =
    signature === "wOF2"
      ? "woff2"
      : signature === "wOFF"
        ? "woff"
        : signature === "OTTO"
          ? "otf"
          : new DataView(bytes.buffer, bytes.byteOffset).getUint32(0) ===
              0x00010000
            ? "ttf"
            : null;
  requireThat(
    format,
    "UNSUPPORTED_FONT",
    "Choose a static TTF, OTF, WOFF or WOFF2 font. Collections and variable fonts are unsupported.",
  );
  if (format === "woff" || format === "woff2") {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    requireThat(
      bytes.length >= (format === "woff" ? 44 : 48) &&
        view.getUint32(8) === bytes.length &&
        view.getUint32(16) <= MAX_FONT_EXPANDED_BYTES,
      "FONT_LIMIT",
      "Invalid font length or font expands beyond 16 MB.",
    );
  }
  // Bound table-directory expansion before invoking the font decoder. WOFF2's
  // declared sfnt size alone does not bound its transformed table lengths.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = view.getUint16(format.startsWith("woff") ? 12 : 4);
  requireThat(
    tables > 0 && tables <= 128,
    "FONT_LIMIT",
    "Font has too many tables.",
  );
  let expanded = 0;
  if (format === "woff2") {
    let offset = 48;
    const read128 = () => {
      let value = 0;
      for (let i = 0; i < 5; i++) {
        requireThat(
          offset < bytes.length,
          "INVALID_FONT",
          "Truncated font directory.",
        );
        const byte = bytes[offset++];
        value = value * 128 + (byte & 127);
        requireThat(
          value <= MAX_FONT_EXPANDED_BYTES,
          "FONT_LIMIT",
          "Font table expands beyond 16 MB.",
        );
        if (!(byte & 128)) return value;
      }
      throw new DesignError("INVALID_FONT", "Invalid font directory length.");
    };
    for (let i = 0; i < tables; i++) {
      requireThat(
        offset < bytes.length,
        "INVALID_FONT",
        "Truncated font directory.",
      );
      const flags = bytes[offset++],
        tag = flags & 63,
        version = flags >> 6;
      if (tag === 63) offset += 4;
      const length = read128();
      const transformed =
        tag === 10 || tag === 11 ? version !== 3 : version !== 0;
      const transformLength = transformed ? read128() : length;
      expanded += Math.max(length, transformLength);
      requireThat(
        expanded <= MAX_FONT_EXPANDED_BYTES,
        "FONT_LIMIT",
        "Font tables expand beyond 16 MB.",
      );
    }
    requireThat(
      offset + view.getUint32(20) <= bytes.length,
      "INVALID_FONT",
      "Truncated font stream.",
    );
  } else {
    const start = format === "woff" ? 44 : 12,
      stride = format === "woff" ? 20 : 16;
    requireThat(
      start + tables * stride <= bytes.length,
      "INVALID_FONT",
      "Truncated font directory.",
    );
    for (let i = start; i < start + tables * stride; i += stride) {
      const offset = view.getUint32(i + (format === "woff" ? 4 : 8));
      const length = view.getUint32(i + (format === "woff" ? 8 : 12));
      expanded += view.getUint32(i + 12);
      requireThat(
        offset + length <= bytes.length && expanded <= MAX_FONT_EXPANDED_BYTES,
        "FONT_LIMIT",
        "Invalid font table bounds or expansion beyond 16 MB.",
      );
    }
  }
  try {
    const font = create(bytes),
      os2 = font["OS/2"];
    requireThat(
      !["COLR", "CPAL", "CBDT", "CBLC", "sbix", "SVG "].some(
        (table) => table in font.directory.tables,
      ),
      "UNSUPPORTED_FONT",
      "Color/bitmap fonts are unsupported. Choose a static outline font.",
    );
    requireThat(
      !Object.keys(font.variationAxes).length,
      "UNSUPPORTED_FONT",
      "Variable fonts are unsupported. Supply a static font file.",
    );
    requireThat(
      os2 &&
        !os2.fsType.noEmbedding &&
        !os2.fsType.bitmapOnly &&
        (!os2.fsType.viewOnly || os2.fsType.editable),
      "FONT_LICENSE",
      "This font restricts editable embedding. Choose a font licensed for redistribution and editing.",
    );
    const family =
      font.name.records.preferredFamily?.en ??
      Object.values(font.name.records.preferredFamily ?? {})[0] ??
      font.familyName;
    requireThat(
      typeof family === "string" &&
        family.length > 0 &&
        family.length <= 200 &&
        font.numGlyphs > 0 &&
        font.numGlyphs <= 65535 &&
        Number.isFinite(font.unitsPerEm) &&
        font.unitsPerEm >= 16 &&
        font.unitsPerEm <= 16384,
      "INVALID_FONT",
      "Font metadata is invalid.",
    );
    const characters = font.characterSet;
    requireThat(
      characters.length > 0 &&
        characters.length <= 200000 &&
        characters.every((p) => Number.isInteger(p) && p >= 0 && p <= 0x10ffff),
      "INVALID_FONT",
      "Font character map is invalid.",
    );
    const weight = String(os2.usWeightClass);
    requireThat(
      /^(?:[1-9]\d{0,2}|1000)$/.test(weight),
      "UNSUPPORTED_FONT",
      "Font weight must be between 1 and 1000.",
    );
    let outlineBytes = 0;
    for (let id = 0; id < font.numGlyphs; id++) {
      const path = font.getGlyph(id).path.toSVG();
      outlineBytes += path.length;
      requireThat(
        path.length <= 100000 &&
          outlineBytes <= MAX_FONT_EXPANDED_BYTES &&
          /^[MmLlHhVvCcSsQqTtAaZz\d\s,.+eE-]*$/.test(path),
        "INVALID_FONT",
        "Font outlines are invalid or too complex (16 MB maximum). Choose a simpler static font.",
      );
    }
    return {
      digest: hash(bytes),
      family,
      weight,
      format,
      style: os2.fsSelection.oblique
        ? "oblique"
        : os2.fsSelection.italic || font.italicAngle !== 0
          ? "italic"
          : "normal",
      characters: new Set(characters),
      unicodeRange: ranges(characters),
      bytes: bytes.length,
      notice: [
        font.name.records.copyright,
        font.name.records.licenseDescription,
        font.name.records.licenseURL,
      ]
        .flatMap((r) => Object.values(r ?? {}))
        .filter((v, i, a) => a.indexOf(v) === i)
        .join("\n")
        .slice(0, 12000),
    };
  } catch (e) {
    if (e instanceof DesignError) throw e;
    throw new DesignError(
      "INVALID_FONT",
      "The font is corrupt or unsupported. The current design was preserved.",
    );
  }
}
export function fontInfo(file: FontFile) {
  let info = cache.get(file.data);
  if (!info) {
    info = readFont(unbase64(file.data));
    while (
      cache.size &&
      (cache.size >= 144 || cachedBytes + info.bytes > 16_000_000)
    ) {
      const first = cache.keys().next().value!;
      cachedBytes -= cache.get(first)!.bytes;
      cache.delete(first);
    }
    cache.set(file.data, info);
    cachedBytes += info.bytes;
  }
  requireThat(
    info.format === file.format,
    "INVALID_FONT",
    "Font bytes do not match their declared format.",
  );
  return info;
}
export function validateFontRecord(input: DocumentFont) {
  const font = FontSchema.parse(input);
  requireThat(
    font.source !== "bundled" ||
      bundledCatalog.some(
        (f) =>
          f.id === font.id &&
          f.family === font.family &&
          f.weight === font.weight &&
          f.style === font.style,
      ),
    "FONT_METADATA",
    "Unknown bundled face. Add this font as a local licensed face.",
  );
  for (const file of font.files) {
    const info = fontInfo(file);
    requireThat(
      info.family === font.family &&
        info.weight === font.weight &&
        info.style === font.style,
      "FONT_METADATA",
      "Font family, weight or style does not match the embedded bytes.",
    );
  }
  if (font.source === "bundled") {
    const identity = bundledIntegrity[font.id as keyof typeof bundledIntegrity];
    requireThat(
      identity &&
        identity.filesHash === fontKey(font) &&
        identity.licenseHash === hash(font.license),
      "FONT_METADATA",
      "Bundled font bytes or license differ from their catalog identity. Add this font as a local licensed face.",
    );
  }
  return font;
}
const keys = new Map<string, string>();
export function fontKey(font: Pick<DocumentFont, "files">) {
  const digests = font.files.map((f) => fontInfo(f).digest).join(":");
  let key = keys.get(digests);
  if (!key) {
    key = hash(digests);
    if (keys.size >= 144) keys.delete(keys.keys().next().value!);
    keys.set(digests, key);
  }
  return key;
}
export const fontAlias = (font: DocumentFont) => `LD-${fontKey(font)}`;
export function localFont(
  bytes: Uint8Array,
  provenance: string,
  license: string,
): DocumentFont {
  const info = readFont(bytes);
  const font: DocumentFont = {
    id: `font-${info.digest}`,
    family: info.family,
    weight: info.weight,
    style: info.style,
    source: "local",
    files: [{ format: info.format, data: base64(bytes) }],
    license: `${license.trim()}\n${info.notice}`.trim(),
    provenance,
    redistributionAllowed: true,
  };
  return validateFontRecord(font);
}
export function portableFont(font: DocumentFont) {
  return {
    ...font,
    files: font.files.map((file, i) => ({
      ...file,
      data: `fonts/${font.id}-${i}.${file.format}`,
    })),
  };
}
