// A supported scene must always fit the native format's import envelope.
// These are resource ceilings, not native-format restrictions. Keep every ingress
// and the agent catalog aligned so large projects do not need artificial splitting.
export const MAX_NODES = 100_000;
export const MAX_PAGES = 1_000;
export const MAX_ASSETS = 10_000;
export const MAX_DOCUMENT_FONTS = 66; // 48 local faces plus the 18 bundled faces.
export const MAX_ARCHIVE_ENTRIES = MAX_ASSETS + MAX_DOCUMENT_FONTS * 3 + 3;
export const MAX_FILE_BYTES = 128_000_000;
export const MAX_EXPANDED_BYTES = 256_000_000;
export const MAX_DOCUMENT_BYTES = 64_000_000;
export const MAX_PORTABLE_BYTES = 120_000_000;
export const MAX_FILE_BASE64_CHARS = Math.ceil(MAX_FILE_BYTES / 3) * 4;
export const MAX_RASTER_DATA_CHARS = 28_000_000;
export const MAX_RASTER_PIXELS = 40_000_000;
export const MAX_EXPORT_AXIS = 16_384;
export const MAX_EXPORT_SCALE = 4;
export const MAX_PDF_PAGES = 100;
export const MAX_ASSET_DATA_CHARS =
  Math.ceil(MAX_PORTABLE_BYTES / 3) * 4 + MAX_ASSETS * 64;
export const MAX_CLIPBOARD_CHARS = MAX_DOCUMENT_BYTES + MAX_ASSET_DATA_CHARS;
export const FONT_ARCHIVE_RESERVE = 1_000_000;
export const MAX_FONT_FILE_BYTES = 4_000_000;
export const MAX_FONT_EXPANDED_BYTES = 16_000_000;
export const MAX_FONT_BYTES = 12_000_000;
export const MAX_GUIDELINES = 50;
export const MAX_DECISIONS = 200;
export const MAX_REFERENCES = 100;
export const MAX_TOKENS = 500;
export const MAX_TOKEN_THEMES = 12;
