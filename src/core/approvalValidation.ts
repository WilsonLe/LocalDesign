import { type DesignDocument, requireThat } from "./model";
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
