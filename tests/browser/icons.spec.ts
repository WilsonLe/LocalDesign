import { expect, test, type Page } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { unzipSync, strFromU8 } from "fflate";
import { iconCatalog } from "../../src/icons/catalog";
import { artifactBytes, edits, harness, inspect, open, tool } from "./helpers";

async function compare(page: Page, actual: string, expected: string) {
  return page.evaluate(
    async ({ actual, expected }) => {
      const decode = async (url: string) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.fillStyle = "white";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0);
        return {
          width: image.width,
          height: image.height,
          pixels: context.getImageData(0, 0, canvas.width, canvas.height).data,
        };
      };
      const a = await decode(actual),
        b = await decode(expected);
      if (a.width !== b.width || a.height !== b.height)
        throw new Error("Different output geometry");
      let delta = 0;
      const tiles = Array.from({ length: 48 }, () => ({
        delta: 0,
        actual: 0,
        expected: 0,
      }));
      for (let i = 0; i < a.pixels.length; i++) {
        delta += Math.abs(a.pixels[i] - b.pixels[i]);
        const pixel = Math.floor(i / 4),
          x = pixel % a.width,
          y = Math.floor(pixel / a.width),
          tile = tiles[Math.floor(y / 64) * 8 + Math.floor(x / 64)];
        tile.delta += Math.abs(a.pixels[i] - b.pixels[i]);
        if (i % 4 === 0) {
          if (a.pixels[i] < 220) tile.actual++;
          if (b.pixels[i] < 220) tile.expected++;
        }
      }
      return {
        width: a.width,
        height: a.height,
        meanDelta: delta / a.pixels.length,
        maxTileDelta: Math.max(
          ...tiles.map((tile) => tile.delta / (64 * 64 * 4)),
        ),
        maxCoverageError: Math.max(
          ...tiles.map(
            (tile) =>
              Math.abs(tile.actual - tile.expected) /
              Math.max(1, tile.expected),
          ),
        ),
      };
    },
    { actual, expected },
  );
}
test.beforeEach(async ({ page }) => {
  await harness(page);
  await open(page);
});

