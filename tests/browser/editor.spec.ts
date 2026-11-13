import { test, expect } from "@playwright/test";
import { harness, open, tool, inspect, edits, drag } from "./helpers";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
const evidence = process.env.LOCALDESIGN_EVIDENCE_DIR;
test("manual canvas/inspector, one gesture history, keyboard, layers, pages and persisted edits", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const box = (await page.getByTestId("canvas").boundingBox())!;
  await page.getByRole("button", { name: "Frame", exact: true }).click();
  await drag(
    page,
    { x: box.x + 120, y: box.y + 110 },
    { x: box.x + 600, y: box.y + 470 },
  );
  let d = await inspect(page);
  expect(d.nodes).toHaveLength(1);
  const frame = d.nodes[0];
  expect(frame.width).toBe(480);
  expect(d.revision).toBe(1);
  await page.getByLabel("Name", { exact: true }).fill("Artboard");
  await page.getByLabel("Name", { exact: true }).press("Tab");
  d = await inspect(page);
  expect(d.nodes[0].width).toBe(480);
  expect(d.nodes[0].name).toBe("Artboard");
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await drag(
    page,
    { x: box.x + 170, y: box.y + 180 },
    { x: box.x + 300, y: box.y + 260 },
  );
  d = await inspect(page);
  const rect = d.nodes.find((n: any) => n.type === "rectangle");
  expect(rect.parentId).toBe(frame.id);
  const rev = d.revision;
  await drag(
    page,
    { x: box.x + 210, y: box.y + 210 },
    { x: box.x + 260, y: box.y + 240 },
  );
  d = await inspect(page);
  expect(d.revision).toBe(rev + 1);
  expect(d.nodes.find((n: any) => n.id === rect.id).x).not.toBe(rect.x);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  d = await inspect(page);
  expect(d.nodes.find((n: any) => n.id === rect.id).x).toBe(rect.x);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByTestId("canvas").focus();
  await page.keyboard.press("ArrowRight");
  const moved = (await inspect(page)).nodes.find((n: any) => n.id === rect.id);
  expect(moved.x).toBeGreaterThan(rect.x);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByTestId("canvas").click({ position: { x: 200, y: 310 } });
  await page.getByLabel("Text content").fill("Made in your browser");
  await page.getByLabel("Text content").press("Tab");
  d = await inspect(page);
  expect(d.nodes.find((n: any) => n.type === "text").text).toBe(
    "Made in your browser",
  );
  await page.getByRole("button", { name: "Add page", exact: true }).click();
  expect((await inspect(page)).pages).toHaveLength(2);
  await page.getByRole("button", { name: "Page 1", exact: true }).click();
  await expect
    .poll(async () => (await tool(page, "workspace")).storage)
    .toBe("saved");
  await page.reload();
  await expect(page.getByTestId("canvas")).toBeVisible();
  await expect.poll(async () => (await inspect(page)).nodes.length).toBe(3);
  expect(
    (await inspect(page)).nodes.find((n: any) => n.type === "text").text,
  ).toBe("Made in your browser");
});
test("human resize/rotate, multiselect, grouping, ordering, hide/lock and clipboard share commands", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const d = await inspect(page),
    pid = d.pageId;
  await edits(page, [
    {
      op: "create",
      node: {
        id: "rect-a",
        type: "rectangle",
        name: "Shape A",
        pageId: pid,
        x: 40,
        y: 60,
        width: 120,
        height: 90,
      },
    },
    {
      op: "create",
      node: {
        id: "rect-b",
        type: "ellipse",
        name: "Shape B",
        pageId: pid,
        x: 240,
        y: 60,
        width: 120,
        height: 90,
      },
    },
  ]);
  await page
    .getByRole("button", { name: "Select Shape A", exact: true })
    .click();
  const handle = (await page.locator('[data-handle="se"]').boundingBox())!;
  const corner = {
    x: handle.x + handle.width / 2,
    y: handle.y + handle.height / 2,
  };
  await drag(page, corner, { x: corner.x + 40, y: corner.y + 30 });
  let current = await inspect(page);
  expect(current.nodes.find((n: any) => n.id === "rect-a").width).toBe(160);
  await page.getByLabel("Rotation", { exact: true }).fill("30");
  await page.getByLabel("Rotation", { exact: true }).press("Tab");
  expect((await inspect(page)).nodes[0].rotation).toBe(30);
  await page
    .getByRole("button", { name: "Select Shape B", exact: true })
    .click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Group", exact: true }).click();
  current = await inspect(page);
  expect(current.nodes.filter((n: any) => n.type === "group")).toHaveLength(1);
  await tool(page, "selection", {
    ids: current.nodes
      .filter((n: any) => n.type === "group")
      .map((n: any) => n.id),
  });
  await page.getByRole("button", { name: "Ungroup", exact: true }).click();
  expect((await inspect(page)).nodes).toHaveLength(2);
  await page.getByRole("button", { name: "Lock Shape A", exact: true }).click();
  const before = (await inspect(page)).revision;
  await tool(page, "selection", { ids: ["rect-a"] });
  const bad = await tool(page, "apply_edits", {
    expectedDocumentId: d.documentId,
    expectedRevision: before,
    requestId: "locked-move",
    commands: [{ op: "update", ids: ["rect-a"], patch: { x: 500 } }],
  });
  expect(bad.code).toBe("LOCKED_NODE");
  await page
    .getByRole("button", { name: "Unlock Shape A", exact: true })
    .click();
  await page.getByRole("button", { name: "Hide Shape A", exact: true }).click();
  expect(
    (await inspect(page)).nodes.find((n: any) => n.id === "rect-a").hidden,
  ).toBe(true);
  await page.getByRole("button", { name: "Show Shape A", exact: true }).click();
  await page
    .getByRole("button", { name: "Select Shape A", exact: true })
    .click();
  await page.getByTestId("canvas").focus();
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+v");
  await expect.poll(async () => (await inspect(page)).nodes.length).toBe(3);
});
test("PNG/JPEG/WebP and safe SVG imports, bad native/SVG recovery leave active work intact", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const before = await inspect(page);
  await page.getByLabel("Import design file").setInputFiles({
    name: "unsafe.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    ),
  });
  await expect(page.getByRole("status")).toContainText(
    "Unsupported SVG element",
  );
  expect((await inspect(page)).documentId).toBe(before.documentId);
  await page.getByLabel("Import design file").setInputFiles({
    name: "bad.localdesign",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("bad"),
  });
  await expect(page.getByRole("status")).toContainText("valid LocalDesign");
  expect((await inspect(page)).documentId).toBe(before.documentId);
  await page.getByLabel("Import design file").setInputFiles({
    name: "safe.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200"><rect x="10" y="20" width="100" height="50" fill="#112233"/><g font-family="MissingFont" font-size="24" font-weight="600"><text x="10" y="110">Hello</text></g></svg>',
    ),
  });
  await expect(page.getByRole("status")).toContainText("substituted");
  const imported = await inspect(page);
  expect(imported.documentId).not.toBe(before.documentId);
  expect(imported.nodes).toHaveLength(4);
  expect(imported.nodes.find((n: any) => n.type === "text").fontSize).toBe(24);
  expect(imported.nodes.find((n: any) => n.type === "text").fontWeight).toBe(
    "600",
  );
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPS0AAAAASUVORK5CYII=",
    "base64",
  );
  await page
    .getByLabel("Add image file")
    .setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: png });
  await expect.poll(async () => (await inspect(page)).assets.length).toBe(1);
  expect(
    (await inspect(page)).nodes.filter((n: any) => n.type === "image"),
  ).toHaveLength(1);
  for (const mime of ["image/jpeg", "image/webp"]) {
    const encoded = await page.evaluate((mime) => {
      const c = document.createElement("canvas");
      c.width = 2;
      c.height = 2;
      c.getContext("2d")!.fillRect(0, 0, 2, 2);
      return c.toDataURL(mime).split(",")[1];
    }, mime);
    await page.getByLabel("Add image file").setInputFiles({
      name: `pixel.${mime.split("/")[1]}`,
      mimeType: mime,
      buffer: Buffer.from(encoded, "base64"),
    });
  }
  await expect.poll(async () => (await inspect(page)).assets.length).toBe(3);
});
test("native export/reopen in fresh storage preserves embedded assets and editable scene; SVG/PNG dimensions", async ({
  page,
  context,
  browser,
}) => {
  await harness(page);
  await open(page);
  const d = await inspect(page);
  await edits(page, [
    {
      op: "create",
      node: {
        id: "board",
        type: "frame",
        name: "Portable card",
        pageId: d.pageId,
        x: 20,
        y: 30,
        width: 420,
        height: 260,
        fill: "#ffffff",
      },
    },
    {
      op: "create",
      node: {
        id: "text",
        type: "text",
        name: "Title",
        pageId: d.pageId,
        parentId: "board",
        x: 28,
        y: 24,
        width: 340,
        height: 80,
        text: "A portable idea",
        fontSize: 30,
        fontWeight: "600",
        fill: "#18181b",
      },
    },
  ]);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPS0AAAAASUVORK5CYII=",
    "base64",
  );
  await page
    .getByLabel("Add image file")
    .setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: png });
  await expect.poll(async () => (await inspect(page)).assets.length).toBe(1);
  await edits(page, [
    {
      op: "reparent",
      ids: [
        (await inspect(page)).nodes.find((n: any) => n.type === "image").id,
      ],
      parentId: "board",
    },
  ]);
  const native = await tool(page, "export_design", { format: "native" });
  expect(native.isError, native.message).not.toBe(true);
  let bytes = "";
  for (let offset = 0; offset < native.size; offset += 262144) {
    const part = await tool(page, "artifact", {
      id: native.id,
      action: "read",
      offset,
    });
    bytes += Buffer.from(part.base64, "base64").toString("latin1");
  }
  const fresh = await browser.newContext();
  const other = await fresh.newPage();
  await harness(other);
  await open(other);
  await other.getByLabel("Import design file").setInputFiles({
    name: "roundtrip.localdesign",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(bytes, "latin1"),
  });
  await expect.poll(async () => (await inspect(other)).nodes.length).toBe(3);
  let opened = await inspect(other);
  expect(opened.assets).toHaveLength(1);
  expect(opened.nodes.find((n: any) => n.id === "text").text).toBe(
    "A portable idea",
  );
  await edits(other, [
    { op: "update", ids: ["text"], patch: { text: "Edited after reopening" } },
  ]);
  expect(
    (await inspect(other)).nodes.find((n: any) => n.id === "text").text,
  ).toBe("Edited after reopening");
  for (const format of ["svg", "png"]) {
    const artifact = await tool(other, "export_design", {
      format,
      ids: ["board"],
    });
    expect(artifact.isError, artifact.message).not.toBe(true);
    const chunks: Buffer[] = [];
    for (let offset = 0; offset < artifact.size; offset += 262144) {
      const part = await tool(other, "artifact", {
        id: artifact.id,
        action: "read",
        offset,
      });
      chunks.push(Buffer.from(part.base64, "base64"));
    }
    const buffer = Buffer.concat(chunks);
    if (format === "svg") {
      expect(buffer.toString()).toContain('width="420"');
      expect(buffer.toString()).toContain("data:font/woff2;base64,");
      expect(buffer.toString().replace(/<[^>]*>/g, "")).toContain(
        "Edited after reopening",
      );
    } else {
      expect(buffer.readUInt32BE(16)).toBe(420);
      expect(buffer.readUInt32BE(20)).toBe(260);
    }
  }
  await fresh.close();
  void context;
});
test("normal editing without WebMCP, wide/narrow drawers, keyboard focus and current screenshots", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Connect an agent" }).click();
  await expect(
    page.getByText("WebMCP is unavailable in this browser", { exact: true }),
  ).toBeVisible();
  const agentDialog = page.getByRole("dialog", {
    name: "A canvas your agent can use",
  });
  await expect(agentDialog.getByText("localdesign_list_skills")).toBeVisible();
  await expect(agentDialog.getByLabel("Loopback endpoint")).toHaveCount(0);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    page.getByRole("button", { name: "Connect an agent" }),
  ).toBeFocused();
  if (evidence) {
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: join(evidence, "workspace-empty.png") });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Pages & layers", exact: true })
    .click();
  await expect(page.getByLabel("Search layers")).toBeVisible();
  await page.getByRole("button", { name: "Add page", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Page 2", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close layers" }).click();
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  await expect(page.getByLabel("Page name", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close properties" }).click();
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.getByTestId("canvas").click({ position: { x: 70, y: 130 } });
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  await expect(page.getByLabel("W", { exact: true })).toHaveValue("160");
  await page.getByRole("button", { name: "Close properties" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (evidence)
    await page.screenshot({ path: join(evidence, "workspace-mobile.png") });
});
test("storage failures retain the active design and expose backup/retry; recovered storage persists", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      if (this.name === "documents")
        throw new DOMException("Quota full", "QuotaExceededError");
      return original.apply(this, args);
    };
    (window as any).__restorePut = () => {
      IDBObjectStore.prototype.put = original;
    };
  });
  await edits(page, [{ op: "rename", name: "Unsaved important work" }]);
  await expect(page.getByRole("alert")).toContainText("Local save failed");
  const d = await inspect(page),
    result = await tool(page, "workspace", {
      action: "create",
      name: "Do not replace",
      guard: {
        expectedDocumentId: d.documentId,
        expectedRevision: d.revision,
        requestId: crypto.randomUUID(),
      },
    });
  expect(result.code).toBe("STORAGE_FAILED");
  expect((await inspect(page)).name).toBe("Unsaved important work");
  const backup = await tool(page, "export_design", { format: "native" });
  expect(backup.isError, backup.message).not.toBe(true);
  await page.evaluate(() => (window as any).__restorePut());
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect
    .poll(async () => (await tool(page, "workspace")).storage)
    .toBe("saved");
});

