import { imageMime } from "./image-type";
import { MAX_RASTER_PIXELS } from "../core/limits";
import { DesignError, requireThat, type DesignAsset } from "../core/model";
export async function decodeRaster(
  data: string,
): Promise<{ width: number; height: number }> {
  const image = new Image();
  image.src = data;
  try {
    await image.decode();
  } catch {
    throw new DesignError(
      "INVALID_ASSET",
      "An embedded image is damaged or cannot be decoded. Your current design was preserved.",
    );
  }
  requireThat(
    image.naturalWidth > 0 &&
      image.naturalHeight > 0 &&
      image.naturalWidth * image.naturalHeight <= MAX_RASTER_PIXELS,
    "IMAGE_LIMIT",
    "Images must be smaller than 40 million pixels.",
  );
  return { width: image.naturalWidth, height: image.naturalHeight };
}
export async function validateRasterAssets(assets: DesignAsset[]) {
  for (const asset of assets) {
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(asset.data.split(",")[1]), (c) =>
        c.charCodeAt(0),
      );
    } catch {
      throw new DesignError(
        "INVALID_ASSET",
        "Embedded image bytes are not valid base64.",
      );
    }
    requireThat(
      imageMime(bytes) === asset.mime,
      "ASSET_MIME",
      `Embedded image bytes do not match the declared MIME for ${asset.name}.`,
    );
    const size = await decodeRaster(asset.data);
    requireThat(
      size.width === asset.width && size.height === asset.height,
      "INVALID_ASSET",
      `Embedded image dimensions do not match ${asset.name}.`,
    );
  }
}