test("all bundled native icons match the pinned upstream pixels, export notices and reopen offline", async ({
  page,
}, info) => {
  const before = await inspect(page);
  await edits(page, [
    {
      op: "create",
      node: {
        id: "sheet",
        type: "frame",
        name: "Icon specimen",
        pageId: before.pageId,
        width: 512,
        height: 384,
        fill: "#ffffff",
      },
    },
    ...iconCatalog.icons.map((icon, i) => ({
      op: "icon_insert",
      id: `icon-${icon.id}`,
      iconId: icon.id,
      pageId: before.pageId,
      parentId: "sheet",
      x: (i % 8) * 64 + 8,
      y: Math.floor(i / 8) * 64 + 8,
      size: 48,
      color: "#222222",
      strokeWidth: 2,
    })),
  ]);
  const svg = await tool(page, "export_design", {
    format: "svg",
    ids: ["sheet"],
  });
  const svgBytes = await artifactBytes(page, svg.id, svg.size);
  expect(svgBytes.toString()).toContain("Cole Bemis");
  const png = await tool(page, "export_design", {
    format: "png",
    ids: ["sheet"],
  });
  const pngBytes = await artifactBytes(page, png.id, png.size);
  expect(pngBytes.toString()).toContain("Lucide 1.72.0");
  expect(pngBytes.toString()).toContain("ISC License");
  const { jsPDF } = await import("jspdf");
  expect(
    new jsPDF().getImageProperties(new Uint8Array(pngBytes)),
  ).toMatchObject({ width: 512, height: 384 });
  const reference: string[] = [];
  for (const [i, icon] of iconCatalog.icons.entries()) {
    const { default: Icon } = await import(`lucide-react/icons/${icon.id}`);
    reference.push(
      `<g transform="translate(${(i % 8) * 64 + 8} ${Math.floor(i / 8) * 64 + 8})">${renderToStaticMarkup(createElement(Icon, { size: 48, strokeWidth: 2, absoluteStrokeWidth: true, color: "#222222" }))}</g>`,
    );
  }
  const upstream = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="384"><rect width="512" height="384" fill="white"/>${reference.join("")}</svg>`;
  const pixels = await compare(
    page,
    `data:image/png;base64,${pngBytes.toString("base64")}`,
    `data:image/svg+xml;base64,${Buffer.from(upstream).toString("base64")}`,
  );
  console.log("NATIVE_ICON_FIDELITY", pixels);
  expect(pixels.meanDelta).toBeLessThan(0.5);
  expect(pixels.maxTileDelta).toBeLessThan(0.5);
  expect(pixels.maxCoverageError).toBeLessThan(0.05);
  await writeFile(info.outputPath("icon-specimen.png"), pngBytes);
  const jpeg = await tool(page, "export_design", {
    format: "jpeg",
    ids: ["sheet"],
  });
  const jpegBytes = await artifactBytes(page, jpeg.id, jpeg.size);
  expect(jpegBytes.toString()).toContain("Cole Bemis");
  const jpgPixels = await compare(
    page,
    `data:image/jpeg;base64,${jpegBytes.toString("base64")}`,
    `data:image/png;base64,${pngBytes.toString("base64")}`,
  );
  expect(jpgPixels.meanDelta).toBeLessThan(3);
  const pdf = await tool(page, "export_design", {
    format: "pdf",
    ids: ["sheet"],
  });
  expect(pdf.isError, pdf.message).not.toBe(true);
  expect(pdf.warnings).toEqual([]);
  const pdfBytes = await artifactBytes(page, pdf.id, pdf.size);
  expect(pdfBytes.toString("latin1")).toContain("Lucide 1.72.0");
  expect(pdfBytes.toString("latin1")).toContain("Cole Bemis");
  const pdfPath = info.outputPath("icon-specimen.pdf");
  await writeFile(pdfPath, pdfBytes);
  let poppler = false;
  try {
    execFileSync("pdftoppm", ["-v"], { stdio: "ignore" });
    poppler = true;
  } catch {
    /* Optional independent local consumer. */
  }
  if (poppler) {
    const prefix = info.outputPath("pdf-icons");
    execFileSync("pdftoppm", ["-png", "-r", "96", pdfPath, prefix]);
    const rendered = await readFile(`${prefix}-1.png`);
    const pdfPixels = await compare(
      page,
      `data:image/png;base64,${rendered.toString("base64")}`,
      `data:image/png;base64,${pngBytes.toString("base64")}`,
    );
    console.log("PDF_ICON_FIDELITY", pdfPixels);
    expect(pdfPixels.meanDelta).toBeLessThan(3);
    expect(pdfPixels.maxTileDelta).toBeLessThan(3);
    expect(pdfPixels.maxCoverageError).toBeLessThan(0.2);
  }
  const native = await tool(page, "export_design", { format: "native" });
  const bytes = await artifactBytes(page, native.id, native.size);
  const archived = JSON.parse(strFromU8(unzipSync(bytes)["document.json"]));
  expect(archived.nodes[1]).toMatchObject({
    pathViewBox: { width: 24, height: 24 },
    strokeLinecap: "round",
    strokeLinejoin: "round",
  });
  expect(archived.nodes[1].attribution).toContain("Cole Bemis");
  await page.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin === new URL(page.url()).origin)
      await route.continue();
    else await route.abort();
  });
  const prepared = await tool(page, "import_files", {
    action: "prepare",
    name: "icons.localdesign",
    base64: bytes.toString("base64"),
  });
  const current = await inspect(page);
  const committed = await tool(page, "import_files", {
    action: "commit",
    artifactId: prepared.importId,
    guard: {
      expectedDocumentId: current.documentId,
      expectedRevision: current.revision,
      requestId: "reopen-icons",
    },
  });
  expect(committed.isError, committed.message).not.toBe(true);
  const reopened = await inspect(page);
  expect(reopened.nodes).toHaveLength(49);
  expect(reopened.nodes[1].attribution).toContain("Cole Bemis");
  const reopenedPNG = await tool(page, "export_design", {
    format: "png",
    ids: ["sheet"],
  });
  expect(await artifactBytes(page, reopenedPNG.id, reopenedPNG.size)).toEqual(
    pngBytes,
  );
});

test("icon search and rendered preview are bounded reads, with offline aliases and guarded insertion", async ({
  page,
}) => {
  const before = await inspect(page);
  const search = await tool(page, "icons", { query: "home" });
  expect(search.icons[0].id).toBe("house");
  const preview = await tool(page, "icons", { id: "house", preview: true });
  expect(preview.isError, preview.message).not.toBe(true);
  expect(preview.content[0]).toMatchObject({
    type: "image",
    mimeType: "image/png",
  });
  expect(Buffer.from(preview.content[0].data, "base64")).toEqual(
    await artifactBytes(page, preview.artifact.id, preview.artifact.size),
  );
  const backdrop = await page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    return [...context.getImageData(0, 0, 1, 1).data];
  }, preview.content[0].data);
  expect(backdrop).toEqual([255, 255, 255, 255]);
  expect((await inspect(page)).revision).toBe(before.revision);
  expect((await inspect(page)).selection).toEqual(before.selection);
  const pageOne = await tool(page, "icons", { limit: 10 });
  const pageTwo = await tool(page, "icons", {
    limit: 10,
    offset: pageOne.nextOffset,
  });
  expect(pageTwo.icons[0].id).not.toBe(pageOne.icons[0].id);
  await edits(page, [
    {
      op: "icon_insert",
      id: "selected-icon",
      iconId: "house",
      pageId: before.pageId,
      size: 24,
    },
  ]);
  await tool(page, "selection", { ids: ["selected-icon"] });
  const after = await inspect(page);
  const request = {
    expectedDocumentId: before.documentId,
    expectedRevision: before.revision,
    requestId: "stale-icon",
    commands: [
      {
        op: "icon_insert",
        id: "stale-icon",
        iconId: "house",
        pageId: before.pageId,
      },
    ],
  };
  expect((await tool(page, "apply_edits", request)).code).toBe(
    "STALE_REVISION",
  );
  expect((await inspect(page)).revision).toBe(after.revision);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await inspect(page)).nodes).toEqual([]);
});

for (const width of [1440, 390])
  test(`human icon search, keyboard tabs, resize and notices work at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page
      .getByRole("button", { name: "Design resources", exact: true })
      .click();
    await page.getByRole("tab", { name: "Context", exact: true }).focus();
    await page.getByRole("tab", { name: "Context", exact: true }).press("End");
    await expect(
      page.getByRole("tab", { name: "Handoff", exact: true }),
    ).toBeFocused();
    await page.getByRole("tab", { name: "Handoff", exact: true }).press("Home");
    await expect(
      page.getByRole("tab", { name: "Context", exact: true }),
    ).toBeFocused();
    for (const name of ["Context", "Pages", "Tokens"])
      await page.getByRole("tab", { name, exact: true }).press("ArrowRight");
    await expect(
      page.getByRole("tab", { name: "Icons", exact: true }),
    ).toBeFocused();
    await page
      .getByLabel("Find icons", { exact: true })
      .fill("not in this catalog");
    await expect(
      page.getByText("No matching icons", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Find icons", { exact: true }).fill("home");
    await page.getByLabel("Icon size", { exact: true }).fill("48");
    await page.getByLabel("Icon color", { exact: true }).fill("#555555");
    const dialog = page.getByRole("dialog");
    const bounds = await dialog.boundingBox();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: info.outputPath(`icon-resources-${width}.png`),
    });
    await page
      .getByRole("button", { name: "Insert House icon", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    let current = await inspect(page);
    expect(current.nodes[0]).toMatchObject({
      type: "path",
      width: 48,
      height: 48,
      stroke: "#555555",
      pathViewBox: { width: 24, height: 24 },
    });
    expect(current.selection).toEqual([current.nodes[0].id]);
    if (width === 390)
      await page
        .getByRole("button", { name: "Properties", exact: true })
        .click();
    await page.getByLabel("W", { exact: true }).fill("96");
    await page.getByLabel("W", { exact: true }).press("Enter");
    await expect(
      page.getByLabel("Scale path with bounds", { exact: true }),
    ).toBeChecked();
    await page.getByLabel("Line cap", { exact: true }).selectOption("square");
    current = await inspect(page);
    expect(current.nodes[0]).toMatchObject({
      width: 96,
      height: 48,
      strokeLinecap: "square",
    });
    await page.getByText("Attribution", { exact: true }).click();
    await expect(page.getByText("ISC License", { exact: false })).toBeVisible();
    await page.getByText("Attribution", { exact: true }).click();
    await page
      .getByLabel("Scale path with bounds", { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`icon-properties-${width}.png`),
    });
  });
