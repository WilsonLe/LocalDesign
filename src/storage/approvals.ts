import { openDB } from "idb";
import { type DesignDocument, type Handoff, requireThat } from "../core/model";
import {
  approvalGrantDigest,
  handoffStatus,
  type HandoffStatus,
} from "../core/approvals";
import { fontsReady } from "../render/fonts";
const key = (documentId: string, grantId: string) =>
  `human-approval:${documentId}:${grantId}`;
export async function persistApprovalGrant(
  documentId: string,
  handoffId: string,
  approval: NonNullable<Handoff["approval"]>,
) {
  const store = await openDB("localdesign-v1", 1);
  requireThat(
    store.objectStoreNames.contains("settings"),
    "APPROVAL_STORAGE",
    "Open the workspace before approving.",
  );
  await store.put(
    "settings",
    approvalGrantDigest(documentId, handoffId, approval),
    key(documentId, approval.grantId),
  );
}
export async function readHandoffStatuses(
  doc: DesignDocument,
): Promise<Record<string, HandoffStatus>> {
  if (!doc.handoffs.length) return {};
  await fontsReady(doc);
  const store = await openDB("localdesign-v1", 1);
  const result: Record<string, HandoffStatus> = Object.create(null);
  for (const handoff of doc.handoffs) {
    const digest = handoff.approval
      ? await store.get("settings", key(doc.id, handoff.approval.grantId))
      : undefined;
    result[handoff.id] = handoffStatus(
      doc,
      handoff,
      typeof digest === "string" ? digest : undefined,
    );
  }
  return result;
}
