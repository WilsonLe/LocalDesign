import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { edits, harness, inspect, open, tool } from "./helpers";

const pixel =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPS0AAAAASUVORK5CYII=";
async function artifactBytes(page: Page, id: string, size: number) {
  const chunks = [];
  for (let offset = 0; offset < size; offset += 262144)
    chunks.push(
      Buffer.from(
        (await tool(page, "artifact", { id, action: "read", offset })).base64,
        "base64",
      ),
    );
  return Buffer.concat(chunks);
}
async function decodedPixel(page: Page, artifact: { url: string }) {
  return page.evaluate(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    return {
      width: image.width,
      height: image.height,
      rgba: [
        ...context.getImageData(
          Math.floor(image.width / 2),
          Math.floor(image.height / 2),
          1,
          1,
        ).data,
      ],
    };
  }, artifact.url);
}
test.beforeEach(async ({ page }) => {
  await harness(page);
  await open(page);
});

test("PNG/JPEG scale and composition crop preserve actual painted pixels, while preview does not edit view/history", async ({
  page,
}) => {
  const d = await inspect(page);
  await edits(page, [
    {
      op: "create",
      node: {
        id: "back",
        type: "rectangle",
        name: "Background",
        pageId: d.pageId,
        x: 0,
        y: 0,
        width: 200,
        height: 200,
        fill: "#ff0000",
      },
    },
    {
      op: "create",
      node: {
        id: "front",
        type: "rectangle",
        name: "Foreground",
        pageId: d.pageId,
        x: 40,
        y: 40,
        width: 60,
        height: 60,
        fill: "#0000ff",
        opacity: 0.5,
      },
    },
    {
      op: "create",
      node: {
        id: "huge",
        type: "frame",
        name: "Huge",
        pageId: d.pageId,
        x: 1000,
        y: 1000,
        width: 10000,
        height: 5000,
      },
    },
  ]);
  const before = await inspect(page);
  const isolated = await tool(page, "export_design", {
    format: "png",
    ids: ["front"],
    scale: 2,
  });
  const single = await decodedPixel(page, isolated);
  expect(single).toMatchObject({ width: 120, height: 120 });
  expect(single.rgba[2]).toBe(255);
  expect(single.rgba[3]).toBe(128);
  const composed = await tool(page, "export_design", {
    format: "png",
    ids: ["front"],
    mode: "composition",
  });
  const composite = await decodedPixel(page, composed);
  expect(composite.rgba[0]).toBeCloseTo(127, 0);
  expect(composite.rgba[2]).toBeCloseTo(128, 0);
  expect(composite.rgba[3]).toBe(255);
  const jpeg = await tool(page, "export_design", {
    format: "jpeg",
    ids: ["front"],
    scale: 0.5,
  });
  expect(jpeg.mime).toBe("image/jpeg");
  const jpg = await decodedPixel(page, jpeg);
  expect(jpg.width).toBe(30);
  expect(jpg.height).toBe(30);
  expect(jpg.rgba[0]).toBeGreaterThan(120);
  expect(jpg.rgba[2]).toBeGreaterThan(250);
  expect(jpg.rgba[3]).toBe(255);
  const preview = await tool(page, "preview", {
    ids: ["front"],
    mode: "composition",
    maxDimension: 64,
  });
  expect(preview.content[0]).toMatchObject({
    type: "image",
    mimeType: "image/png",
  });
  expect(Buffer.from(preview.content[0].data, "base64")).toEqual(
    await artifactBytes(page, preview.artifact.id, preview.artifact.size),
  );
  expect((await decodedPixel(page, preview.artifact)).rgba).toEqual(
    composite.rgba,
  );
  const after = await inspect(page);
  expect(after.revision).toBe(before.revision);
  expect(after.viewport).toEqual(before.viewport);
  expect(after.selection).toEqual(before.selection);
  const oversized = await tool(page, "export_design", {
    format: "png",
    ids: ["huge"],
  });
  expect(oversized.code).toBe("EXPORT_LIMIT");
});