test("rendered typography/layout specimen has no overflow and provides current candidate visual evidence", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const d = await inspect(page),
    pageId = d.pageId;
  await edits(page, [
    { op: "rename", name: "Fieldnotes — a small idea" },
    {
      op: "create",
      node: {
        id: "specimen-frame",
        type: "frame",
        name: "Fieldnotes / Desktop",
        pageId,
        x: 40,
        y: 40,
        width: 640,
        height: 480,
        fill: "#f1f0e9",
        radius: 10,
      },
    },
    {
      op: "create",
      node: {
        id: "specimen-brand",
        type: "text",
        name: "Wordmark",
        pageId,
        parentId: "specimen-frame",
        x: 38,
        y: 30,
        width: 200,
        height: 36,
        text: "fieldnotes",
        fontSize: 21,
        fontWeight: "600",
        letterSpacing: -0.7,
        fill: "#263f31",
      },
    },
    {
      op: "create",
      node: {
        id: "specimen-badge",
        type: "rectangle",
        name: "Edition badge",
        pageId,
        parentId: "specimen-frame",
        x: 488,
        y: 32,
        width: 114,
        height: 29,
        radius: 15,
        fill: "#e0e5d9",
      },
    },
    {
      op: "create",
      node: {
        id: "specimen-badge-text",
        type: "text",
        name: "Edition label",
        pageId,
        parentId: "specimen-frame",
        x: 502,
        y: 39,
        width: 86,
        height: 18,
        text: "A FRESH START",
        fontSize: 9,
        fontWeight: "600",
        letterSpacing: 0.6,
        fill: "#435541",
      },
    },
    {
      op: "create",
      node: {
        id: "specimen-heading",
        type: "text",
        name: "A little more room",
        pageId,
        parentId: "specimen-frame",
        x: 38,
        y: 118,
        width: 540,
        height: 148,
        text: "A little more\nroom to think.",
        fontSize: 55,
        fontWeight: "600",
        lineHeight: 1.12,
        letterSpacing: -2,
        fill: "#263f31",
      },
    },
    {
      op: "create",
      node: {
        id: "specimen-body",
        type: "text",
        name: "Supporting copy",
        pageId,
        parentId: "specimen-frame",
        x: 40,
        y: 281,
        width: 420,
        height: 55,
        text: "Collect the small things. Make space for the next big idea.",
        fontSize: 16,
        lineHeight: 1.6,
        fill: "#64705e",
      },
    },
    {
      op: "create",
      node: {
        id: "specimen-button",
        type: "rectangle",
        name: "Primary action",
        pageId,
        parentId: "specimen-frame",
        x: 40,
        y: 377,
        width: 171,
        height: 48,
        radius: 7,
        fill: "#2e4b38",
      },
    },
    {
      op: "create",
      node: {
        id: "specimen-button-label",
        type: "text",
        name: "Start a new page",
        pageId,
        parentId: "specimen-frame",
        x: 59,
        y: 391,
        width: 136,
        height: 22,
        text: "Start a new page   ↗",
        fontSize: 12,
        fontWeight: "600",
        fill: "#f1f0e9",
      },
    },
    {
      op: "create",
      node: {
        id: "specimen-circle",
        type: "ellipse",
        name: "Quiet green",
        pageId,
        parentId: "specimen-frame",
        x: 481,
        y: 350,
        width: 112,
        height: 112,
        fill: "#dce2cf",
      },
    },
    {
      op: "create",
      node: {
        id: "specimen-line",
        type: "line",
        name: "Stem",
        pageId,
        parentId: "specimen-frame",
        x: 531,
        y: 372,
        width: 1,
        height: 70,
        fill: "none",
        stroke: "#819776",
        strokeWidth: 2,
      },
    },
  ]);
  await tool(page, "selection", { ids: ["specimen-heading"] });
  await page.getByRole("button", { name: "Fit canvas", exact: true }).click();
  const state = await inspect(page);
  expect(state.textMetrics.filter((m: any) => m.overflow)).toHaveLength(0);
  const png = await tool(page, "export_design", {
    format: "png",
    ids: ["specimen-frame"],
  });
  expect(png.isError, png.message).not.toBe(true);
  const part = await tool(page, "artifact", { id: png.id, action: "read" }),
    bytes = Buffer.from(part.base64, "base64");
  expect(bytes.readUInt32BE(16)).toBe(640);
  expect(bytes.readUInt32BE(20)).toBe(480);
  if (evidence) {
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: join(evidence, "workspace-design.png") });
  }
});

