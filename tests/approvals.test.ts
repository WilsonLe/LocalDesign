import { it, expect } from "vitest";
import { DesignEngine } from "../src/core/engine";
import {
  blankDocument,
  makeNode,
  HandoffApprovalSchema,
  validateDocument,
} from "../src/core/model";
import { checkpointEvidenceDocument } from "../src/core/checkpoints";
import { CommandSchema } from "../src/core/commands";
import {
  approvalGrantDigest,
  handoffContentDigest,
  handoffStatus,
} from "../src/core/approvals";
function fixture() {
  const d = blankDocument();
  d.nodes.push(
    makeNode("frame", d.pages[0].id, { id: "frame", fill: "#112233" }),
  );
  const e = new DesignEngine(d);
  e.dispatch([
    CommandSchema.parse({
      op: "handoff_request",
      handoff: {
        id: "handoff",
        frameId: "frame",
        requestedBy: "Agent",
        note: "Review",
      },
    }),
  ]);
  return e;
}
it("agent command schemas and forged UI capabilities cannot grant human approval", async () => {
  const e = fixture(),
    before = e.document;
  expect(() =>
    CommandSchema.parse({ op: "handoff_approve", id: "handoff" }),
  ).toThrow();
  await expect(
    e.approveHuman(
      e.guard(),
      "handoff",
      "You",
      "",
      {} as never,
      async () => {},
    ),
  ).rejects.toThrow(/human-interface/);
  expect(e.document).toBe(before);
  expect(e.document.checkpoints).toEqual([]);
});
it("approval status binds content/dependencies and imported claims need browser-local trust", () => {
  const e = fixture();
  e.dispatch([
    {
      op: "checkpoint_create",
      id: "evidence",
      kind: "frame",
      targetId: "frame",
      label: "Approved fixture",
      author: "Fixture",
    },
  ]);
  const d = structuredClone(e.document);
  d.handoffs[0].approval = HandoffApprovalSchema.parse({
    grantId: "fixture-grant",
    documentId: d.id,
    reviewer: "Fixture",
    note: "Simulated trust for a unit contract",
    approvedAt: 1,
    contentDigest: handoffContentDigest(d, "frame"),
    checkpointId: "evidence",
    checkpointDigest: d.checkpoints[0].digest,
  });
  validateDocument(d);
  const digest = approvalGrantDigest(d.id, "handoff", d.handoffs[0].approval!);
  expect(handoffStatus(d, d.handoffs[0], undefined)).toBe("unverified");
  expect(handoffStatus(d, d.handoffs[0], digest)).toBe("approved");
  d.nodes[0].width++;
  expect(handoffStatus(d, d.handoffs[0], digest)).toBe("changed");
  d.id = "imported-document";
  expect(handoffStatus(d, d.handoffs[0], digest)).toBe("unverified");
});
it("history can retain human evidence but cannot recreate an active grant after revocation", () => {
  const e = fixture();
  e.dispatch([
    {
      op: "checkpoint_create",
      id: "evidence",
      kind: "frame",
      targetId: "frame",
      label: "Fixture",
      author: "Fixture",
    },
  ]);
  const d = structuredClone(e.document);
  d.handoffs[0].approval = HandoffApprovalSchema.parse({
    grantId: "fixture",
    documentId: d.id,
    reviewer: "Fixture",
    note: "",
    approvedAt: 1,
    contentDigest: handoffContentDigest(d, "frame"),
    checkpointId: "evidence",
    checkpointDigest: d.checkpoints[0].digest,
  });
  const engine = new DesignEngine(d);
  expect(() =>
    engine.dispatch([{ op: "checkpoint_delete", id: "evidence" }]),
  ).toThrow(/handoff/);
  engine.dispatch([{ op: "handoff_revoke", id: "handoff" }]);
  engine.history("undo", engine.guard());
  expect(engine.document.handoffs[0].approval?.historical).toBe(true);
  engine.history("redo", engine.guard());
  engine.history("undo", engine.guard());
  expect(engine.document.handoffs[0].approval?.historical).toBe(true);
});

it("approval binds ancestor appearance while its evidence retains the original immutable context", () => {
  const e = fixture();
  e.dispatch([
    CommandSchema.parse({
      op: "create",
      node: {
        id: "parent",
        name: "Parent",
        type: "group",
        pageId: e.pageId,
        x: 100,
        y: 80,
        rotation: 15,
        opacity: 0.5,
      },
    }),
    CommandSchema.parse({ op: "reparent", ids: ["frame"], parentId: "parent" }),
    {
      op: "checkpoint_create",
      id: "evidence",
      kind: "frame",
      targetId: "frame",
      label: "Context",
      author: "Fixture",
    },
  ]);
  const d = structuredClone(e.document);
  d.handoffs[0].approval = HandoffApprovalSchema.parse({
    grantId: "fixture",
    documentId: d.id,
    reviewer: "Fixture",
    note: "",
    approvedAt: 1,
    contentDigest: handoffContentDigest(d, "frame"),
    checkpointId: "evidence",
    checkpointDigest: d.checkpoints[0].digest,
  });
  const grant = approvalGrantDigest(d.id, "handoff", d.handoffs[0].approval!);
  const retained = checkpointEvidenceDocument(d, d.checkpoints[0]);
  expect(handoffStatus(d, d.handoffs[0], grant)).toBe("approved");
  for (const patch of [
    { x: 600 },
    { rotation: 45 },
    { opacity: 0.25 },
    { hidden: true },
  ]) {
    const changed = structuredClone(d);
    Object.assign(
      changed.nodes.find((n) => n.id === "parent")!,
      patch,
    );
    expect(handoffStatus(changed, changed.handoffs[0], grant)).toBe("changed");
    expect(checkpointEvidenceDocument(changed, changed.checkpoints[0])).toEqual(
      retained,
    );
  }
  expect(retained.nodes.find((n) => n.id === "parent")).toMatchObject({
    x: 100,
    rotation: 15,
    opacity: 0.5,
  });
  expect(() => validateDocument(d)).not.toThrow();
});
