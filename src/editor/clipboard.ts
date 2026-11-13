import { MAX_CLIPBOARD_CHARS } from "../core/limits";
import { validateRasterAssets } from "../files/raster";
import { resolveFont, validateFontFaces, fontsReady } from "../render/fonts";
import { z } from "zod";
import { indexNodes } from "../core/tree";
import type { DesignEngine } from "../core/engine";
import {
  LibraryPayloadSchema,
  Id,
  descendants,
  requireThat,
  roots,
  uid,
} from "../core/model";
import { worldPoint, worldRotation } from "../core/geometry";
import { libraryPayload } from "../files/component-package";
import { libraryDigest, validateLibrary } from "../core/packages";
const schema = LibraryPayloadSchema.extend({
  format: z.literal("localdesign-clipboard-v1"),
  originId: Id.default("clipboard"),
  sourceRevision: z.number().int().min(0).default(0),
  components: LibraryPayloadSchema.shape.components.default([]),
  tokens: LibraryPayloadSchema.shape.tokens.default([]),
  tokenThemes: LibraryPayloadSchema.shape.tokenThemes.default([]),
  activeTokenTheme: Id.nullable().default(null),
}).strict();
let clipboard: z.infer<typeof schema> | null = null;
export async function copySelection(engine: DesignEngine) {
  const doc = engine.document;
  requireThat(
    engine.selection.length,
    "EMPTY_SELECTION",
    "Select layers to copy.",
  );
  const index = indexNodes(doc);
  const selected = roots(doc, engine.selection, index.byId);
  const selectedIds = new Set(selected.map((node) => node.id));
  await fontsReady(doc);
  const nodes = selected
    .flatMap((node) => [node, ...descendants(doc, node.id, index)])
    .map((node) => {
      const copy = structuredClone(node);
      if (selectedIds.has(node.id)) {
        Object.assign(copy, worldPoint(doc, node, undefined, index), {
          rotation: worldRotation(doc, node, index),
          parentId: null,
        });
        let current: typeof node | undefined = node;
        while (current) {
          if (current.tokenTheme) {
            copy.tokenTheme = current.tokenTheme;
            break;
          }
          current = current.parentId
            ? index.byId.get(current.parentId)
            : undefined;
        }
      }
      copy.componentSource = null;
      return copy;
    });
  const owners = new Set(
    nodes.filter((node) => node.component).map((node) => node.id),
  );
  for (const node of nodes) {
    if (node.componentPart && !owners.has(node.componentPart.instanceId))
      node.componentPart = null;
    if (node.type === "text") {
      const font = resolveFont(node, doc);
      if (font.record && font.status !== "substituted") node.fontId = font.id;
    }
  }
  const payload = libraryPayload(doc, [], nodes);
  validateLibrary(payload);
  clipboard = {
    format: "localdesign-clipboard-v1",
    originId: doc.id,
    sourceRevision: doc.revision,
    ...payload,
  };
  const text = JSON.stringify(clipboard);
  requireThat(
    text.length <= MAX_CLIPBOARD_CHARS,
    "SIZE_LIMIT",
    "Clipboard is too large.",
  );
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* Explicitly copied content stays available when OS clipboard permission is denied. */
  }
}
export async function pasteSelection(engine: DesignEngine) {
  const guard = engine.guard(),
    pageId = engine.pageId;
  let text = "";
  try {
    text = await navigator.clipboard.readText();
  } catch {
    /* Use the last explicit in-memory copy. */
  }
  let input = clipboard;
  if (text.startsWith('{"format":"localdesign-clipboard-v1"')) {
    requireThat(
      text.length <= MAX_CLIPBOARD_CHARS,
      "SIZE_LIMIT",
      "Clipboard is too large.",
    );
    input = schema.parse(JSON.parse(text));
  }
  requireThat(input, "EMPTY_CLIPBOARD", "Copy some LocalDesign layers first.");
  input = schema.parse(input);
  const { format: _, originId, sourceRevision, ...payload } = input;
  void _;
  await validateRasterAssets(payload.assets);
  await validateFontFaces(payload.fonts);
  validateLibrary(payload);
  const receipt = engine.edit({
    ...guard,
    commands: [
      {
        op: "library_import",
        namespace: uid(),
        payload,
        originId,
        version: sourceRevision + 1,
        digest: libraryDigest(payload),
        mode: "copy",
        replaceLocalEdits: false,
        conflictPolicy: "reject",
        pageId,
        dx: 24,
        dy: 24,
      },
    ],
  });
  const created = new Set(receipt.createdIds);
  engine.select(
    engine.document.nodes
      .filter((node) => created.has(node.id) && !node.parentId)
      .map((node) => node.id),
    pageId,
  );
}
