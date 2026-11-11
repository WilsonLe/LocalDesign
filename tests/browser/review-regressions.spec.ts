import { test, expect } from "@playwright/test";
import { zipSync, strToU8 } from "fflate";
import { harness, open, tool, inspect, edits } from "./helpers";
async function png(page: Parameters<typeof inspect>[0], ids?: string[]) {
  const a = await tool(page, "export_design", { format: "png", ids });
  expect(a.isError, a.message).not.toBe(true);
  const part = await tool(page, "artifact", {
    id: a.id,
    action: "read",
    length: 524288,
  });
  const bytes = Buffer.from(part.base64, "base64");
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    base64: part.base64,
  };
}
test("page/selected-group/preview bounds retain moved visible children and respect clipping/hidden layers", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const d = await inspect(page);
  await edits(page, [
    {
      op: "create",
      node: {
        id: "group",
        type: "group",
        name: "Moved content",
        pageId: d.pageId,
        width: 100,
        height: 100,
      },
    },
    {
      op: "create",
      node: {
        id: "child",
        type: "rectangle",
        name: "Visible red",
        pageId: d.pageId,
        parentId: "group",
        x: 10,
        y: 0,
        width: 80,
        height: 80,
        fill: "#ff0000",
      },
    },
    {
      op: "create",
      node: {
        id: "hidden",
        type: "rectangle",
        name: "Hidden overflow",
        pageId: d.pageId,
        parentId: "group",
        x: 1000,
        y: 0,
        width: 100,
        height: 80,
        hidden: true,
      },
    },
  ]);
  await edits(page, [{ op: "update", ids: ["child"], patch: { x: 200 } }]);
  for (const ids of [undefined, ["group"]]) {
    const result = await png(page, ids);
    expect(result.width).toBe(80);
    expect(result.height).toBe(80);
    const pixel = await page.evaluate(async (b64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${b64}`;
      await image.decode();
      const c = document.createElement("canvas");
      c.width = 80;
      c.height = 80;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      return [...ctx.getImageData(40, 40, 1, 1).data];
    }, result.base64);
    expect(pixel).toEqual([255, 0, 0, 255]);
  }
  const preview = await tool(page, "export_design", { format: "preview" });
  const p = await tool(page, "artifact", { id: preview.id, action: "read" });
  expect(Buffer.from(p.base64, "base64").readUInt32BE(16)).toBe(80);
  await edits(page, [
    { op: "delete", ids: ["group"] },
    {
      op: "create",
      node: {
        id: "frame",
        type: "frame",
        name: "Clip boundary",
        pageId: d.pageId,
        width: 100,
        height: 100,
        fill: "#ffffff",
        clip: true,
      },
    },
    {
      op: "create",
      node: {
        id: "outside",
        type: "rectangle",
        name: "Outside frame",
        pageId: d.pageId,
        parentId: "frame",
        x: 200,
        y: 0,
        width: 80,
        height: 80,
        fill: "#ff0000",
      },
    },
  ]);
  expect((await png(page, ["frame"])).width).toBe(100);
  await edits(page, [{ op: "update", ids: ["frame"], patch: { clip: false } }]);
  expect((await png(page, ["frame"])).width).toBe(280);
});
test("safe SVG composes element coordinates with translate then rotate faithfully", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  await page.getByLabel("Import design file").setInputFiles({
    name: "transformed.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect x="10" y="20" width="40" height="30" transform="translate(100 100) rotate(90)" fill="#ff0000"/></svg>',
    ),
  });
  await expect.poll(async () => (await inspect(page)).nodes.length).toBe(2);
  const doc = await inspect(page),
    rect = doc.nodes.find((n: any) => n.type === "rectangle");
  expect(rect.x).toBeCloseTo(80);
  expect(rect.y).toBeCloseTo(110);
  expect(rect.rotation).toBe(90);
  const result = await png(page);
  const pixels = await page.evaluate(async (b64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${b64}`;
    await image.decode();
    const c = document.createElement("canvas");
    c.width = 200;
    c.height = 200;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    return {
      inside: [...ctx.getImageData(65, 130, 1, 1).data],
      displaced: [...ctx.getImageData(95, 140, 1, 1).data],
    };
  }, result.base64);
  expect(pixels.inside).toEqual([255, 0, 0, 255]);
  expect(pixels.displaced[3]).toBe(0);
});
test("truncated or dimension-mismatched native assets reject before prepare or UI replacement", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const before = await inspect(page);
  const node = {
    id: "broken-image",
    type: "image",
    name: "Broken image",
    pageId: before.pageId,
    width: 100,
    height: 100,
    assetId: "image",
  };
  const makeArchive = (bytes: Uint8Array, width = 1) =>
    zipSync({
      "document.json": strToU8(
        JSON.stringify({
          schemaVersion: 1,
          id: "bad-native",
          revision: 0,
          name: "Invalid design",
          pages: before.pages,
          nodes: [node],
          assets: [
            {
              id: "image",
              name: "Invalid image",
              mime: "image/png",
              width,
              height: 1,
              data: "assets/image.png",
            },
          ],
        }),
      ),
      "assets/image.png": bytes,
    });
  const bad = makeArchive(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const prepared = await tool(page, "import_files", {
    action: "prepare",
    name: "broken.localdesign",
    base64: Buffer.from(bad).toString("base64"),
  });
  expect(prepared.code).toBe("INVALID_ASSET");
  expect((await inspect(page)).documentId).toBe(before.documentId);
  await page.getByLabel("Import design file").setInputFiles({
    name: "broken.localdesign",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(bad),
  });
  await expect(page.getByRole("status")).toContainText("cannot be decoded");
  expect((await inspect(page)).documentId).toBe(before.documentId);
  const good = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPS0AAAAASUVORK5CYII=",
    "base64",
  );
  const mismatch = await tool(page, "import_files", {
    action: "prepare",
    name: "mismatch.localdesign",
    base64: Buffer.from(makeArchive(good, 2)).toString("base64"),
  });
  expect(mismatch.code).toBe("INVALID_ASSET");
  expect((await inspect(page)).documentId).toBe(before.documentId);
  const invalidEdit = await tool(page, "apply_edits", {
    expectedDocumentId: before.documentId,
    expectedRevision: before.revision,
    requestId: "invalid-image-command",
    commands: [
      {
        op: "asset_add",
        asset: {
          id: "bad-image-edit",
          name: "Bad",
          mime: "image/png",
          data: "data:image/png;base64,iVBORw0KGgo=",
          width: 1,
          height: 1,
        },
      },
    ],
  });
  expect(invalidEdit.code).toBe("INVALID_ASSET");
  expect((await inspect(page)).assets).toHaveLength(0);
});
test("Escape cancels inspector drafts without changing revision/history; Enter commits once", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const doc = await inspect(page);
  await edits(page, [
    {
      op: "create",
      node: {
        id: "shape",
        type: "rectangle",
        name: "Shape",
        pageId: doc.pageId,
        x: 200,
        y: 100,
      },
    },
  ]);
  await tool(page, "selection", { ids: ["shape"] });
  const before = await inspect(page);
  const field = page.getByLabel("X", { exact: true });
  await field.fill("250");
  await field.press("Escape");
  expect((await inspect(page)).revision).toBe(before.revision);
  expect((await inspect(page)).nodes[0].x).toBe(200);
  await field.fill("250");
  await field.press("Enter");
  expect((await inspect(page)).revision).toBe(before.revision + 1);
  expect((await inspect(page)).nodes[0].x).toBe(250);
});

