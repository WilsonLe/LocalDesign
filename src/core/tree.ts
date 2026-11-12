import type { DesignDocument, DesignNode } from "./model";

// Build once per traversal/snapshot. Never cache a mutable engine transaction.
export function indexNodes(doc: DesignDocument) {
  const byId = new Map<string, DesignNode>();
  const children = new Map<string | null, DesignNode[]>();
  for (const node of doc.nodes) {
    byId.set(node.id, node);
    const siblings = children.get(node.parentId);
    if (siblings) siblings.push(node);
    else children.set(node.parentId, [node]);
  }
  return { byId, children };
}
export type NodeIndex = ReturnType<typeof indexNodes>;
