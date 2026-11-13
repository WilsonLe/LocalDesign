import { strToU8, strFromU8, zipSync, unzipSync } from "fflate";
import { z } from "zod";
import {
  Id,
  LibraryPayloadSchema,
  blankDocument,
  requireThat,
  compactNativeNode,
  type DesignDocument,
  type LibraryPayload,
} from "../core/model";
import { resourceClosure as libraryPayload } from "../core/resources";
export { libraryPayload };
import { libraryDigest, validateLibrary } from "../core/packages";
import { MAX_PACKAGE_BYTES } from "../core/limits";
import { nativeExport, nativeImport } from "./native";
import { fontsReady } from "../render/fonts";

import { validateRasterAssets } from "./raster";
import { validateFontFaces } from "../render/fonts";
const Manifest = z
  .object({
    format: z.literal("localdesign-components-v1"),
    originId: Id,
    version: z.number().int().min(1),
    name: z.string().min(1).max(200),
    rootIds: z.array(Id).min(1).max(500),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type PreparedComponentPackage = {
  manifest: z.infer<typeof Manifest>;
  payload: LibraryPayload;
};
export async function exportComponentPackage(
  doc: DesignDocument,
  rootIds: string[],
  version = doc.revision + 1,
  originId = doc.id,
): Promise<Blob> {
  await fontsReady(doc);
  for (const id of rootIds)
    requireThat(
      doc.components.some((item) => item.id === id && !item.deleted),
      "PACKAGE_ROOT",
      "Choose active component roots.",
    );
  const payload = libraryPayload(doc, rootIds),
    library = { ...blankDocument(doc.name), id: originId, ...payload };
  const bytes = new Uint8Array(
    await (await nativeExport(library)).arrayBuffer(),
  );
  const reopened = nativeImport(bytes, true);
  const finalPayload = LibraryPayloadSchema.parse({
    nodes: [],
    components: reopened.components,
    tokens: reopened.tokens,
    tokenThemes: reopened.tokenThemes,
    activeTokenTheme: reopened.activeTokenTheme,
    assets: reopened.assets,
    fonts: reopened.fonts,
  });
  const manifest = Manifest.parse({
    format: "localdesign-components-v1",
    originId,
    version,
    name: doc.name,
    rootIds,
    digest: libraryDigest(finalPayload),
  });
  const archive = zipSync(
    {
      "manifest.json": strToU8(JSON.stringify(manifest)),
      "library.localdesign": bytes,
    },
    { level: 0 },
  );
  requireThat(
    archive.length <= MAX_PACKAGE_BYTES,
    "PACKAGE_LIMIT",
    "The component package exceeds the 128 MB file limit.",
  );
  return new Blob([archive as Uint8Array<ArrayBuffer>], {
    type: "application/x-localdesign-components",
  });
}
export async function importComponentPackage(
  bytes: Uint8Array,
): Promise<PreparedComponentPackage> {
  requireThat(
    bytes.length <= MAX_PACKAGE_BYTES,
    "PACKAGE_LIMIT",
    "The component package exceeds 128 MB.",
  );
  let size = 0,
    count = 0;
  const files = unzipSync(bytes, {
    filter(entry) {
      size += entry.originalSize;
      count++;
      requireThat(
        count <= 2 &&
          size <= MAX_PACKAGE_BYTES &&
          ["manifest.json", "library.localdesign"].includes(entry.name),
        "PACKAGE_ARCHIVE",
        "Unsupported or oversized component package entries.",
      );
      return true;
    },
  });
  requireThat(
    files["manifest.json"]?.length <= 100000 && files["library.localdesign"],
    "PACKAGE_ARCHIVE",
    "The component package manifest/library is missing or oversized.",
  );
  const manifest = Manifest.parse(
      JSON.parse(strFromU8(files["manifest.json"])),
    ),
    doc = nativeImport(files["library.localdesign"], true);
  requireThat(
    !doc.nodes.length &&
      !doc.checkpoints.length &&
      !doc.reviewThreads.length &&
      !doc.packageSources.length &&
      !doc.guidelines.length &&
      !doc.decisions.length &&
      !doc.references.length &&
      !doc.prototype.interactions.length &&
      !doc.prototype.entryFrameId,
    "PACKAGE_CONTENT",
    "A component package contains only a native reusable library and its dependencies.",
  );
  const payload = LibraryPayloadSchema.parse({
    nodes: [],
    components: doc.components,
    tokens: doc.tokens,
    tokenThemes: doc.tokenThemes,
    activeTokenTheme: doc.activeTokenTheme,
    assets: doc.assets,
    fonts: doc.fonts,
  });
  validateLibrary(payload);
  requireThat(
    libraryDigest(payload) === manifest.digest &&
      manifest.rootIds.every((id) =>
        payload.components.some((item) => item.id === id && !item.deleted),
      ),
    "PACKAGE_DIGEST",
    "The component package content or root manifest is invalid.",
  );
  await validateRasterAssets(payload.assets);
  await validateFontFaces(payload.fonts);
  return { manifest, payload };
}
export function packageSummary(prepared: PreparedComponentPackage) {
  return {
    ...prepared.manifest,
    components: prepared.payload.components.map((item) => ({
      id: item.id,
      name: item.name,
      revision: item.revision,
      parts: item.nodes.length,
    })),
    tokens: prepared.payload.tokens.length,
    themes: prepared.payload.tokenThemes.length,
    assets: prepared.payload.assets.length,
    fonts: prepared.payload.fonts.length,
    metadataBytes: new TextEncoder().encode(
      JSON.stringify({
        ...prepared.payload,
        nodes: prepared.payload.nodes.map(compactNativeNode),
      }),
    ).length,
  };
}
