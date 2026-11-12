import { test, expect } from "@playwright/test";
import {
  blankDocument,
  makeNode,
  type DesignDocument,
} from "../../src/core/model";
import { harness, open, inspect, tool } from "./helpers";
import { readFileSync } from "node:fs";

test("text-heavy multi-screen board renders only the visible area and preserves offscreen work", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await harness(page);
  await open(page);
  const doc: DesignDocument = process.env.LOCALDESIGN_PRIVATE_FIXTURE
    ? JSON.parse(readFileSync(process.env.LOCALDESIGN_PRIVATE_FIXTURE, "utf8"))
    : blankDocument("Text-heavy multi-screen performance fixture");
  if (!process.env.LOCALDESIGN_PRIVATE_FIXTURE) {
    for (let i = 0; i < 100; i++) {
      const frame = makeNode("frame", doc.pages[0].id, {
        id: `screen-${i}`,
        name: `Screen ${i}`,
        x: (i % 10) * 1600,
        y: Math.floor(i / 10) * 4000,
        width: 1440,
        height: 3600,
      });
      doc.nodes.push(frame);
      for (let j = 0; j < 100; j++)
        doc.nodes.push(
          makeNode(j % 2 ? "text" : "rectangle", frame.pageId, {
            id: `content-${i}-${j}`,
            name: `Content ${i}-${j}`,
            parentId: frame.id,
            x: 20,
            y: 20 + j * 32,
            width: 1000,
            height: 30,
            fontSize: 18,
            text: `Screen ${i} paragraph ${j}: Editable portable typography and design content.`,
          }),
        );
    }
  }
  await page.evaluate(async (doc) => {
    const r = indexedDB.open("localdesign-v1", 1);
    const db = await new Promise<IDBDatabase>((resolve) => {
      r.onsuccess = () => resolve(r.result);
    });
    const tx = db.transaction(["documents", "settings"], "readwrite");
    tx.objectStore("documents").put(doc);
    tx.objectStore("settings").put(doc.id, "active");
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
    db.close();
  }, doc);
  const start = Date.now();
  await page.reload();
  await expect(page.locator(".save-state")).toContainText("Saved locally");
  await expect(page.getByTestId("canvas")).toBeVisible();
  const metrics: Record<string, unknown> = { openMs: Date.now() - start };
  const before = await inspect(page);
  metrics.elements = await page.locator("*").count();
  metrics.sceneNodes = await page.locator("[data-node-id]").count();
  metrics.glyphs = await page.locator("use").count();
  const pan = await page.evaluate(async () => {
    const registry = (window as any).__testSiteTools;
    const timings = [];
    for (let i = 0; i < 12; i++) {
      const start = performance.now();
      await registry
        .get("localdesign_viewport")
        .execute({ x: 100, y: 100 - i * 24, zoom: 1 });
      await new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      );
      timings.push(performance.now() - start);
    }
    return timings;
  });
  metrics.panMs = pan;
  console.log("VIEWPORT_PERFORMANCE", JSON.stringify(metrics));
  await testInfo.attach("viewport-performance", {
    body: JSON.stringify(metrics),
    contentType: "application/json",
  });
  if (process.env.LOCALDESIGN_BASELINE) return;
  expect(Number(metrics.sceneNodes)).toBeLessThan(500);
  expect(Number(metrics.elements)).toBeLessThan(15000);
  expect(Math.max(...pan)).toBeLessThan(250);
  expect((await inspect(page)).revision).toBe(before.revision);
  {
    for (const zoom of process.env.LOCALDESIGN_PRIVATE_FIXTURE
      ? [0.2, 0.05]
      : [0.2]) {
      const times = await page.evaluate(async (zoom) => {
        const registry = (window as any).__testSiteTools;
        const times = [];
        for (let i = 0; i < 8; i++) {
          const start = performance.now();
          await registry
            .get("localdesign_viewport")
            .execute({ x: 100, y: 100 - i * 10, zoom });
          await new Promise<void>((r) =>
            requestAnimationFrame(() => requestAnimationFrame(() => r())),
          );
          times.push(performance.now() - start);
        }
        return times;
      }, zoom);
      console.log("ZOOM_PERFORMANCE", JSON.stringify({ zoom, times }));
      expect(Math.max(...times.slice(2))).toBeLessThan(250);
    }
    if (process.env.LOCALDESIGN_PRIVATE_FIXTURE) return;
  }
  await page
    .getByRole("textbox", { name: "Search layers" })
    .fill("Content 99-99");
  await page
    .getByRole("button", { name: "Select Content 99-99", exact: true })
    .click();
  await expect(page.locator('[data-node-id="content-99-99"]')).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Content 99-99",
  );
  await page
    .getByLabel("Name", { exact: true })
    .fill("Offscreen content edited");
  await page.getByLabel("Name", { exact: true }).press("Enter");
  await expect(page.locator(".save-state")).toContainText("Saved locally");
  await page.reload();
  await expect(page.locator(".save-state")).toContainText("Saved locally");
  const state = await tool(page, "inspect_document", {
    rootId: "content-99-99",
  });
  expect(state.nodes[0].name).toBe("Offscreen content edited");
  const artifact = await tool(page, "export_design", {
    format: "svg",
    ids: ["screen-99"],
  });
  expect(artifact.isError, artifact.message).not.toBe(true);
  let svg = "";
  for (let offset = 0; offset < artifact.size; offset += 524288) {
    const read = await tool(page, "artifact", {
      id: artifact.id,
      action: "read",
      offset,
      length: 524288,
    });
    svg += Buffer.from(read.base64, "base64").toString();
  }
  expect(svg.includes("Screen 99 paragraph 99")).toBe(true);
});