test("two tabs reject conflicting saves and recover the unsaved work as a separate copy", async ({
  page,
  context,
}) => {
  await harness(page);
  await open(page);
  const original = await inspect(page);
  const other = await context.newPage();
  await harness(other);
  await open(other, original.documentId);
  expect((await inspect(other)).documentId).toBe(original.documentId);
  await edits(page, [{ op: "rename", name: "Saved from first tab" }]);
  await expect
    .poll(async () => (await tool(page, "workspace")).storage)
    .toBe("saved");
  await edits(other, [{ op: "rename", name: "Unsaved second tab idea" }]);
  await expect(other.getByRole("alert")).toContainText(
    "Another tab changed this design",
  );
  expect((await inspect(other)).name).toBe("Unsaved second tab idea");
  await other.getByRole("button", { name: "Save a copy", exact: true }).click();
  await expect(other.getByRole("alert")).toHaveCount(0);
  const copy = await inspect(other);
  expect(copy.documentId).not.toBe(original.documentId);
  expect(copy.name).toBe("Unsaved second tab idea copy");
  const docs = (await tool(other, "workspace", { action: "list" })).documents;
  expect(docs.find((d: any) => d.id === original.documentId).name).toBe(
    "Saved from first tab",
  );
  expect(docs.find((d: any) => d.id === copy.documentId).name).toBe(copy.name);
});