test("vector PDF keeps frame page order and dimensions, glyphs and local image content", async ({
  page,
}, info) => {
  const d = await inspect(page);
  await edits(page, [
    {
      op: "page_create",
      page: { id: "other-page", name: "Second page", background: "#ffffff" },
    },
    {
      op: "create",
      node: {
        id: "wide-frame",
        type: "frame",
        pageId: d.pageId,
        name: "Wide",
        x: 100,
        y: 100,
        width: 240,
        height: 120,
        fill: "#cc3333",
      },
    },
    {
      op: "create",
      node: {
        id: "pdf-text",
        type: "text",
        pageId: d.pageId,
        parentId: "wide-frame",
        name: "Heading",
        text: "Tiếng Việt",
        fontFamily: "Source Serif 4",
        fontStyle: "italic",
        fontSize: 25,
        x: 15,
        y: 20,
        width: 200,
        height: 60,
        fill: "#ffffff",
      },
    },
    {
      op: "asset_add",
      asset: {
        id: "pdf-pixel",
        name: "Pixel",
        mime: "image/png",
        data: `data:image/png;base64,${pixel}`,
        width: 1,
        height: 1,
      },
    },
    {
      op: "create",
      node: {
        id: "pdf-alpha",
        type: "ellipse",
        pageId: d.pageId,
        parentId: "wide-frame",
        name: "Alpha paint",
        x: 180,
        y: 20,
        width: 35,
        height: 40,
        fill: "#0000ff80",
      },
    },
    {
      op: "create",
      node: {
        id: "pdf-group",
        type: "group",
        pageId: d.pageId,
        parentId: "wide-frame",
        name: "Composited group",
        x: 20,
        y: 80,
        width: 40,
        height: 30,
        opacity: 1,
      },
    },
    ...[0, 1].map((i) => ({
      op: "create" as const,
      node: {
        id: `pdf-overlap-${i}`,
        type: "rectangle" as const,
        pageId: d.pageId,
        parentId: "pdf-group",
        name: `Overlap ${i}`,
        x: i * 10,
        y: 0,
        width: 30,
        height: 25,
        fill: i ? "#0000ff" : "#ffffff",
      },
    })),
    {
      op: "create",
      node: {
        id: "pdf-image",
        type: "image",
        pageId: d.pageId,
        parentId: "wide-frame",
        name: "Image",
        x: 210,
        y: 90,
        width: 20,
        height: 10,
        assetId: "pdf-pixel",
      },
    },
    {
      op: "create",
      node: {
        id: "tall-frame",
        type: "frame",
        pageId: "other-page",
        name: "Tall",
        width: 100,
        height: 200,
        fill: "#33aa66",
      },
    },
  ]);
  const before = await inspect(page);
  const pdf = await tool(page, "export_design", {
    format: "pdf",
    frameIds: ["tall-frame", "wide-frame"],
  });
  expect(pdf.isError, pdf.message).not.toBe(true);
  expect(pdf.mime).toBe("application/pdf");
  expect(pdf.warnings).toEqual([]);
  const bytes = await artifactBytes(page, pdf.id, pdf.size),
    text = bytes.toString("latin1");
  expect(text.startsWith("%PDF-")).toBe(true);
  expect(text.match(/\/Type\s*\/Page\b/g)).toHaveLength(2);
  const boxes = [...text.matchAll(/\/MediaBox\s*\[([^\]]+)\]/g)].map((match) =>
    match[1].trim().split(/\s+/).map(Number),
  );
  expect(boxes).toHaveLength(2);
  expect(boxes[0][2]).toBeCloseTo(75);
  expect(boxes[0][3]).toBeCloseTo(150);
  expect(boxes[1][2]).toBeCloseTo(180);
  expect(boxes[1][3]).toBeCloseTo(90);
  expect(text.includes("/Subtype /Image")).toBe(true);
  await info.attach("vector-pdf", {
    body: bytes,
    contentType: "application/pdf",
  });
  const pdfPath = info.outputPath("frames.pdf");
  await writeFile(pdfPath, bytes);
  // Render the actual PDF with an independent consumer when Poppler is installed.
  // CI still checks the portable PDF's ordered geometry and embedded content.
  let poppler = false;
  try {
    execFileSync("pdftoppm", ["-v"], { stdio: "ignore" });
    poppler = true;
  } catch {
    /* Optional local output-fidelity evidence. */
  }
  if (poppler) {
    const prefix = info.outputPath("rendered");
    execFileSync("pdftoppm", ["-png", "-r", "96", pdfPath, prefix]);
    const png = await tool(page, "export_design", {
      format: "png",
      ids: ["wide-frame"],
    });
    const reference = await artifactBytes(page, png.id, png.size);
    await writeFile(info.outputPath("wide-frame.png"), reference);
    const rendered = await readFile(`${prefix}-2.png`);
    const fidelity = await page.evaluate(
      async ({ actual, expected }) => {
        const decode = async (data: string) => {
          const image = new Image();
          image.src = `data:image/png;base64,${data}`;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(image, 0, 0);
          return {
            width: image.width,
            height: image.height,
            pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
          };
        };
        const a = await decode(actual),
          b = await decode(expected);
        let delta = 0,
          foreground = 0;
        for (let i = 0; i < a.pixels.length; i += 4) {
          for (let channel = 0; channel < 3; channel++)
            delta += Math.abs(a.pixels[i + channel] - b.pixels[i + channel]);
          if (a.pixels[i] > 240 && a.pixels[i + 1] > 240) foreground++;
        }
        const samples = (pixels: Uint8ClampedArray) =>
          [
            [197, 40],
            [45, 97],
            [215, 105],
          ].map(([x, y]) => [
            ...pixels.slice((y * a.width + x) * 4, (y * a.width + x) * 4 + 4),
          ]);
        return {
          width: a.width,
          height: a.height,
          meanDelta: delta / (a.width * a.height * 3),
          foreground,
          actualSamples: samples(a.pixels),
          expectedSamples: samples(b.pixels),
        };
      },
      {
        actual: rendered.toString("base64"),
        expected: reference.toString("base64"),
      },
    );
    console.log("PDF_SCENE_FIDELITY", fidelity);
    expect(fidelity).toMatchObject({ width: 240, height: 120 });
    expect(fidelity.foreground).toBeGreaterThan(250);
    expect(fidelity.meanDelta).toBeLessThan(1);
    for (let i = 0; i < fidelity.actualSamples.length; i++)
      for (let channel = 0; channel < 4; channel++)
        expect(fidelity.actualSamples[i][channel]).toBeCloseTo(
          fidelity.expectedSamples[i][channel],
          -0.5,
        );
  }
  expect((await inspect(page)).revision).toBe(before.revision);
  await edits(page, [
    { op: "update", ids: ["pdf-group"], patch: { opacity: 0.5 } },
  ]);
  const composited = await tool(page, "export_design", {
    format: "pdf",
    ids: ["pdf-group"],
  });
  expect(composited.warnings).toEqual([
    expect.stringContaining("preserve group transparency"),
  ]);
  const compositedPath = info.outputPath("composited.pdf");
  await writeFile(
    compositedPath,
    await artifactBytes(page, composited.id, composited.size),
  );
  if (poppler) {
    const prefix = info.outputPath("composited");
    execFileSync("pdftoppm", ["-png", "-r", "96", compositedPath, prefix]);
    const rendered = await readFile(`${prefix}-1.png`);
    const actual = await decodedPixel(page, {
      url: `data:image/png;base64,${rendered.toString("base64")}`,
    });
    expect(actual).toMatchObject({ width: 40, height: 25 });
    for (let i = 0; i < 4; i++)
      expect(actual.rgba[i]).toBeCloseTo([127, 127, 255, 255][i], -0.5);
  }
  const wrong = await tool(page, "export_design", {
    format: "png",
    frameIds: ["wide-frame"],
  });
  expect(wrong.code).toBe("INVALID_EXPORT");
});

