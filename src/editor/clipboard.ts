import { MAX_NODES, MAX_ASSETS, MAX_CLIPBOARD_CHARS } from "../core/limits";
import { validateRasterAssets } from "../files/raster";
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
    nodes: z.array(NodeSchema).max(MAX_NODES),
    assets: z.array(AssetSchema).max(MAX_ASSETS),
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
  clipboard = {
    format: "localdesign-clipboard-v1",
    nodes,
    assets: d.assets.filter((a) => assetIds.has(a.id)),
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
        text.length <= MAX_CLIPBOARD_CHARS,
        "SIZE_LIMIT",
        "Clipboard is too large.",
      );
      input = schema.parse(JSON.parse(text));
    }
  } catch {
    /* Reuse the last explicitly copied LocalDesign selection. */
  }
  requireThat(input, "EMPTY_CLIPBOARD", "Copy some LocalDesign layers first.");
  const current = engine.document;
  const map = new Map(input.nodes.map((n) => [n.id, uid()])),
    assets = new Map(input.assets.map((a) => [a.id, uid()]));
  const newAssets: DesignAsset[] = input.assets.map((a) => ({
    ...a,
    id: assets.get(a.id)!,
  }));
  const nodes: DesignNode[] = input.nodes.map((n) => ({
    ...n,
    id: map.get(n.id)!,
    pageId: engine.pageId,
    parentId: n.parentId ? (map.get(n.parentId) ?? null) : null,
    x: n.parentId ? n.x : n.x + 24,
    y: n.parentId ? n.y : n.y + 24,
    assetId: n.assetId ? (assets.get(n.assetId) ?? n.assetId) : null,
  }));
  requireThat(
    current.id === guard.expectedDocumentId,
    "STALE_REVISION",
    "Document changed while reading clipboard.",
  );
  await validateRasterAssets(newAssets);
  engine.edit({
    ...guard,
    commands: [
      ...newAssets.map((asset) => ({ op: "asset_add" as const, asset })),
      ...nodes.map((node) => ({ op: "create" as const, node })),
    ],
  });
  engine.select(nodes.filter((n) => !n.parentId).map((n) => n.id));
}
