import { requireThat } from "../core/model";
import { MAX_FILE_BYTES } from "../core/limits";

export function svgAttributions(svg: Document): string[] {
  return (
    JSON.parse(svg.querySelector("metadata")?.textContent ?? "{}")
      .attributions ?? []
  );
}
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
/** Keep notices in the file itself without changing a single painted pixel. */
export async function rasterAttributions(blob: Blob, notices: string[]) {
  requireThat(
    blob.size <= MAX_FILE_BYTES,
    "EXPORT_LIMIT",
    "Output exceeds the portable file limit.",
  );
  if (!notices.length) return blob;
  const text = new TextEncoder().encode(notices.join("\n\n---\n\n"));
  requireThat(
    blob.size + text.length + 1024 < MAX_FILE_BYTES,
    "EXPORT_LIMIT",
    "Output and attribution exceed the portable file limit.",
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (blob.type === "image/png") {
    const prefix = new TextEncoder().encode("Copyright\0\0\0\0\0"),
      payload = new Uint8Array(prefix.length + text.length),
      chunk = new Uint8Array(payload.length + 12);
    payload.set(prefix);
    payload.set(text, prefix.length);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, payload.length);
    chunk.set(new TextEncoder().encode("iTXt"), 4);
    chunk.set(payload, 8);
    view.setUint32(chunk.length - 4, crc32(chunk.subarray(4, -4)));
    return new Blob([bytes.slice(0, -12), chunk, bytes.slice(-12)], {
      type: blob.type,
    });
  }
  const parts: BlobPart[] = [bytes.slice(0, 2)];
  for (let offset = 0; offset < text.length; offset += 65533) {
    const part = text.slice(offset, offset + 65533),
      header = new Uint8Array([255, 254, 0, 0]);
    new DataView(header.buffer).setUint16(2, part.length + 2);
    parts.push(header, part);
  }
  parts.push(bytes.slice(2));
  return new Blob(parts, { type: blob.type });
}
