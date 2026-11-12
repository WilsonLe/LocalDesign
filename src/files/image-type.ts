import { strFromU8 } from "fflate";
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
