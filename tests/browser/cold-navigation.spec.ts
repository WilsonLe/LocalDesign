import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import {
  blankDocument,
  makeNode,
  type DesignDocument,
} from "../../src/core/model";
import { harness, open, tool } from "./helpers";

test("first visits to dense text regions and pages stay responsive", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await harness(page);
  await open(page);
  const doc: DesignDocument = process.env.LOCALDESIGN_PRIVATE_FIXTURE
    ? JSON.parse(readFileSync(process.env.LOCALDESIGN_PRIVATE_FIXTURE, "utf8"))
    : blankDocument("Cold dense navigation");
  if (!process.env.LOCALDESIGN_PRIVATE_FIXTURE) {
    for (let p = 0; p < 4; p++) {
      if (p)
        doc.pages.push({
          id: `page-${p}`,
          name: `Page ${p}`,
          background: "#202020",
        });
      for (let i = 0; i < [106, 28, 44, 28][p]; i++) {
        const frame = makeNode("frame", doc.pages[p].id, {
          id: `screen-${p}-${i}`,
          x: (i % 4) * 1600,
          y: Math.floor(i / 4) * 2500,
          width: 1440,
          height: 2300,
        });
        doc.nodes.push(frame);
        for (let j = 0; j < 60; j++)
          doc.nodes.push(
            makeNode("text", frame.pageId, {
              id: `text-${p}-${i}-${j}`,
              parentId: frame.id,
              x: 20,
              y: 20 + j * 36,
              width: 1000,
              height: 40,
              fontWeight: j % 9 === 0 ? "700" : j % 8 === 0 ? "600" : "400",
              fontSize: 14 + ((i * 60 + j) % 3115) / 2000,
              text:
                j % 10 === 0
                  ? `Page ${p}, screen ${i}, paragraph ${j}: Portable design text and editable content.`
                  : j % 4
                    ? [
                        "Dashboard",
                        "Students",
                        "Lớp học",
                        "Create account",
                        "Learning activity",
                        "Profile",
                        "Settings",
                        "Continue",
                      ][j % 8]
                    : `Page ${p} screen ${i}: Item ${j}`,
            }),
          );
        for (let j = 0; j < 30; j++)
          doc.nodes.push(
            makeNode("rectangle", frame.pageId, {
              id: `shape-${p}-${i}-${j}`,
              parentId: frame.id,
              x: 1100,
              y: 20 + j * 72,
              width: 300,
              height: 20,
              fill: "#777777",
            }),
          );
      }
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
  await page.reload();
  await expect(page.locator(".save-state")).toContainText("Saved locally");
  const session = await page.context().newCDPSession(page);
  if (process.env.LOCALDESIGN_PROFILE) {
    await session.send("Profiler.enable");
    await session.send("Profiler.start");
  }
  const metrics = await page.evaluate(
    async (pageIds) => {
      const registry = (window as any).__testSiteTools;
      const measure = async (input: any) => {
        const start = performance.now();
        await registry.get("localdesign_viewport").execute(input);
        await new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r())),
        );
        return performance.now() - start;
      };
      const visits = [];
      for (const [i, id] of pageIds.entries()) {
        const start = performance.now();
        await registry
          .get("localdesign_selection")
          .execute({ pageId: id, ids: [] });
        const elapsed = await measure({ x: 100, y: 100, zoom: 0.05 });
        visits.push({
          kind: "page-and-zoom",
          page: i,
          ms: performance.now() - start,
          zoomMs: elapsed,
        });
        if (i === 0)
          for (const y of [-1500, -2800])
            visits.push({
              kind: "unseen-area",
              page: i,
              ms: await measure({ x: 100, y, zoom: 0.05 }),
            });
      }
      return visits;
    },
    doc.pages.map((p) => p.id),
  );
  if (process.env.LOCALDESIGN_PROFILE) {
    const { profile } = await session.send("Profiler.stop");
    writeFileSync(
      testInfo.outputPath("cold.cpuprofile"),
      JSON.stringify(profile),
    );
  }
  await testInfo.attach("cold-timings", {
    body: JSON.stringify(metrics),
    contentType: "application/json",
  });
  console.log("COLD_NAVIGATION", JSON.stringify(metrics));
  const after = await tool(page, "inspect_document", { limit: 1 });
  expect(after.revision).toBe(doc.revision);
  expect(after.total).toBe(doc.nodes.length);
  if (!process.env.LOCALDESIGN_BASELINE)
    // Shared Linux CI measured about twice the local workstation's latency.
    // Keep its regression ceiling separate from the local acceptance target.
    expect(Math.max(...metrics.map((m) => m.ms))).toBeLessThan(
      process.env.CI ? 500 : 250,
    );
});

test("cold inspection of supported long narrow text avoids repeated suffix shaping", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const before = await tool(page, "inspect_document");
  await tool(page, "apply_edits", {
    expectedDocumentId: before.documentId,
    expectedRevision: before.revision,
    requestId: "narrow-long-text",
    commands: [
      {
        op: "create",
        node: {
          id: "narrow",
          name: "Narrow text",
          type: "text",
          pageId: before.pageId,
          hidden: true,
          width: 1,
          height: 1,
          fontSize: 17.3,
          text: "ab".repeat(10000),
        },
      },
    ],
  });
  await expect(page.locator(".save-state")).toContainText("Saved locally");
  // Hidden text keeps this test focused on the cold metrics requested by the
  // inspector/tool consumer, without mounting 20,000 overflow lines in SVG.
  const result = await page.evaluate(async () => {
    const start = performance.now();
    const document = await (window as any).__testSiteTools
      .get("localdesign_inspect_document")
      .execute({ rootId: "narrow", limit: 1 });
    return { ms: performance.now() - start, document };
  });
  console.log("COLD_NARROW_TEXT_MS", result.ms);
  expect(result.ms).toBeLessThan(1500);
  expect(result.document.textMetrics[0].lines).toEqual(
    Array.from({ length: 20000 }, (_, i) => (i % 2 ? "b" : "a")),
  );
  expect(result.document.textMetrics[0].overflow).toBe(true);
  expect(result.document.revision).toBe(before.revision + 1);
});
