import {
  type DesignDocument,
  type Handoff,
  requireThat,
  descendants,
} from "./model";
import { resourceClosure } from "./resources";
import { libraryDigest } from "./packages";
import { contentDigest } from "./hash";
export function validateHandoffs(doc: DesignDocument) {
  for (const handoff of doc.handoffs)
    if (handoff.approval) {
      const checkpoint = doc.checkpoints.find(
        (item) => item.id === handoff.approval!.checkpointId,
      );
      requireThat(
        checkpoint?.kind === "frame" &&
          checkpoint.targetId === handoff.frameId &&
          checkpoint.digest === handoff.approval.checkpointDigest,
        "APPROVAL_EVIDENCE",
        "Approved handoffs must retain their matching frame checkpoint.",
      );
    }
}
export function handoffContentDigest(doc: DesignDocument, frameId: string) {
  const frame = doc.nodes.find((node) => node.id === frameId);
  requireThat(
    frame?.type === "frame" && !frame.componentPart,
    "HANDOFF_FRAME",
    "Select a complete existing frame.",
  );
  const nodes = [frame, ...descendants(doc, frameId)];
  const ids = new Set(nodes.map((node) => node.id));
  return contentDigest({
    library: libraryDigest(resourceClosure(doc, [], nodes)),
    interactions: doc.prototype.interactions.filter((item) =>
      ids.has(item.sourceId),
    ),
    entry: doc.prototype.entryFrameId === frameId,
  });
}
export const approvalGrantDigest = (
  documentId: string,
  handoffId: string,
  approval: NonNullable<Handoff["approval"]>,
) => contentDigest({ documentId, handoffId, approval });
export type HandoffStatus =
  "pending" | "approved" | "changed" | "unverified" | "missing_frame";
export function handoffStatus(
  doc: DesignDocument,
  handoff: Handoff,
  trustedDigest: string | undefined,
): HandoffStatus {
  if (
    !doc.nodes.some(
      (node) => node.id === handoff.frameId && node.type === "frame",
    )
  )
    return "missing_frame";
  if (!handoff.approval) return "pending";
  if (
    handoff.approval.historical ||
    handoff.approval.documentId !== doc.id ||
    trustedDigest !== approvalGrantDigest(doc.id, handoff.id, handoff.approval)
  )
    return "unverified";
  return handoff.approval.contentDigest ===
    handoffContentDigest(doc, handoff.frameId)
    ? "approved"
    : "changed";
}
