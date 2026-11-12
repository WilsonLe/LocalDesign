// A supported scene must always fit the native format's import envelope.
// These are resource ceilings, not native-format restrictions. Keep every ingress
// and the agent catalog aligned so large projects do not need artificial splitting.
export const MAX_NODES = 100_000;
export const MAX_PAGES = 1_000;
export const MAX_ASSETS = 10_000;
export const MAX_ARCHIVE_ENTRIES = MAX_ASSETS + 128;
export const MAX_FILE_BYTES = 128_000_000;
export const MAX_EXPANDED_BYTES = 256_000_000;
export const MAX_DOCUMENT_BYTES = 64_000_000;
export const MAX_PORTABLE_BYTES = 120_000_000;
export const MAX_FILE_BASE64_CHARS = Math.ceil(MAX_FILE_BYTES / 3) * 4;
export const MAX_ASSET_DATA_CHARS =
  Math.ceil(MAX_PORTABLE_BYTES / 3) * 4 + MAX_ASSETS * 64;
export const MAX_CLIPBOARD_CHARS = MAX_DOCUMENT_BYTES + MAX_ASSET_DATA_CHARS;
export const FONT_ARCHIVE_RESERVE = 1_000_000;
