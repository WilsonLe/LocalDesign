import { validateRasterAssets } from "../files/raster";
import { DocumentFonts } from "../fonts/schema";
import { resolveFont, validateFontFaces } from "../render/fonts";
import { z } from "zod";
import type { DesignEngine } from "../core/engine";
import {
  AssetSchema,
  descendants,
  NodeSchema,
  requireThat,
  roots,
  uid,
  type DesignAsset,
  type DesignNode,
} from "../core/model";
import { worldPoint, worldRotation } from "../core/geometry";
const schema = z
  .object({
    format: z.literal("localdesign-clipboard-v1"),
    nodes: z.array(NodeSchema).max(4000),
    assets: z.array(AssetSchema).max(100),
    fonts: DocumentFonts,
  })
  .strict();
let clipboard: z.infer<typeof schema> | null = null;
export async function copySelection(engine: DesignEngine) {
  const d = engine.document;
  requireThat(
    engine.selection.length,
    "EMPTY_SELECTION",
    "Select layers to copy.",
  );
  const selected = roots(d, engine.selection),
    nodes = selected
      .flatMap((n) => [n, ...descendants(d, n.id)])
      .map((n) => {
        const root = selected.some((x) => x.id === n.id);
        return root
          ? {
              ...n,
              ...worldPoint(d, n),
              rotation: worldRotation(d, n),
              parentId: null,
            }
          : structuredClone(n);
      });
  const assetIds = new Set(nodes.map((n) => n.assetId));
  const fonts = new Map(
    nodes
      .filter((n) => n.type === "text")
      .flatMap((n) => {
        const font = resolveFont(n, d);
        if (!font.record) return [];
        if (font.status !== "substituted") n.fontId = font.id;
        return [[font.id, font.record] as const];
      }),
  );
  clipboard = {
    format: "localdesign-clipboard-v1",
    nodes,
    assets: d.assets.filter((a) => assetIds.has(a.id)),
    fonts: [...fonts.values()],
  };
  try {
    await navigator.clipboard.writeText(JSON.stringify(clipboard));
  } catch {
    /* In-memory clipboard works where browser permissions deny the OS clipboard. */
  }
}
export async function pasteSelection(engine: DesignEngine) {
  const guard = engine.guard();
  let input = clipboard;
  try {
    const text = await navigator.clipboard.readText();
    if (text.startsWith('{"format":"localdesign-clipboard-v1"')) {
      requireThat(
        text.length < 32_000_000,
        "SIZE_LIMIT",
        "Clipboard is too large.",
      );
      input = schema.parse(JSON.parse(text));
    }
  } catch {
    /* Reuse the last explicitly copied LocalDesign selection. */
  }
  requireThat(input, "EMPTY_CLIPBOARD", "Copy some LocalDesign layers first.");
  input = schema.parse(input);
  const current = engine.document;
  const map = new Map(input.nodes.map((n) => [n.id, uid()])),
    assets = new Map(input.assets.map((a) => [a.id, uid()]));
  const newAssets: DesignAsset[] = input.assets.map((a) => ({
    ...a,
    id: assets.get(a.id)!,
  }));
  const fontIds = new Map<string, string>();
  const fonts: typeof input.fonts = [];
  for (const font of input.fonts) {
    const old = current.fonts.find((f) => f.id === font.id);
    if (
      old &&
      (JSON.stringify(old) === JSON.stringify(font) ||
        (old.source === "bundled" && font.source === "bundled"))
    )
      fontIds.set(font.id, old.id);
    else {
      const id = old ? uid() : font.id;
      fontIds.set(font.id, id);
      fonts.push({ ...font, id, source: old ? "local" : font.source });
    }
  }
  const nodes: DesignNode[] = input.nodes.map((n) => ({
    ...n,
    id: map.get(n.id)!,
    pageId: engine.pageId,
    parentId: n.parentId ? (map.get(n.parentId) ?? null) : null,
    x: n.parentId ? n.x : n.x + 24,
    y: n.parentId ? n.y : n.y + 24,
    assetId: n.assetId ? (assets.get(n.assetId) ?? n.assetId) : null,
    fontId: n.fontId ? (fontIds.get(n.fontId) ?? n.fontId) : null,
  }));
  requireThat(
    current.id === guard.expectedDocumentId,
    "STALE_REVISION",
    "Document changed while reading clipboard.",
  );
  await validateRasterAssets(newAssets);
  await validateFontFaces(fonts);
  engine.edit({
    ...guard,
    commands: [
      ...newAssets.map((asset) => ({ op: "asset_add" as const, asset })),
      ...fonts.map((font) => ({ op: "font_add" as const, font })),
      ...nodes.map((node) => ({ op: "create" as const, node })),
    ],
  });
  engine.select(nodes.filter((n) => !n.parentId).map((n) => n.id));
}
