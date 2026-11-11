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
      image.naturalWidth * image.naturalHeight <= 40_000_000,
    "IMAGE_LIMIT",
    "Images must be smaller than 40 million pixels.",
  );
  return { width: image.naturalWidth, height: image.naturalHeight };
}
export async function validateRasterAssets(assets: DesignAsset[]) {
  for (const asset of assets) {
    const size = await decodeRaster(asset.data);
    requireThat(
      size.width === asset.width && size.height === asset.height,
      "INVALID_ASSET",
      `Embedded image dimensions do not match ${asset.name}.`,
    );
  }
}
