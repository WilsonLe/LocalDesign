import {
  type Checkpoint,
  type DesignDocument,
  type DesignNode,
  compactNativeNode,
  ancestors,
  descendants,
  requireThat,
} from "./model";
import { contentDigest } from "./hash";
import { worldPoint, worldRotation, localPoint } from "./geometry";

import { resourceDigest, checkpointDocument } from "./checkpointValidation";
export {
  checkpointWire,
  checkpointDigest,
  checkpointDocument,
  validateCheckpoints,
} from "./checkpointValidation";
type Payload = Checkpoint["payload"];
export function componentClosure(doc: DesignDocument, ids: Iterable<string>) {
  const map = new Map(
      doc.components.map((definition) => [definition.id, definition]),
    ),
    result = new Set<string>();
  const visit = (id: string) => {
    if (result.has(id)) return;
    const item = map.get(id);
    requireThat(item, "MISSING_COMPONENT", "Missing reusable dependency.");
    result.add(id);
    for (const node of item.nodes)
      if (node.component) visit(node.component.componentId);
  };
  for (const id of ids) visit(id);
  return doc.components.filter((item) => result.has(item.id));
}
export function captureCheckpoint(
  doc: DesignDocument,
  kind: Checkpoint["kind"],
  targetId: string,
): Payload {
  let nodes: DesignNode[] = [];
  let ancestorContext: DesignNode[] = [];
  let rootId = targetId;
  let components: DesignDocument["components"];
  if (kind === "frame") {
    const root = doc.nodes.find((node) => node.id === targetId);
    requireThat(
      root?.type === "frame" && !root.componentPart,
      "CHECKPOINT_TARGET",
      "Select a complete frame for a checkpoint.",
    );
    ancestorContext = structuredClone(ancestors(doc, root));
    nodes = structuredClone([root, ...descendants(doc, root.id)]);
    Object.assign(nodes[0], worldPoint(doc, root), {
      rotation: worldRotation(doc, root),
      parentId: null,
    });
    components = componentClosure(
      doc,
      nodes.flatMap((node) =>
        node.component ? [node.component.componentId] : [],
      ),
    );
    for (const node of nodes) node.componentSource = null;
  } else {
    const definition = doc.components.find(
      (item) => item.id === targetId && !item.deleted,
    );
    requireThat(
      definition,
      "CHECKPOINT_TARGET",
      "Select an active component for a checkpoint.",
    );
    rootId = definition.rootId;
    components = componentClosure(doc, [definition.id]);
  }
  const assetIds = [
    ...new Set(
      [
        ...nodes,
        ...ancestorContext,
        ...components.flatMap((item) => item.nodes),
      ]
        .flatMap((node) => [
          ...(node.assetId ? [node.assetId] : []),
          ...(node.component?.overrides ?? []).flatMap((row) =>
            typeof row.patch.assetId === "string" ? [row.patch.assetId] : [],
          ),
        ])
        .concat(
          components.flatMap((item) =>
            item.variants.flatMap((variant) =>
              variant.overrides.flatMap((row) =>
                typeof row.patch.assetId === "string"
                  ? [row.patch.assetId]
                  : [],
              ),
            ),
          ),
        ),
    ),
  ];
  const fontIds = doc.fonts.map((font) => font.id);
  return {
    rootId,
    nodes,
    ancestorContext,
    components: structuredClone(components),
    tokens: structuredClone(doc.tokens),
    tokenThemes: structuredClone(doc.tokenThemes),
    activeTokenTheme: doc.activeTokenTheme,
    assetIds,
    fontIds,
    resourceDigest: resourceDigest(doc, assetIds, fontIds),
  };
}
/** Frozen visual context for evidence; ordinary restore still uses the isolated frame. */
export function checkpointEvidenceDocument(
  doc: DesignDocument,
  checkpoint: Checkpoint,
): DesignDocument {
  const retained = checkpointDocument(doc, checkpoint);
  if (checkpoint.kind !== "frame" || !checkpoint.payload.ancestorContext.length)
    return retained;
  const root = retained.nodes.find((node) => node.id === checkpoint.targetId)!;
  const context = structuredClone(checkpoint.payload.ancestorContext);
  retained.nodes.push(...context);
  const parent = context[0];
  const point = localPoint(retained, parent, { x: root.x, y: root.y });
  root.x = point.x;
  root.y = point.y;
  root.rotation -= worldRotation(retained, parent);
  root.parentId = parent.id;
  for (const node of retained.nodes) {
    node.component = null;
    node.componentPart = null;
    node.componentSource = null;
    node.bindings = {};
    node.tokenTheme = null;
  }
  for (const node of context)
    node.layout = { ...node.layout, direction: "none" };
  return retained;
}
function dependencyChanges(doc: DesignDocument, checkpoint: Checkpoint) {
  const payload = checkpoint.payload;
  const changed: string[] = [];
  for (const definition of payload.components) {
    if (
      checkpoint.kind === "component" &&
      definition.id === checkpoint.targetId
    )
      continue;
    const current = doc.components.find((item) => item.id === definition.id);
    if (
      !current ||
      contentDigest({ ...current, revision: 0 }) !==
        contentDigest({ ...definition, revision: 0 })
    )
      changed.push(`component:${definition.id}`);
  }
  for (const token of payload.tokens)
    if (
      contentDigest(doc.tokens.find((item) => item.id === token.id) ?? null) !==
      contentDigest(token)
    )
      changed.push(`token:${token.id}`);
  for (const theme of payload.tokenThemes)
    if (
      contentDigest(
        doc.tokenThemes.find((item) => item.id === theme.id) ?? null,
      ) !== contentDigest(theme)
    )
      changed.push(`theme:${theme.id}`);
  if (doc.activeTokenTheme !== payload.activeTokenTheme)
    changed.push("activeTheme");
  return changed;
}
export function checkpointDiff(doc: DesignDocument, checkpoint: Checkpoint) {
  const current =
    checkpoint.kind === "frame"
      ? doc.nodes.find((node) => node.id === checkpoint.targetId)
      : undefined;
  const before =
    checkpoint.kind === "frame"
      ? current
        ? [current, ...descendants(doc, current.id)]
        : []
      : (doc.components.find((item) => item.id === checkpoint.targetId)
          ?.nodes ?? []);
  const after =
    checkpoint.kind === "frame"
      ? checkpoint.payload.nodes
      : checkpoint.payload.components.find(
          (item) => item.id === checkpoint.targetId,
        )!.nodes;
  const a = new Map(before.map((node) => [node.id, node])),
    b = new Map(after.map((node) => [node.id, node]));
  const added = after.filter((node) => !a.has(node.id)).map((node) => node.id),
    removed = before.filter((node) => !b.has(node.id)).map((node) => node.id),
    changed = after
      .filter(
        (node) =>
          a.has(node.id) &&
          contentDigest(compactNativeNode(a.get(node.id)!)) !==
            contentDigest(compactNativeNode(node)),
      )
      .map((node) => node.id);
  const dependencies = dependencyChanges(doc, checkpoint);
  return {
    added: added.slice(0, 100),
    addedCount: added.length,
    removed: removed.slice(0, 100),
    removedCount: removed.length,
    changed: changed.slice(0, 100),
    changedCount: changed.length,
    dependencies: dependencies.slice(0, 100),
    dependencyCount: dependencies.length,
  };
}
export function restoreCheckpoint(
  doc: DesignDocument,
  checkpoint: Checkpoint,
  mode: "frozen" | "linked",
  restoreDependencies: boolean,
) {
  const payload = checkpoint.payload;
  if (checkpoint.kind === "component" || mode === "linked") {
    const changes = dependencyChanges(doc, checkpoint);
    requireThat(
      restoreDependencies || !changes.length,
      "CHECKPOINT_DEPENDENCIES",
      `Checkpoint dependencies changed (${changes.slice(0, 10).join(", ")}). Review the diff and explicitly restore dependencies, or restore the frame as frozen artwork.`,
    );
    if (restoreDependencies) {
      for (const definition of payload.components) {
        if (
          checkpoint.kind === "component" &&
          definition.id === checkpoint.targetId
        )
          continue;
        const index = doc.components.findIndex(
            (item) => item.id === definition.id,
          ),
          copy = structuredClone(definition);
        copy.revision = (index < 0 ? 0 : doc.components[index].revision) + 1;
        if (index < 0) doc.components.push(copy);
        else doc.components[index] = copy;
      }
      for (const token of payload.tokens) {
        const index = doc.tokens.findIndex((item) => item.id === token.id);
        if (index < 0) doc.tokens.push(structuredClone(token));
        else doc.tokens[index] = structuredClone(token);
      }
      for (const theme of payload.tokenThemes) {
        const index = doc.tokenThemes.findIndex((item) => item.id === theme.id);
        if (index < 0) doc.tokenThemes.push(structuredClone(theme));
        else doc.tokenThemes[index] = structuredClone(theme);
      }
      doc.activeTokenTheme = payload.activeTokenTheme;
    }
  }
  if (checkpoint.kind === "component") {
    const definition = structuredClone(
      payload.components.find((item) => item.id === checkpoint.targetId)!,
    );
    const index = doc.components.findIndex((item) => item.id === definition.id);
    definition.revision = (index < 0 ? 0 : doc.components[index].revision) + 1;
    definition.deleted = false;
    if (index < 0) doc.components.push(definition);
    else doc.components[index] = definition;
    for (const node of doc.nodes)
      if (node.component?.componentId === definition.id)
        node.component.frozen = false;
    return;
  }
  const existing = doc.nodes.find((node) => node.id === checkpoint.targetId);
  requireThat(
    !existing?.componentPart,
    "COMPONENT_STRUCTURE",
    "Detach a generated part before restoring it independently.",
  );
  const remove = new Set(
    existing
      ? [existing, ...descendants(doc, existing.id)].map((node) => node.id)
      : [],
  );
  const nodes = structuredClone(payload.nodes);
  const pageId =
    existing?.pageId ??
    (doc.pages.some((page) => page.id === nodes[0].pageId)
      ? nodes[0].pageId
      : doc.pages[0].id);
  for (const node of nodes) {
    requireThat(
      !doc.nodes.some((item) => item.id === node.id && !remove.has(item.id)),
      "CHECKPOINT_COLLISION",
      "A retained part ID is now used outside the target frame.",
    );
    node.pageId = pageId;
    node.componentSource = null;
    if (mode === "frozen") {
      node.component = null;
      node.componentPart = null;
      node.bindings = {};
      node.tokenTheme = null;
    }
  }
  if (existing)
    for (const key of ["x", "y", "rotation", "parentId"] as const)
      Object.assign(nodes[0], { [key]: existing[key] });
  doc.nodes = doc.nodes.filter((node) => !remove.has(node.id));
  doc.nodes.push(...nodes);
}
