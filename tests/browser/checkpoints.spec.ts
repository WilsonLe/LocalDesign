import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { harness, open, inspect, edits, tool, artifactBytes } from "./helpers";
test("checkpoints persist across reload/native reopen and frozen restore is reviewed as a new revision", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const d = await inspect(page);
  await edits(page, [
    {
      op: "create",
      node: {
        id: "frame",
        type: "frame",
        name: "Review frame",
        pageId: d.pageId,
        width: 200,
        height: 120,
        fill: "#112233",
      },
    },
  ]);
  await tool(page, "selection", { ids: ["frame"] });
  await page
    .getByRole("button", { name: "Design resources", exact: true })
    .click();
  await page.getByRole("tab", { name: "History", exact: true }).click();
  await page
    .getByLabel("Checkpoint label", { exact: true })
    .fill("Before revision");
  await page
    .getByRole("button", { name: "Create checkpoint", exact: true })
    .click();
  expect((await tool(page, "checkpoints")).checkpoints).toHaveLength(1);
  await edits(page, [
    { op: "update", ids: ["frame"], patch: { fill: "#445566", width: 260 } },
  ]);
  await expect(page.locator(".save-state")).toContainText("Saved locally");
  await page.reload();
  await expect(page.getByTestId("canvas")).toBeVisible();
  await page
    .getByRole("button", { name: "Design resources", exact: true })
    .click();
  await page.getByRole("tab", { name: "History", exact: true }).click();
  const catalog = await tool(page, "checkpoints");
  const id = catalog.checkpoints[0].id;
  await page.getByLabel("Checkpoint", { exact: true }).selectOption(id);
  await page
    .getByRole("button", { name: "Preview retained content", exact: true })
    .click();
  await expect(
    page.getByAltText("Before revision retained preview", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Review restore", exact: true })
    .click();
  const before = await inspect(page);
  await page
    .getByRole("button", { name: "Restore as new revision", exact: true })
    .click();
  const after = await inspect(page);
  expect(after.revision).toBe(before.revision + 1);
  expect(after.nodes.find((n: any) => n.id === "frame")).toMatchObject({
    fill: "#112233",
    width: 200,
  });
  const native = await tool(page, "export_design", { format: "native" });
  const bytes = await artifactBytes(page, native.id, native.size);
  const prepared = await tool(page, "import_files", {
    action: "prepare",
    name: "history.localdesign",
    base64: bytes.toString("base64"),
  });
  const current = await inspect(page);
  const committed = await tool(page, "import_files", {
    action: "commit",
    artifactId: prepared.importId,
    guard: {
      expectedDocumentId: current.documentId,
      expectedRevision: current.revision,
      requestId: "reopen-history",
    },
  });
  expect(committed.isError, committed.message).not.toBe(true);
  expect((await tool(page, "checkpoints")).checkpoints[0]).toMatchObject({
    id,
    label: "Before revision",
  });
  const preview = await tool(page, "checkpoints", { action: "preview", id });
  expect(preview.content[0].data.length).toBeGreaterThan(100);
});

test("retained frame and component previews ignore later local fallback fonts after native reopen", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const d = await inspect(page);
  await edits(page, [
    {
      op: "create",
      node: {
        id: "frame",
        type: "frame",
        name: "Retained font frame",
        pageId: d.pageId,
        width: 400,
        height: 120,
      },
    },
    {
      op: "create",
      node: {
        id: "text",
        type: "text",
        name: "Retained text",
        pageId: d.pageId,
        parentId: "frame",
        text: "Approved snapshot",
        fontFamily: "Source Serif 4",
        fontSize: 30,
        width: 360,
        height: 60,
      },
    },
    {
      op: "component_capture",
      id: "type-component",
      rootId: "frame",
      name: "Type component",
    },
    {
      op: "checkpoint_create",
      id: "frame-evidence",
      kind: "frame",
      targetId: "frame",
      label: "Frame evidence",
      author: "Fixture",
    },
    {
      op: "checkpoint_create",
      id: "component-evidence",
      kind: "component",
      targetId: "type-component",
      label: "Component evidence",
      author: "Fixture",
    },
  ]);
  const preview = async (id: string) =>
    (await tool(page, "checkpoints", { action: "preview", id })).content[0]
      .data;
  const frame = await preview("frame-evidence"),
    component = await preview("component-evidence");
  const font = await readFile(
    "node_modules/@fontsource/source-serif-4/files/source-serif-4-vietnamese-400-normal.woff2",
  );
  const current = await inspect(page);
  const added = await tool(page, "import_font", {
    expectedDocumentId: current.documentId,
    expectedRevision: current.revision,
    requestId: "later-fallback-font",
    name: "source-serif-4.woff2",
    base64: font.toString("base64"),
    license:
      "SIL Open Font License 1.1; authorized bundled Source Serif 4 fixture",
    redistributionAllowed: true,
  });
  expect(added.isError, added.message).not.toBe(true);
  expect(await preview("frame-evidence")).toBe(frame);
  expect(await preview("component-evidence")).toBe(component);
  const native = await tool(page, "export_design", { format: "native" }),
    bytes = await artifactBytes(page, native.id, native.size);
  const prepared = await tool(page, "import_files", {
    action: "prepare",
    name: "retained-font.localdesign",
    base64: bytes.toString("base64"),
  });
  const before = await inspect(page);
  const committed = await tool(page, "import_files", {
    action: "commit",
    artifactId: prepared.importId,
    guard: {
      expectedDocumentId: before.documentId,
      expectedRevision: before.revision,
      requestId: "reopen-retained-font",
    },
  });
  expect(committed.isError, committed.message).not.toBe(true);
  expect(await preview("frame-evidence")).toBe(frame);
  expect(await preview("component-evidence")).toBe(component);
});
