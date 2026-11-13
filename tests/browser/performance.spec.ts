import { test, expect } from "@playwright/test";
import { blankDocument, makeNode } from "../../src/core/model";
import { harness, open, inspect, tool } from "./helpers";

test("large workspace interaction stays bounded without changing document data", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await harness(page);
  await open(page);
  const doc = blankDocument("Performance fixture");
  doc.pages.push(
    ...Array.from({ length: 199 }, (_, i) => ({
      id: `page-${i}`,
      name: `Page ${i + 2}`,
      background: "#202020",
    })),
  );
  for (let i = 0; i < 100; i++) {
    const frame = makeNode("frame", doc.pages[0].id, {
      id: `frame-${i}`,
      name: `Section ${i}`,
      x: (i % 5) * 500,
      y: Math.floor(i / 5) * 600,
      width: 440,
      height: 540,
    });
    doc.nodes.push(frame);
    for (let j = 0; j < 20; j++)
      doc.nodes.push(
        makeNode(j % 5 === 0 ? "text" : "rectangle", frame.pageId, {
          id: `node-${i}-${j}`,
          parentId: frame.id,
          name: `Item ${i}-${j}`,
          x: 20 + (j % 2) * 200,
          y: 20 + Math.floor(j / 2) * 48,
          width: 180,
          height: 36,
          fontSize: 14,
          text: `Section ${i}, item ${j}: a portable design`,
        }),
      );
  }
  for (let i = 0; i < 3900; i++)
    doc.nodes.push(
      makeNode("rectangle", doc.pages[1 + (i % 199)].id, { id: `other-${i}` }),
    );
  // Seed disposable browser storage, never a real working copy.
  await page.evaluate(async (doc) => {
    const request = indexedDB.open("localdesign-v1", 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(["documents", "settings"], "readwrite");
    tx.objectStore("documents").put(doc);
    tx.objectStore("settings").put(doc.id, "active");
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, doc);
  const metrics: Record<string, number> = {};
  let start = Date.now();
  await page.goto(`workspace/${doc.id}`);
  await expect(page.getByTestId("canvas")).toBeVisible();
  await expect(page.locator(".save-state")).toContainText("Saved locally");
  await expect(page.locator('[data-node-id="frame-0"]')).toBeVisible();
  metrics.openMs = Date.now() - start;
  const before = await inspect(page);
  start = Date.now();
  for (let i = 0; i < 6; i++) {
    await tool(page, "viewport", { x: 100 + i * 10, y: 100, zoom: 1 });
    await page.evaluate(
      () =>
        new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r())),
        ),
    );
  }
  metrics.panMs = (Date.now() - start) / 6;
  start = Date.now();
  await page.getByRole("textbox", { name: "Search layers" }).fill("Item 99-19");
  await expect(
    page.getByRole("button", { name: "Select Item 99-19", exact: true }),
  ).toBeVisible();
  metrics.searchMs = Date.now() - start;
  await page.getByRole("textbox", { name: "Search layers" }).fill("");
  const after = await inspect(page);
  expect(after.nodes).toEqual(before.nodes);
  expect(after.revision).toBe(before.revision);
  expect(after.history).toEqual(before.history);
  metrics.mountedLayers = await page.locator(".layer-row").count();
  expect(metrics.mountedLayers).toBeLessThan(80);
  expect(metrics.panMs).toBeLessThan(400);
  // Scroll and keyboard navigation must reach rows outside the mounted window.
  const first = page.getByRole("button", {
    name: "Select Section 0",
    exact: true,
  });
  await first.focus();
  await first.press("End");
  const last = page.getByRole("button", {
    name: "Select Item 99-19",
    exact: true,
  });
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport();
  await last.press("Home");
  await expect(first).toBeFocused();
  await page.locator(".layer-list").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(last).toBeInViewport();
  await expect(first).toBeFocused();
  // A focused row stays mounted offscreen and Tab can cross the unmounted gap.
  await first.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Select Item 0-0", exact: true }),
  ).toBeFocused();
  start = Date.now();
  await tool(page, "selection", { ids: ["node-0-1"] });
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Item 0-1",
  );
  metrics.selectMs = Date.now() - start;
  const shape = page.locator('[data-node-id="node-0-1"]');
  const box = (await shape.boundingBox())!;
  start = Date.now();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 32,
    box.y + box.height / 2 + 16,
    { steps: 8 },
  );
  // Preview must not commit or save any intermediate frames.
  expect((await inspect(page)).revision).toBe(before.revision);
  await page.mouse.up();
  await expect(page.locator(".save-state")).toContainText("Saved locally");
  metrics.dragAndSaveMs = Date.now() - start;
  const dragged = await inspect(page);
  expect(dragged.revision).toBe(before.revision + 1);
  expect(
    dragged.nodes.find((n: { id: string }) => n.id === "node-0-1"),
  ).toMatchObject({ x: 252, y: 36 });
  await tool(page, "history", {
    action: "undo",
    expectedDocumentId: dragged.documentId,
    expectedRevision: dragged.revision,
    requestId: "undo-large-drag",
  });
  expect((await inspect(page)).nodes).toEqual(before.nodes);
  start = Date.now();
  const subtree = await tool(page, "inspect_document", { rootId: "frame-99" });
  metrics.inspectSubtreeMs = Date.now() - start;
  expect(subtree.total).toBe(21);
  start = Date.now();
  const exported = await tool(page, "export_design", {
    format: "svg",
    ids: ["frame-99"],
  });
  expect(exported.isError, exported.message).not.toBe(true);
  metrics.selectedExportMs = Date.now() - start;
  await page.screenshot({ path: testInfo.outputPath("large-workspace.png") });
  console.log("PERFORMANCE", JSON.stringify(metrics));
  await testInfo.attach("performance", {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  });
});