test("Escape cancels an unfinished drawing gesture without a mutation", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  const box = (await page.getByTestId("canvas").boundingBox())!;
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 240, box.y + 200, { steps: 4 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  const d = await inspect(page);
  expect(d.nodes).toHaveLength(0);
  expect(d.revision).toBe(0);
});

test("manual auto-layout inspector controls position children and share undo/redo with tools", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const d = await inspect(page);
  await edits(page, [
    {
      op: "create",
      node: {
        id: "manual-layout-frame",
        type: "frame",
        name: "Manual layout frame",
        pageId: d.pageId,
        width: 500,
        height: 300,
        fill: "#ffffff",
      },
    },
    {
      op: "create",
      node: {
        id: "manual-layout-a",
        type: "rectangle",
        name: "First child",
        pageId: d.pageId,
        parentId: "manual-layout-frame",
        x: 11,
        y: 12,
        width: 40,
        height: 60,
        fill: "#ff0000",
      },
    },
    {
      op: "create",
      node: {
        id: "manual-layout-b",
        type: "rectangle",
        name: "Second child",
        pageId: d.pageId,
        parentId: "manual-layout-frame",
        x: 150,
        y: 100,
        width: 80,
        height: 40,
        fill: "#0000ff",
      },
    },
  ]);
  await page
    .getByRole("button", { name: "Select Manual layout frame", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Direction", exact: true })
    .selectOption("horizontal");
  await page.getByLabel("Gap", { exact: true }).fill("20");
  await page.getByLabel("Gap", { exact: true }).press("Tab");
  await page.getByLabel("Padding", { exact: true }).fill("30");
  await page.getByLabel("Padding", { exact: true }).press("Tab");
  await page
    .getByRole("combobox", { name: "Alignment", exact: true })
    .selectOption("center");
  let state = await inspect(page);
  expect(
    state.nodes.find((n: any) => n.id === "manual-layout-a"),
  ).toMatchObject({ x: 30, y: 120 });
  expect(
    state.nodes.find((n: any) => n.id === "manual-layout-b"),
  ).toMatchObject({ x: 90, y: 130 });
  const before = state.revision;
  await page
    .getByRole("combobox", { name: "Direction", exact: true })
    .selectOption("vertical");
  state = await inspect(page);
  expect(state.revision).toBe(before + 1);
  expect(
    state.nodes.find((n: any) => n.id === "manual-layout-a"),
  ).toMatchObject({ x: 230, y: 30 });
  expect(
    state.nodes.find((n: any) => n.id === "manual-layout-b"),
  ).toMatchObject({ x: 210, y: 110 });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  state = await inspect(page);
  expect(
    state.nodes.find((n: any) => n.id === "manual-layout-a"),
  ).toMatchObject({ x: 30, y: 120 });
  expect(
    state.nodes.find((n: any) => n.id === "manual-layout-b"),
  ).toMatchObject({ x: 90, y: 130 });
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  state = await inspect(page);
  expect(
    state.nodes.find((n: any) => n.id === "manual-layout-b"),
  ).toMatchObject({ x: 210, y: 110 });
  await page
    .getByRole("checkbox", { name: "Clip content", exact: true })
    .uncheck();
  expect(
    (await inspect(page)).nodes.find((n: any) => n.id === "manual-layout-frame")
      .clip,
  ).toBe(false);
});
