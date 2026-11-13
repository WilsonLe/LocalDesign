import { expect, test } from "@playwright/test";
import { harness, open, inspect, edits, tool, artifactBytes } from "./helpers";
async function setup(page: any) {
  await harness(page);
  await open(page);
  const d = await inspect(page);
  await edits(page, [
    {
      op: "token_set",
      token: { id: "ink", name: "ink", type: "color", value: "#112233" },
    },
    {
      op: "create",
      node: {
        id: "frame",
        type: "frame",
        name: "Review frame",
        pageId: d.pageId,
        width: 200,
        height: 120,
        bindings: { fill: "ink" },
      },
    },
    {
      op: "handoff_request",
      handoff: {
        id: "handoff",
        frameId: "frame",
        requestedBy: "Agent",
        note: "Ready for human review",
      },
    },
  ]);
  await page
    .getByRole("button", { name: "Design resources", exact: true })
    .click();
  await page.getByRole("tab", { name: "Handoff", exact: true }).click();
  return d;
}
test("trusted UI sign-off persists, invalidates on token changes and imports remain unverified", async ({
  page,
}) => {
  await setup(page);
  await page
    .getByRole("button", { name: "Approve current frame", exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(
    page.getByRole("status").filter({ hasText: "Approval requires" }),
  ).toBeVisible();
  expect((await tool(page, "handoffs")).handoffs[0].status).toBe("pending");
  await page
    .getByRole("button", { name: "Approve current frame", exact: true })
    .click();
  await expect(page.locator('[data-handoff-status="approved"]')).toBeVisible();
  let handoff = (await tool(page, "handoffs")).handoffs[0];
  const preview = await tool(page, "checkpoints", {
    action: "preview",
    id: handoff.approval.checkpointId,
  });
  const pixels = preview.content[0].data;
  await edits(page, [
    {
      op: "token_set",
      token: { id: "ink", name: "ink", type: "color", value: "#445566" },
    },
  ]);
  expect((await tool(page, "handoffs")).handoffs[0].status).toBe("changed");
  expect(
    (
      await tool(page, "checkpoints", {
        action: "preview",
        id: handoff.approval.checkpointId,
      })
    ).content[0].data,
  ).toBe(pixels);
  await page.reload();
  await expect(page.getByTestId("canvas")).toBeVisible();
  expect((await tool(page, "handoffs")).handoffs[0].status).toBe("changed");
  await edits(page, [
    {
      op: "token_set",
      token: { id: "ink", name: "ink", type: "color", value: "#112233" },
    },
  ]);
  expect((await tool(page, "handoffs")).handoffs[0].status).toBe("approved");
  const native = await tool(page, "export_design", { format: "native" }),
    bytes = await artifactBytes(page, native.id, native.size);
  await edits(page, [{ op: "handoff_revoke", id: "handoff" }]);
  const current = await inspect(page);
  const undone = await tool(page, "history", {
    action: "undo",
    expectedDocumentId: current.documentId,
    expectedRevision: current.revision,
    requestId: "undo-revoke",
  });
  expect(undone.isError, undone.message).not.toBe(true);
  expect((await tool(page, "handoffs")).handoffs[0].status).toBe("unverified");
  const prepared = await tool(page, "import_files", {
    action: "prepare",
    name: "signed.localdesign",
    base64: bytes.toString("base64"),
  });
  const before = await inspect(page);
  const committed = await tool(page, "import_files", {
    action: "commit",
    artifactId: prepared.importId,
    guard: {
      expectedDocumentId: before.documentId,
      expectedRevision: before.revision,
      requestId: "import-approval",
    },
  });
  expect(committed.isError, committed.message).not.toBe(true);
  handoff = (await tool(page, "handoffs")).handoffs[0];
  expect(handoff.status).toBe("unverified");
  expect(handoff.approval.reviewer).toBe("You");
});
test("failed approval storage preserves the pending request and exact design revision", async ({
  page,
}) => {
  await setup(page);
  const before = await inspect(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as any).__approvalPut = original;
    IDBObjectStore.prototype.put = function (value: any, key?: IDBValidKey) {
      if (typeof key === "string" && key.startsWith("human-approval:"))
        throw new DOMException("Approval storage denied", "QuotaExceededError");
      return original.call(this, value, key);
    };
  });
  await page
    .getByRole("button", { name: "Approve current frame", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Approval storage denied" }),
  ).toBeVisible();
  expect((await inspect(page)).revision).toBe(before.revision);
  expect((await tool(page, "handoffs")).handoffs[0].status).toBe("pending");
  expect((await tool(page, "checkpoints")).total).toBe(0);
});

test("approved evidence retains ancestor clipping and opacity after current ancestry changes", async ({
  page,
}) => {
  await setup(page);
  await edits(page, [
    {
      op: "create",
      node: {
        id: "parent",
        name: "Clipping parent",
        type: "frame",
        pageId: (await inspect(page)).pageId,
        width: 100,
        height: 80,
        clip: true,
        fill: "none",
        opacity: 0.5,
      },
    },
    { op: "reparent", ids: ["frame"], parentId: "parent" },
  ]);
  const visible = await tool(page, "export_design", {
    format: "png",
    ids: ["frame"],
    mode: "composition",
    background: "#ffffff",
  });
  const original = await artifactBytes(page, visible.id, visible.size);
  await page
    .getByRole("button", { name: "Approve current frame", exact: true })
    .click();
  await expect(page.locator('[data-handoff-status="approved"]')).toBeVisible();
  const handoff = (await tool(page, "handoffs")).handoffs[0];
  const evidence = async () =>
    (
      await tool(page, "checkpoints", {
        action: "preview",
        id: handoff.approval.checkpointId,
      })
    ).content[0].data;
  const retained = await evidence();
  expect(Buffer.from(retained, "base64")).toEqual(original);
  for (const patch of [
    { x: 600, rotation: 45 },
    { opacity: 0.25 },
    { clip: false },
    { hidden: true },
  ]) {
    await edits(page, [{ op: "update", ids: ["parent"], patch }]);
    expect((await tool(page, "handoffs")).handoffs[0].status).toBe("changed");
    expect(await evidence()).toBe(retained);
  }
  await page.reload();
  await expect(page.getByTestId("canvas")).toBeVisible();
  expect(await evidence()).toBe(retained);
});
