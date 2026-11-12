import { expect, test } from "@playwright/test";
import { edits, harness, inspect, open, tool } from "./helpers";

test.beforeEach(async ({ page }) => {
  await harness(page);
  await open(page);
});

test("human context and captured references survive native export/reopen and remain agent-readable", async ({
  page,
}) => {
  const d = await inspect(page),
    frameId = "reference-frame";
  await edits(page, [
    {
      op: "create",
      node: {
        id: frameId,
        type: "frame",
        pageId: d.pageId,
        name: "Approved reference",
        width: 180,
        height: 100,
        fill: "#126644",
      },
    },
  ]);
  await tool(page, "selection", { ids: [frameId] });
  await page
    .getByRole("button", { name: "Design resources", exact: true })
    .click();
  await page.getByLabel("Guideline name").fill("Brand");
  await page
    .getByLabel("Guideline rules")
    .fill("Keep the original green and generous margins.");
  await page
    .getByRole("button", { name: "Save guideline", exact: true })
    .click();
  await page.getByLabel("Decision", { exact: true }).fill("Keep green");
  await page
    .getByLabel("Decision reason")
    .fill("The human selected the reference.");
  await page
    .getByRole("button", { name: "Record decision", exact: true })
    .click();
  await page.getByLabel("Reference title").fill("Direction A");
  await page.getByLabel("Reference source").fill("Approved reference frame");
  await page
    .getByRole("button", { name: "Pin selection", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Direction A", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  const context = await tool(page, "context");
  expect(context.guidelines).toHaveLength(1);
  expect(context.decisions[0].decision).toBe("Keep green");
  expect(context.references[0].title).toBe("Direction A");
  const capture = await tool(page, "context", {
    action: "get_reference",
    id: context.references[0].id,
  });
  expect(capture.artifact.mime).toBe("image/png");
  const native = await tool(page, "export_design", { format: "native" });
  const chunks: string[] = [];
  for (let offset = 0; offset < native.size; offset += 262144) {
    const chunk = await tool(page, "artifact", {
      action: "read",
      id: native.id,
      offset,
    });
    chunks.push(chunk.base64);
  }
  const bytes = Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk, "base64")),
  ).toString("base64");
  const prepared = await tool(page, "import_files", {
    action: "prepare",
    name: "context.localdesign",
    base64: bytes,
  });
  const current = await inspect(page);
  const reopened = await tool(page, "import_files", {
    action: "commit",
    artifactId: prepared.importId,
    guard: {
      expectedDocumentId: current.documentId,
      expectedRevision: current.revision,
      requestId: crypto.randomUUID(),
    },
  });
  expect(reopened.isError).not.toBe(true);
  await page.reload();
  await expect(page.getByTestId("canvas")).toBeVisible();
  const restored = await tool(page, "context");
  expect(restored.references).toEqual(context.references);
  expect(restored.decisions).toEqual(context.decisions);
  const guide = await tool(page, "context", {
    action: "get_guideline",
    id: restored.guidelines[0].id,
  });
  expect(guide.guideline.content).toContain("original green");
});

test("page controls reorder pages and move selected native frames without recreating IDs", async ({
  page,
}) => {
  const d = await inspect(page),
    destination = "destination-page",
    frameId = "moving-frame";
  await edits(page, [
    {
      op: "page_create",
      page: { id: destination, name: "Second", background: "#202020" },
    },
    {
      op: "create",
      node: {
        id: frameId,
        type: "frame",
        pageId: d.pageId,
        name: "Moving",
        x: 44,
        y: 65,
        width: 80,
        height: 60,
      },
    },
  ]);
  await tool(page, "selection", { ids: [frameId] });
  await page
    .getByRole("button", { name: "Design resources", exact: true })
    .click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page
    .getByRole("button", { name: "Move Second earlier", exact: true })
    .click();
  await page
    .getByLabel("Destination page", { exact: true })
    .selectOption(destination);
  await page.getByRole("button", { name: "Move to page", exact: true }).click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  const moved = await inspect(page);
  expect(moved.pages[0].id).toBe(destination);
  expect(moved.selection).toEqual([frameId]);
  expect(moved.nodes[0]).toMatchObject({
    id: frameId,
    pageId: destination,
    x: 44,
    y: 65,
  });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await inspect(page)).nodes[0].pageId).toBe(d.pageId);
});

test("compact inspection filters nodes without changing history or selection", async ({
  page,
}) => {
  const d = await inspect(page);
  await edits(page, [
    {
      op: "create",
      node: {
        id: "overview-frame",
        type: "frame",
        pageId: d.pageId,
        name: "Hero",
      },
    },
    {
      op: "create",
      node: {
        id: "overview-text",
        type: "text",
        pageId: d.pageId,
        parentId: "overview-frame",
        name: "Heading",
        text: "Original",
      },
    },
  ]);
  const before = await inspect(page);
  const overview = await tool(page, "inspect_document", {
    detail: "overview",
    limit: 1,
  });
  expect(overview.nodes).toHaveLength(1);
  expect(overview.nodes[0].childCount).toBe(1);
  expect(overview.nodes[0]).not.toHaveProperty("text");
  const focused = await tool(page, "inspect_document", {
    ids: ["overview-text"],
    query: "HEAD",
    type: "text",
    detail: "summary",
  });
  expect(focused.nodes[0].id).toBe("overview-text");
  expect((await inspect(page)).revision).toBe(before.revision);
  expect((await inspect(page)).selection).toEqual(before.selection);
});