test("raster asset ingress is one history entry with stable identical retries and atomic stale/failure recovery", async ({
  page,
}) => {
  const d = await inspect(page),
    request = {
      expectedDocumentId: d.documentId,
      expectedRevision: d.revision,
      requestId: "asset-retry",
      name: "pixel.png",
      base64: pixel,
      place: { pageId: d.pageId, x: 20, y: 30, width: 40, height: 40 },
    };
  const added = await tool(page, "import_asset", request);
  expect(added.isError, added.message).not.toBe(true);
  expect((await inspect(page)).nodes[0]).toMatchObject({
    id: added.nodeId,
    assetId: added.asset.id,
    x: 20,
    y: 30,
  });
  await edits(page, [{ op: "rename", name: "Later human edit" }]);
  await edits(page, [
    {
      op: "page_create",
      page: { id: "other", name: "Other", background: "#ffffff" },
    },
  ]);
  await tool(page, "selection", { pageId: "other", ids: [] });
  expect(await tool(page, "import_asset", request)).toEqual(added);
  const changed = await tool(page, "import_asset", {
    ...request,
    name: "changed.png",
  });
  expect(changed.code).toBe("REQUEST_ID_REUSED");
  const stale = await tool(page, "import_asset", {
    ...request,
    requestId: "stale-asset",
  });
  expect(stale.code).toBe("STALE_REVISION");
  const before = await inspect(page);
  const bad = await tool(page, "import_asset", {
    ...request,
    expectedRevision: before.revision,
    requestId: "bad-asset",
    base64: btoa("not an image"),
  });
  expect(bad.isError).toBe(true);
  expect((await inspect(page)).revision).toBe(before.revision);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await inspect(page)).nodes).toEqual([]);
  expect((await inspect(page)).assets).toEqual([]);
});

