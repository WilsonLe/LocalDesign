import { test, expect } from "@playwright/test";
import { strToU8, zipSync } from "fflate";
import { blankDocument, makeNode } from "../../src/core/model";
import { harness, open, tool, inspect, edits } from "./helpers";

test("one large editable project imports, saves, edits and exports without splitting", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const doc = blankDocument("Large combined workspace");
  doc.pages = Array.from({ length: 206 }, (_, i) => ({
    id: `section-${i}`,
    name: `Section ${i}`,
    background: "#202020",
  }));
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
    "base64",
  );
  const files: Record<string, Uint8Array> = {};
  doc.assets = Array.from({ length: 257 }, (_, i) => {
    const path = `assets/image-${i}.png`;
    files[path] = png;
    return {
      id: `image-${i}`,
      name: "Image",
      mime: "image/png" as const,
      data: path,
      width: 1,
      height: 1,
    };
  });
  doc.nodes = Array.from({ length: 4_201 }, (_, i) =>
    makeNode("rectangle", doc.pages[i % 206].id, {
      id: `layer-${i}`,
      name: `Layer ${i}`,
      x: (i % 8) * 20,
      y: 100 + (i % 10) * 20,
      width: 12,
      height: 12,
    }),
  );
  files["document.json"] = strToU8(JSON.stringify(doc));
  const prepared = await tool(page, "import_files", {
    action: "prepare",
    name: "combined.localdesign",
    base64: Buffer.from(zipSync(files)).toString("base64"),
  });
  expect(prepared.isError, prepared.message).not.toBe(true);
  const before = await inspect(page);
  const committed = await tool(page, "import_files", {
    action: "commit",
    artifactId: prepared.importId,
    guard: {
      expectedDocumentId: before.documentId,
      expectedRevision: before.revision,
      requestId: "large-import",
    },
  });
  expect(committed.isError, committed.message).not.toBe(true);
  const state = await inspect(page);
  expect(state.total).toBe(4_201);
  expect(state.pages).toHaveLength(206);
  expect(state.assets).toHaveLength(257);
  const catalog = await tool(page, "catalog");
  expect(catalog.limits).toMatchObject({
    nodes: 100_000,
    pages: 1_000,
    assets: 10_000,
    portableContentBytes: 120_000_000,
  });
  await edits(page, [
    {
      op: "update",
      ids: ["layer-0"],
      patch: { name: "Edited in combined workspace", x: 44 },
    },
  ]);
  await expect
    .poll(async () => page.locator(".save-state").innerText())
    .toContain("Saved locally");
  await page.reload();
  await expect(page.getByTestId("canvas")).toBeVisible();
  await expect
    .poll(async () => (await inspect(page)).nodes[0]?.name)
    .toBe("Edited in combined workspace");
  expect((await inspect(page)).total).toBe(4_201);

  const artifact = await tool(page, "export_design", { format: "native" });
  expect(artifact.isError, artifact.message).not.toBe(true);
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < artifact.size; offset += 262144) {
    const part = await tool(page, "artifact", {
      action: "read",
      id: artifact.id,
      offset,
    });
    chunks.push(Buffer.from(part.base64, "base64"));
  }
  const reopened = await tool(page, "import_files", {
    action: "prepare",
    name: "reopened.localdesign",
    base64: Buffer.concat(chunks).toString("base64"),
  });
  expect(reopened.isError, reopened.message).not.toBe(true);
  const current = await inspect(page);
  const opened = await tool(page, "import_files", {
    action: "commit",
    artifactId: reopened.importId,
    guard: {
      expectedDocumentId: current.documentId,
      expectedRevision: current.revision,
      requestId: "large-reopen",
    },
  });
  expect(opened.isError, opened.message).not.toBe(true);
  const result = await inspect(page);
  expect(result.documentId).not.toBe(current.documentId);
  expect(result.total).toBe(4_201);
  expect(result.pages).toHaveLength(206);
  expect(result.assets).toHaveLength(257);
  expect(result.nodes[0]).toMatchObject({
    name: "Edited in combined workspace",
    x: 44,
  });

  const invalid = {
    ...doc,
    name: "Do not replace",
    pages: Array.from({ length: 1_001 }, (_, i) => ({
      id: `p-${i}`,
      name: "Page",
      background: "#202020",
    })),
    nodes: [],
    assets: [],
  };
  const rejected = await tool(page, "import_files", {
    action: "prepare",
    name: "over-limit.localdesign",
    base64: Buffer.from(
      zipSync({ "document.json": strToU8(JSON.stringify(invalid)) }),
    ).toString("base64"),
  });
  expect(rejected.isError).toBe(true);
  const preserved = await inspect(page);
  expect(preserved.documentId).toBe(result.documentId);
  expect(preserved.total).toBe(4_201);
});