test("an open Fonts dialog refreshes when delayed bundled fonts become ready", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/*.woff2", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "New blank design", exact: true })
    .click();
  await page.getByRole("button", { name: "Fonts", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.locator(".font-sample use").count()).toBe(0);
  release();
  await expect(page.getByTestId("canvas")).toBeVisible();
  await expect
    .poll(() => page.locator(".font-sample use").count())
    .toBeGreaterThan(0);
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("flat large-page marquee selection shares its traversal index", async ({
  page,
}, testInfo) => {
  await harness(page);
  await open(page);
  const doc = blankDocument("Large flat page");
  doc.nodes = Array.from({ length: 6000 }, (_, i) =>
    makeNode("rectangle", doc.pages[0].id, {
      id: `flat-${i}`,
      name: `Flat ${i}`,
      x: 40 + (i % 30),
      y: 40 + (Math.floor(i / 30) % 30),
      width: 4,
      height: 4,
    }),
  );
  await page.evaluate(async (doc) => {
    const request = indexedDB.open("localdesign-v1", 1);
    const db = await new Promise<IDBDatabase>((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    const tx = db.transaction(["documents", "settings"], "readwrite");
    tx.objectStore("documents").put(doc);
    tx.objectStore("settings").put(doc.id, "active");
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
    db.close();
  }, doc);
  await page.goto(`workspace/${doc.id}`);
  await expect(page.getByTestId("canvas")).toBeVisible();
  await expect(page.locator(".save-state")).toContainText("Saved locally");
  const canvas = (await page.getByTestId("canvas").boundingBox())!;
  await page.mouse.move(canvas.x + 110, canvas.y + 110);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 200, canvas.y + 200);
  const start = Date.now();
  await page.mouse.up();
  const state = await inspect(page);
  const elapsed = Date.now() - start;
  expect(state.selection).toHaveLength(6000);
  expect(state.revision).toBe(0);
  expect(state.history).toEqual({ canUndo: false, canRedo: false });
  expect(elapsed).toBeLessThan(2500);
  await testInfo.attach("marquee-ms", {
    body: String(elapsed),
    contentType: "text/plain",
  });
});

test("a token-bound workspace can rename without validating the catalog once per binding", async ({
  page,
}, info) => {
  await harness(page);
  await open(page);
  const doc = blankDocument("Token performance fixture");
  doc.tokenThemes = Array.from({ length: 12 }, (_, i) => ({
    id: `theme-${i}`,
    name: `Theme ${i}`,
  }));
  doc.tokens = Array.from({ length: 500 }, (_, i) => ({
    id: `token-${i}`,
    name: `color-${i}`,
    type: "color" as const,
    value: "#112233",
    themes: Object.fromEntries(doc.tokenThemes.map((t) => [t.id, "#445566"])),
    description: "",
  }));
  doc.nodes = Array.from({ length: 1000 }, (_, i) =>
    makeNode("rectangle", doc.pages[0].id, {
      id: `node-${i}`,
      x: i * 200,
      bindings: { fill: `token-${i % 500}` },
    }),
  );
  await page.evaluate(async (doc) => {
    const request = indexedDB.open("localdesign-v1", 1);
    const db = await new Promise<IDBDatabase>((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    const tx = db.transaction(["documents", "settings"], "readwrite");
    tx.objectStore("documents").put(doc);
    tx.objectStore("settings").put(doc.id, "active");
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
    db.close();
  }, doc);
  await page.goto(`workspace/${doc.id}`);
  await expect(page.getByTestId("canvas")).toBeVisible();
  const result = await page.evaluate(async () => {
    const registry = (window as any).__testSiteTools;
    const d = await registry
      .get("localdesign_inspect_document")
      .execute({ limit: 1 });
    const start = performance.now();
    const receipt = await registry
      .get("localdesign_apply_edits")
      .execute({
        expectedDocumentId: d.documentId,
        expectedRevision: d.revision,
        requestId: "token-perf-rename",
        commands: [{ op: "rename", name: "Renamed token workspace" }],
      });
    return { ms: performance.now() - start, receipt };
  });
  expect(result.receipt.isError, result.receipt.message).not.toBe(true);
  expect(result.ms).toBeLessThan(process.env.CI ? 1000 : 500);
  const saved = await inspect(page);
  expect(saved.revision).toBe(1);
  expect(saved.total).toBe(1000);
  expect(saved.nodes[0].fill).toBe("#112233");
  console.log("TOKEN_BOUND_RENAME", result.ms);
  await info.attach("token-bound-rename", {
    body: JSON.stringify(result),
    contentType: "application/json",
  });
});
