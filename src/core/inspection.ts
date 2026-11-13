import { bounds } from "./geometry";
import {
  descendants,
  requireThat,
  type DesignDocument,
  type DesignNode,
} from "./model";
import { indexNodes } from "./tree";

export type NodeQuery = {
  rootId?: string;
  ids?: string[];
  pageId?: string;
  query?: string;
  type?: DesignNode["type"];
  detail?: "full" | "summary" | "overview";
  offset: number;
  limit: number;
};

/** All discovery modes share the same filtering, identity and pagination. */
export function inspectNodes(document: DesignDocument, input: NodeQuery) {
  const index = indexNodes(document);
  if (input.rootId)
    requireThat(
      index.byId.has(input.rootId),
      "MISSING_NODE",
      "Unknown subtree root.",
    );
  if (input.pageId)
    requireThat(
      document.pages.some((p) => p.id === input.pageId),
      "MISSING_PAGE",
      "Unknown page.",
    );
  if (input.ids)
    requireThat(
      input.ids.every((id) => index.byId.has(id)),
      "MISSING_NODE",
      "Unknown node ID.",
    );
  const subtree = input.rootId
    ? new Set([
        input.rootId,
        ...descendants(document, input.rootId).map((n) => n.id),
      ])
    : null;
  const ids = input.ids ? new Set(input.ids) : null;
  const query = input.query?.toLocaleLowerCase();
  const matches = document.nodes.filter(
    (node) =>
      (!subtree || subtree.has(node.id)) &&
      (!ids || ids.has(node.id)) &&
      (!input.pageId || input.pageId === node.pageId) &&
      (!query || node.name.toLocaleLowerCase().includes(query)) &&
      (!input.type || node.type === input.type) &&
      (input.detail !== "overview" || node.parentId === null),
  );
  const raw = matches.slice(input.offset, input.offset + input.limit);
  return {
    raw,
    nodes:
      !input.detail || input.detail === "full"
        ? raw
        : raw.map((node) => ({
            id: node.id,
            name: node.name,
            type: node.type,
            pageId: node.pageId,
            parentId: node.parentId,
            hidden: node.hidden,
            locked: node.locked,
            width: node.width,
            height: node.height,
            rotation: node.rotation,
            worldBounds: bounds(document, [{ ...node, hidden: false }], index),
            childCount: index.children.get(node.id)?.length ?? 0,
          })),
    total: matches.length,
    nextOffset:
      input.offset + raw.length < matches.length
        ? input.offset + raw.length
        : null,
  };
}
