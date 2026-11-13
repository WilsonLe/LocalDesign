import {
  type Checkpoint,
  type DesignDocument,
  blankDocument,
  compactNativeNode,
  requireThat,
  validateDocument,
} from "./model";
import { MAX_CHECKPOINT_BYTES, MAX_CHECKPOINT_NODES } from "./limits";
import { contentDigest, canonicalJSON } from "./hash";
type Payload = Checkpoint["payload"];
export function checkpointWire(payload: Payload) {
  const { ancestorContext, ...rest } = payload;
  return {
    ...rest,
    ...(ancestorContext.length
      ? { ancestorContext: ancestorContext.map(compactNativeNode) }
      : {}),
    nodes: payload.nodes.map(compactNativeNode),
    components: payload.components.map((component) => ({
      ...component,
      nodes: component.nodes.map(compactNativeNode),
    })),
  };
}
export const checkpointDigest = (payload: Payload) =>
  contentDigest(checkpointWire(payload));
export function resourceDigest(
  doc: DesignDocument,
  assetIds: string[],
  fontIds: string[],
) {
  const assets = new Map(doc.assets.map((asset) => [asset.id, asset])),
    fonts = new Map(doc.fonts.map((font) => [font.id, font]));
  requireThat(
    assetIds.every((id) => assets.has(id)) &&
      fontIds.every((id) => fonts.has(id)),
    "CHECKPOINT_RESOURCE",
    "A checkpoint dependency is missing; retain its assets and licensed fonts.",
  );
  return contentDigest({
    assets: assetIds.map((id) => assets.get(id)),
    fonts: fontIds.map((id) => fonts.get(id)),
  });
}
export function checkpointDocument(
  doc: DesignDocument,
  checkpoint: Checkpoint,
): DesignDocument {
  const payload = checkpoint.payload;
  const assets = new Map(doc.assets.map((asset) => [asset.id, asset])),
    fonts = new Map(doc.fonts.map((font) => [font.id, font]));
  const pageIds = [...new Set(payload.nodes.map((node) => node.pageId))];
  return {
    ...blankDocument(checkpoint.label),
    id: doc.id,
    assets: payload.assetIds.map((id) => assets.get(id)!),
    fonts: payload.fontIds.map((id) => fonts.get(id)!),
    pages: pageIds.length
      ? pageIds.map((id) => ({ id, name: "Checkpoint", background: "none" }))
      : doc.pages.slice(0, 1),
    nodes: structuredClone(payload.nodes),
    components: structuredClone(payload.components),
    tokens: structuredClone(payload.tokens),
    tokenThemes: structuredClone(payload.tokenThemes),
    activeTokenTheme: payload.activeTokenTheme,
  };
}
export function validateCheckpoints(doc: DesignDocument) {
  let bytes = 0,
    nodeCount = 0;
  for (const checkpoint of doc.checkpoints) {
    bytes += new TextEncoder().encode(
      canonicalJSON(checkpointWire(checkpoint.payload)),
    ).length;
    nodeCount +=
      checkpoint.payload.nodes.length +
      checkpoint.payload.ancestorContext.length +
      checkpoint.payload.components.reduce(
        (sum, item) => sum + item.nodes.length,
        0,
      );
    requireThat(
      bytes <= MAX_CHECKPOINT_BYTES && nodeCount <= MAX_CHECKPOINT_NODES,
      "CHECKPOINT_LIMIT",
      "Retained checkpoints exceed 16 MB or 100,000 stored parts. Export a backup and remove older checkpoints before adding another.",
    );
    requireThat(
      checkpointDigest(checkpoint.payload) === checkpoint.digest,
      "CHECKPOINT_DIGEST",
      "A checkpoint's content digest is invalid.",
    );
    requireThat(
      resourceDigest(
        doc,
        checkpoint.payload.assetIds,
        checkpoint.payload.fontIds,
      ) === checkpoint.payload.resourceDigest,
      "CHECKPOINT_RESOURCE",
      "A checkpoint's immutable assets/fonts changed.",
    );
    if (checkpoint.kind === "frame")
      requireThat(
        checkpoint.payload.rootId === checkpoint.targetId &&
          checkpoint.payload.nodes.find(
            (node) => node.id === checkpoint.targetId,
          )?.type === "frame",
        "CHECKPOINT_TARGET",
        "Invalid retained frame root.",
      );
    else
      requireThat(
        !checkpoint.payload.nodes.length &&
          checkpoint.payload.components.some(
            (item) =>
              item.id === checkpoint.targetId &&
              item.rootId === checkpoint.payload.rootId,
          ),
        "CHECKPOINT_TARGET",
        "Invalid retained component root.",
      );
    const context = checkpoint.payload.ancestorContext;
    requireThat(
      checkpoint.kind === "frame" || !context.length,
      "CHECKPOINT_CONTEXT",
      "Only frame checkpoints retain ancestor context.",
    );
    const retained = checkpointDocument(doc, checkpoint);
    for (const [index, node] of context.entries())
      requireThat(
        (node.type === "frame" || node.type === "group") &&
          node.pageId === retained.nodes[0].pageId &&
          node.parentId === (context[index + 1]?.id ?? null),
        "CHECKPOINT_CONTEXT",
        "Invalid retained ancestor chain.",
      );
    validateDocument(retained);
    if (context.length) {
      retained.nodes.push(
        ...structuredClone(context).map((node) => ({
          ...node,
          component: null,
          componentPart: null,
          componentSource: null,
          bindings: {},
          tokenTheme: null,
        })),
      );
      retained.nodes[0].parentId = context[0].id;
      validateDocument(retained);
    }
  }
}