test("viewport filtering retains overflow ink, nested rotations, arbitrary paths and resize navigation", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const { pageId } = await inspect(page);
  const result = await tool(page, "apply_edits", {
    expectedDocumentId: (await inspect(page)).documentId,
    expectedRevision: 0,
    requestId: "culling-geometry",
    commands: [
      {
        op: "create",
        node: {
          id: "overflow-text",
          name: "Overflow text",
          type: "text",
          pageId,
          x: 0,
          y: -500,
          width: 5,
          height: 1,
          fontSize: 100,
          text: "IIIIII",
          fill: "#fff",
        },
      },
      {
        op: "create",
        node: {
          id: "outside-group",
          name: "Outside group",
          type: "group",
          pageId,
          x: 2000,
          y: 0,
          width: 10,
          height: 10,
          rotation: 90,
        },
      },
      {
        op: "create",
        node: {
          id: "rotated-child",
          name: "Rotated child",
          type: "rectangle",
          pageId,
          parentId: "outside-group",
          x: 200,
          y: 1900,
          width: 50,
          height: 50,
          fill: "#fff",
        },
      },
      {
        op: "create",
        node: {
          id: "outside-path",
          name: "Outside path",
          type: "path",
          pageId,
          x: 5000,
          y: 0,
          width: 1,
          height: 1,
          path: "M-4900 100L-4800 200",
          stroke: "#fff",
        },
      },
      {
        op: "create",
        node: {
          id: "resize-target",
          name: "Resize target",
          type: "rectangle",
          pageId,
          x: 1500,
          y: 20,
          width: 30,
          height: 30,
        },
      },
    ],
  });
  expect(result.isError).not.toBe(true);
  await expect(
    page.locator('[data-node-id="overflow-text"] use').last(),
  ).toBeVisible();
  await expect(page.locator('[data-node-id="rotated-child"]')).toBeVisible();
  await expect(
    page.locator('[data-node-id="outside-path"] path'),
  ).toBeAttached();
  await expect(page.locator('[data-node-id="resize-target"]')).toHaveCount(0);
  await page.setViewportSize({ width: 2200, height: 1000 });
  await expect(page.locator('[data-node-id="resize-target"]')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  expect((await inspect(page)).revision).toBe(1);
});

test("compact canvas text preserves outlined glyph pixels, overlaps, alpha and stroke", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const d = await inspect(page);
  await tool(page, "apply_edits", {
    expectedDocumentId: d.documentId,
    expectedRevision: d.revision,
    requestId: "compact-pixels",
    commands: [
      {
        op: "create",
        node: {
          id: "sample-root",
          type: "group",
          name: "Samples",
          pageId: d.pageId,
          width: 1000,
          height: 1000,
          rotation: 8,
          opacity: 0.8,
        },
      },
      ...[
        "Portable typography AV fi ffi",
        "Tiếng Việt á ễ — café",
        "Overlapping outlines",
        "Italic overhang fj AV",
        "Transparent paint",
        "Outlined text",
      ].map((text, i) => ({
        op: "create",
        node: {
          id: `sample-${i}`,
          type: "text",
          name: `Sample ${i}`,
          pageId: d.pageId,
          parentId: "sample-root",
          x: 20,
          y: i * 120,
          width: 900,
          height: 100,
          fontSize: 56,
          text,
          fill: i === 4 ? "#ffffff80" : "#fff",
          fontFamily: i === 3 ? "Source Serif 4" : "Inter",
          fontStyle: i === 3 ? "italic" : "normal",
          letterSpacing: i === 2 ? -15 : 0,
          stroke: i === 5 ? "#f00" : "none",
          strokeWidth: 4,
        },
      })),
    ],
  });
  await expect(
    page.locator('[data-node-id="sample-0"] use').last(),
  ).toBeAttached();
  const capture = () =>
    page.evaluate(() => ({
      node: document.querySelector('[data-node-id="sample-root"]')!.outerHTML,
      defs: [...document.querySelectorAll(".canvas defs")]
        .map((n) => n.outerHTML)
        .join(""),
    }));
  const detailed = await capture();
  await tool(page, "viewport", { x: 100, y: 100, zoom: 0.2 });
  await expect(
    page.locator('[data-node-id="sample-0"] [data-compact-text]').first(),
  ).toBeAttached();
  expect(
    await page.locator('[data-node-id="sample-0"] [data-compact-text]').count(),
  ).toBeLessThan(5);
  expect(
    await page.locator('[data-node-id="sample-5"] use').count(),
  ).toBeGreaterThan(5);
  const compact = await capture();
  const pixels = await page.evaluate(
    async ({ detailed, compact }) => {
      const decode = async (part: { node: string; defs: string }) => {
        const image = new Image();
        image.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="260" height="200"><g transform="translate(30 10) scale(.2)">${part.defs}${part.node}</g></svg>`)))}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = 260;
        canvas.height = 200;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, 260, 200).data;
      };
      const a = await decode(detailed),
        b = await decode(compact);
      let error = 0,
        ink = 0,
        alphaA = 0,
        alphaB = 0;
      for (let i = 0; i < a.length; i++) {
        error += Math.abs(a[i] - b[i]);
        if (i % 4 === 3) {
          alphaA += a[i];
          alphaB += b[i];
          if (b[i] > 20) ink++;
        }
      }
      return {
        error: error / a.length,
        ink,
        coverageDelta: Math.abs(alphaA - alphaB) / alphaA,
      };
    },
    { detailed, compact },
  );
  expect(pixels.ink).toBeGreaterThan(500);
  // The browser antialiases baked path coordinates slightly differently from <use> transforms.
  expect(pixels.error).toBeLessThan(1);
  expect(pixels.coverageDelta).toBeLessThan(0.01);
});