test("human export options produce JPEG and reordered PDF frames through the same output owner", async ({
  page,
}) => {
  const d = await inspect(page);
  await edits(page, [
    {
      op: "create",
      node: {
        id: "first",
        type: "frame",
        name: "First",
        pageId: d.pageId,
        width: 200,
        height: 100,
      },
    },
    {
      op: "create",
      node: {
        id: "second",
        type: "frame",
        name: "Second",
        pageId: d.pageId,
        x: 250,
        width: 100,
        height: 200,
      },
    },
  ]);
  await tool(page, "selection", { ids: ["first"] });
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByText("Options", { exact: true }).click();
  await page.getByLabel("Export scale", { exact: true }).selectOption("2");
  await page.screenshot({
    path: test.info().outputPath("export-options-1440.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("export-options-390.png"),
  });
  const jpgDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "JPEG", exact: true }).click();
  expect((await jpgDownload).suggestedFilename()).toMatch(/\.jpg$/);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByText("Options", { exact: true }).click();
  await page.getByLabel("One PDF page per frame", { exact: true }).check();
  await page.getByLabel("Include First in PDF", { exact: true }).check();
  await page.getByLabel("Include Second in PDF", { exact: true }).check();
  await page
    .getByRole("button", { name: "Move PDF page 2 earlier", exact: true })
    .click();
  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  const download = await pdfDownload,
    path = await download.path();
  expect(path).toBeTruthy();
  const bytes = await readFile(path!);
  const boxes = [
    ...bytes.toString("latin1").matchAll(/\/MediaBox\s*\[([^\]]+)\]/g),
  ].map((match) => match[1].trim().split(/\s+/).map(Number));
  expect(boxes[0][2]).toBeCloseTo(75);
  expect(boxes[0][3]).toBeCloseTo(150);
  expect(boxes[1][2]).toBeCloseTo(150);
  expect(boxes[1][3]).toBeCloseTo(75);
});