test("queued saves keep Saving status and unload protection until the newest revision is durable", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    let writes = 0;
    IDBDatabase.prototype.transaction = function (
      ...args: Parameters<IDBDatabase["transaction"]>
    ) {
      const tx = original.apply(this, args);
      if (
        args[1] === "readwrite" &&
        tx.objectStoreNames.contains("documents") &&
        ++writes === 2
      ) {
        let hold = true;
        const store = tx.objectStore("documents");
        const spin = () => {
          if (hold) {
            const request = store.get("__hold_test__");
            request.onsuccess = spin;
          }
        };
        spin();
        (window as any).__secondSaveHeld = true;
        (window as any).__releaseSave = () => {
          hold = false;
        };
      }
      return tx;
    };
  });
  const d = await inspect(page);
  await page.evaluate(async (d) => {
    const t = (window as any).__testSiteTools.get("localdesign_apply_edits");
    await t.execute({
      expectedDocumentId: d.documentId,
      expectedRevision: d.revision,
      requestId: "queued-first",
      commands: [{ op: "rename", name: "First queued" }],
    });
    await t.execute({
      expectedDocumentId: d.documentId,
      expectedRevision: d.revision + 1,
      requestId: "queued-second",
      commands: [{ op: "rename", name: "Newest unsaved" }],
    });
  }, d);
  await expect
    .poll(() => page.evaluate(() => (window as any).__secondSaveHeld))
    .toBe(true);
  expect((await tool(page, "workspace")).storage).toBe("saving");
  await expect(page.locator(".save-state")).toContainText("Saving");
  const protectedUnload = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(protectedUnload).toBe(true);
  await page.evaluate(() => (window as any).__releaseSave());
  await expect
    .poll(async () => (await tool(page, "workspace")).storage)
    .toBe("saved");
  await page.reload();
  await expect(page.getByTestId("canvas")).toBeVisible();
  await expect
    .poll(async () => (await inspect(page)).name)
    .toBe("Newest unsaved");
});
test("actual native exporter reopens a supported metadata scene above eight MB", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const d = await inspect(page);
  const commands: any[] = [
    {
      op: "create",
      node: {
        id: "large-root",
        type: "group",
        name: "Large document",
        pageId: d.pageId,
        width: 100,
        height: 100,
      },
    },
  ];
  for (let i = 0; i < 400; i++)
    commands.push({
      op: "create",
      node: {
        id: `large-text-${i}`,
        type: "text",
        name: `Hidden text ${i}`,
        pageId: d.pageId,
        parentId: "large-root",
        text: "a".repeat(20000),
        hidden: true,
      },
    });
  await edits(page, commands);
  const artifact = await tool(page, "export_design", { format: "native" });
  expect(artifact.isError, artifact.message).not.toBe(true);
  const part = await tool(page, "artifact", {
    id: artifact.id,
    action: "read",
    length: 524288,
  });
  const prepared = await tool(page, "import_files", {
    action: "prepare",
    name: "large.localdesign",
    base64: part.base64,
  });
  expect(prepared.isError, prepared.message).not.toBe(true);
  expect(prepared.nodes).toBe(401);
  const current = await tool(page, "inspect_document", { limit: 1 });
  const imported = await tool(page, "import_files", {
    action: "commit",
    artifactId: prepared.importId,
    guard: {
      expectedDocumentId: current.documentId,
      expectedRevision: current.revision,
      requestId: "reopen-large",
    },
  });
  expect(imported.isError, imported.message).not.toBe(true);
  const reopened = await tool(page, "inspect_document", { limit: 1 });
  expect(reopened.total).toBe(401);
  expect(reopened.documentId).not.toBe(d.documentId);
});