test("asset decoding cannot commit after caller cancellation, retirement, a human edit or a document switch", async ({
  page,
}) => {
  await page.evaluate(() => {
    const original = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = async function () {
      await original.call(this);
      if ((window as any).__holdDecode) {
        (window as any).__decodeHeld = true;
        await new Promise<void>((resolve) => {
          (window as any).__releaseDecode = resolve;
        });
      }
    };
  });
  for (const cancel of ["caller", "retire", "revision", "document", "reopen"]) {
    const before = await inspect(page);
    const retiredArtifact =
      cancel === "reopen"
        ? await tool(page, "export_design", { format: "svg" })
        : null;
    await page.evaluate(
      ({ before, pixel, cancel }) => {
        (window as any).__holdDecode = true;
        (window as any).__decodeHeld = false;
        (window as any).__asyncResult = undefined;
        const controller = new AbortController();
        (window as any).__cancelDecode = () => controller.abort();
        void (window as any).__testSiteTools
          .get("localdesign_import_asset")
          .execute(
            {
              expectedDocumentId: before.documentId,
              expectedRevision: before.revision,
              requestId: `held-${cancel}`,
              name: "untrusted-extension.svg",
              base64: pixel,
              place: { pageId: before.pageId, x: 0, y: 0 },
            },
            { signal: controller.signal },
          )
          .then((result: unknown) => {
            (window as any).__asyncResult = result;
          });
      },
      { before, pixel, cancel },
    );
    await expect
      .poll(() => page.evaluate(() => (window as any).__decodeHeld))
      .toBe(true);
    if (cancel === "revision")
      await edits(page, [{ op: "rename", name: "Changed while decoding" }]);
    if (cancel === "document") {
      const created = await tool(page, "workspace", {
        action: "create",
        guard: {
          expectedDocumentId: before.documentId,
          expectedRevision: before.revision,
          requestId: "switch-while-decoding",
        },
      });
      expect(created.isError, created.message).not.toBe(true);
    }
    if (cancel === "reopen") {
      const opened = await tool(page, "workspace", {
        action: "open",
        id: before.documentId,
        guard: {
          expectedDocumentId: before.documentId,
          expectedRevision: before.revision,
          requestId: "reopen-while-decoding",
        },
      });
      expect(opened.isError, opened.message).not.toBe(true);
      expect(
        (
          await tool(page, "artifact", {
            action: "read",
            id: retiredArtifact.id,
          })
        ).code,
      ).toBe("MISSING_ARTIFACT");
    }
    await page.evaluate((cancel) => {
      if (cancel === "retire") {
        window.dispatchEvent(
          new PageTransitionEvent("pagehide", { persisted: true }),
        );
        window.dispatchEvent(
          new PageTransitionEvent("pageshow", { persisted: true }),
        );
      }
      if (cancel === "caller") (window as any).__cancelDecode();
      (window as any).__holdDecode = false;
      (window as any).__releaseDecode();
    }, cancel);
    await expect
      .poll(() => page.evaluate(() => (window as any).__asyncResult?.code))
      .toBe(cancel === "revision" ? "STALE_REVISION" : "DISPOSED");
    const current = await inspect(page);
    expect(current.assets).toHaveLength(0);
    expect(current.nodes).toHaveLength(0);
    expect(current.revision).toBe(
      cancel === "document"
        ? 0
        : before.revision + (cancel === "revision" ? 1 : 0),
    );
  }
  const current = await inspect(page);
  const vector = await tool(page, "import_asset", {
    expectedDocumentId: current.documentId,
    expectedRevision: current.revision,
    requestId: "not-raster",
    name: "image.svg",
    base64: btoa(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
    ),
  });
  expect(vector.code).toBe("RASTER_REQUIRED");
  expect((await inspect(page)).revision).toBe(current.revision);
});
