import { readFileSync } from "node:fs";
import { unzipSync, zipSync, strFromU8 } from "fflate";
import { expect, test, type Page } from "@playwright/test";
import { harness, open, tool, inspect, edits } from "./helpers";

async function artifactBytes(
  page: Page,
  artifact: { id: string; size: number },
) {
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < artifact.size; offset += 262144) {
    const part = await tool(page, "artifact", {
      id: artifact.id,
      action: "read",
      offset,
    });
    expect(part.isError, part.message).not.toBe(true);
    chunks.push(Buffer.from(part.base64, "base64"));
  }
  return Buffer.concat(chunks);
}
const guard = (d: any) => ({
  expectedDocumentId: d.documentId,
  expectedRevision: d.revision,
  requestId: crypto.randomUUID(),
});
async function prepare(
  page: Page,
  bytes: Buffer | Uint8Array,
  name = "type.localdesign",
) {
  return tool(page, "import_files", {
    action: "prepare",
    name,
    base64: Buffer.from(bytes).toString("base64"),
  });
}

test("human font controls and agent assignments share metrics, guarded history and actual available styles", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const d = await inspect(page);
  await edits(page, [
    {
      op: "create",
      node: {
        id: "type",
        type: "text",
        name: "Type specimen",
        pageId: d.pageId,
        text: "Tiếng Việt — editable",
        width: 420,
        height: 160,
        fontSize: 34,
        lineHeight: 1.4,
        letterSpacing: 0.75,
      },
    },
  ]);
  await tool(page, "selection", { ids: ["type"] });
  await page
    .getByLabel("Font family", { exact: true })
    .selectOption("Source Serif 4");
  await page.getByLabel("Font weight", { exact: true }).selectOption("700");
  await page.getByLabel("Font style", { exact: true }).selectOption("italic");
  let state = await inspect(page),
    n = state.nodes[0];
  expect([n.fontFamily, n.fontWeight, n.fontStyle]).toEqual([
    "Source Serif 4",
    "700",
    "italic",
  ]);
  expect([
    n.fontSize,
    n.lineHeight,
    n.letterSpacing,
    n.width,
    n.height,
  ]).toEqual([34, 1.4, 0.75, 420, 160]);
  expect(state.textMetrics[0].fontStatus).toBe("exact");
  expect(state.textMetrics[0].fallbackWarning).toBeNull();
  const old = guard(state);
  await edits(page, [
    {
      op: "update",
      ids: ["type"],
      patch: {
        fontFamily: "IBM Plex Mono",
        fontWeight: "400",
        fontStyle: "normal",
      },
    },
  ]);
  await expect(page.getByLabel("Font family", { exact: true })).toHaveValue(
    "IBM Plex Mono",
  );
  expect((await inspect(page)).textMetrics[0].width).not.toBe(
    state.textMetrics[0].width,
  );
  const stale = await tool(page, "apply_edits", {
    ...old,
    commands: [{ op: "update", ids: ["type"], patch: { fontFamily: "Inter" } }],
  });
  expect(stale.code).toBe("STALE_REVISION");
  state = await inspect(page);
  await tool(page, "history", { action: "undo", ...guard(state) });
  await expect(page.getByLabel("Font family", { exact: true })).toHaveValue(
    "Source Serif 4",
  );
  state = await inspect(page);
  await tool(page, "history", { action: "redo", ...guard(state) });
  await expect(page.getByLabel("Font family", { exact: true })).toHaveValue(
    "IBM Plex Mono",
  );
  const catalog = await tool(page, "catalog");
  expect(
    catalog.fonts.some(
      (f: any) =>
        f.family === "Source Serif 4" && f.style === "italic" && f.portable,
    ),
  ).toBe(true);
  expect(
    catalog.fonts
      .filter((f: any) => f.family === "IBM Plex Mono")
      .map((f: any) => f.weight),
  ).not.toContain("600");
  await page.getByRole("button", { name: "Fonts", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Aa Bb 0123 · Tiếng Việt",
  );
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Fonts", exact: true }),
  ).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  await page
    .getByLabel("Font family", { exact: true })
    .selectOption("Source Serif 4");
  await page.getByRole("button", { name: "Fonts", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close fonts" }).click();
  await expect(
    page.getByRole("button", { name: "Fonts", exact: true }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() =>
    Object.defineProperty(navigator.clipboard, "readText", {
      value: async () => {
        throw new DOMException("Clipboard read denied", "NotAllowedError");
      },
    }),
  );
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+v");
  await expect.poll(async () => (await inspect(page)).nodes.length).toBe(2);
  await page.keyboard.press("ControlOrMeta+v");
  await expect.poll(async () => (await inspect(page)).nodes.length).toBe(3);
  expect(
    (await inspect(page)).nodes.find((n: any) => n.id === "type").fontId,
  ).toBeNull();
});

test("licensed local fonts render the same pixels in canvas, preview, SVG, PNG and a fresh offline native reopen", async ({
  page,
  browser,
}, testInfo) => {
  await harness(page);
  await open(page);
  await page.getByRole("button", { name: "Fonts", exact: true }).click();
  await expect(page.getByLabel("Font file", { exact: true })).toBeDisabled();
  await page
    .getByLabel("License / permission")
    .fill("SIL Open Font License 1.1");
  await page
    .getByLabel("I can redistribute and embed this font for editing")
    .check();
  await page
    .getByLabel("Font file", { exact: true })
    .setInputFiles("tests/fixtures/fonts/SourceSerif4-Regular.otf");
  await expect(page.getByRole("dialog")).toContainText(
    "Source Serif 4 400 normal added.",
  );
  await page.getByRole("button", { name: "Close fonts" }).click();
  const d = await inspect(page);
  await edits(page, [
    {
      op: "create",
      node: {
        id: "specimen",
        type: "frame",
        name: "Portable type",
        pageId: d.pageId,
        width: 600,
        height: 420,
        fill: "#ffffff",
      },
    },
    ...[
      {
        id: "heading",
        text: "Forward Deployed\nEngineer at Lyra",
        fontFamily: "Source Serif 4",
        fontSize: 42,
        height: 120,
        y: 20,
      },
      {
        id: "label",
        text: "01 / SELECTED WORK",
        fontFamily: "IBM Plex Mono",
        fontSize: 17,
        height: 34,
        y: 158,
      },
      {
        id: "body",
        text: "Friends practise new languages together. Build useful products and keep them dependable.",
        fontFamily: "Inter",
        fontSize: 22,
        height: 95,
        y: 210,
      },
      {
        id: "vietnamese",
        text: "Tiếng Việt: Thiết kế và kiểu chữ",
        fontFamily: "Source Serif 4",
        fontSize: 28,
        height: 70,
        y: 330,
      },
    ].map((n) => ({
      op: "create",
      node: {
        ...n,
        type: "text",
        name: n.id,
        pageId: d.pageId,
        parentId: "specimen",
        x: 24,
        width: 552,
        fill: "#10130f",
        lineHeight: 1.25,
      },
    })),
  ]);
  const before = await inspect(page);
  expect(
    before.textMetrics.every(
      (m: any) => !m.overflow && !m.fallbackWarning && m.portable,
    ),
  ).toBe(true);
  expect(
    before.textMetrics.find((m: any) => m.id === "body").lines.length,
  ).toBeGreaterThan(1);
  await tool(page, "selection", { ids: [] });
  const canvas = await page
    .locator('[data-node-id="specimen"]')
    .screenshot({ path: testInfo.outputPath("portable-type-canvas.png") });
  const outputs: Record<string, Buffer> = {};
  for (const format of ["png", "svg", "preview", "native"]) {
    const file = await tool(page, "export_design", {
      format,
      ids: ["specimen"],
    });
    expect(file.isError, file.message).not.toBe(true);
    expect(file.fontWarningCount).toBe(0);
    outputs[format] = await artifactBytes(page, file);
  }
  await testInfo.attach("PNG", { body: outputs.png, contentType: "image/png" });
  await testInfo.attach("Preview", {
    body: outputs.preview,
    contentType: "image/png",
  });
  const svgText = outputs.svg.toString();
  expect(svgText).toContain("data:font/otf;base64,");
  expect(svgText).toContain("SIL Open Font License");
  expect(svgText).toContain("<use");
  expect(svgText).not.toContain("<text ");
  const referenceAlias = svgText.match(/font-family:'([^']+)'/)![1];
  const referenceWidth = await page.evaluate(
    ({ alias, lines }) => {
      const ctx = document.createElement("canvas").getContext("2d")!;
      ctx.font = `400 42px '${alias}'`;
      return Math.max(
        ...lines.map((line: string) => ctx.measureText(line).width),
      );
    },
    {
      alias: referenceAlias,
      lines: before.textMetrics.find((m: any) => m.id === "heading").lines,
    },
  );
  expect(
    Math.abs(
      referenceWidth -
        before.textMetrics.find((m: any) => m.id === "heading").width,
    ),
  ).toBeLessThan(0.25);
  const pixelResult = await page.evaluate(
    async ({ screenshot, svg, png, preview }) => {
      const decode = async (source: string) => {
        const img = new Image();
        img.src = source;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        c.getContext("2d")!.drawImage(img, 0, 0);
        return c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
      };
      const a = await decode(`data:image/png;base64,${screenshot}`),
        b = await decode(`data:image/png;base64,${png}`),
        c = await decode(`data:image/svg+xml;base64,${svg}`),
        p = await decode(`data:image/png;base64,${preview}`);
      let previewError = 0,
        error = 0,
        svgError = 0,
        ink = 0;
      for (let i = 0; i < a.data.length; i += 4) {
        if (b.data[i] < 160) ink++;
        for (let j = 0; j < 3; j++) {
          error += Math.abs(a.data[i + j] - b.data[i + j]);
          svgError += Math.abs(c.data[i + j] - b.data[i + j]);
          previewError += Math.abs(p.data[i + j] - b.data[i + j]);
        }
      }
      return {
        width: a.width,
        height: a.height,
        pngWidth: b.width,
        pngHeight: b.height,
        meanError: error / a.data.length,
        svgError,
        previewError,
        ink,
      };
    },
    {
      screenshot: canvas.toString("base64"),
      svg: outputs.svg.toString("base64"),
      png: outputs.png.toString("base64"),
      preview: outputs.preview.toString("base64"),
    },
  );
  expect(pixelResult.width).toBe(600);
  expect(pixelResult.height).toBe(420);
  expect(pixelResult.pngWidth).toBe(600);
  expect(pixelResult.pngHeight).toBe(420);
  expect(pixelResult.ink).toBeGreaterThan(3000);
  expect(pixelResult.meanError).toBeLessThan(0.5);
  expect(pixelResult.svgError).toBe(0);
  expect(pixelResult.previewError).toBe(0);
  const fresh = await browser.newContext(),
    other = await fresh.newPage();
  await harness(other);
  await open(other);
  await fresh.setOffline(true);
  const prepared = await prepare(other, outputs.native);
  expect(prepared.isError, prepared.message).not.toBe(true);
  const current = await inspect(other);
  const committed = await tool(other, "import_files", {
    action: "commit",
    artifactId: prepared.importId,
    guard: guard(current),
  });
  expect(committed.isError, committed.message).not.toBe(true);
  const reopened = await inspect(other);
  expect(reopened.nodes).toEqual(before.nodes);
  expect(reopened.textMetrics).toEqual(before.textMetrics);
  expect(
    reopened.fonts.some(
      (f: any) => f.source === "local" && f.family === "Source Serif 4",
    ),
  ).toBe(true);
  const afterPng = await tool(other, "export_design", {
    format: "png",
    ids: ["specimen"],
  });
  expect((await artifactBytes(other, afterPng)).equals(outputs.png)).toBe(true);
  const decomposed = "Tiếng Việt: Thiết kế và kiểu chữ".normalize("NFD");
  await edits(other, [
    { op: "update", ids: ["vietnamese"], patch: { text: decomposed } },
  ]);
  expect(
    (await inspect(other)).nodes.find((n: any) => n.id === "vietnamese").text,
  ).toBe(decomposed);
  const canonicalPng = await tool(other, "export_design", {
    format: "png",
    ids: ["specimen"],
  });
  expect((await artifactBytes(other, canonicalPng)).equals(outputs.png)).toBe(
    true,
  );
  await edits(other, [
    {
      op: "update",
      ids: ["heading"],
      patch: { text: "Still editable offline" },
    },
  ]);
  expect(
    (await inspect(other)).nodes.find((n: any) => n.id === "heading").text,
  ).toBe("Still editable offline");
  await fresh.grantPermissions(["clipboard-read", "clipboard-write"]);
  await tool(other, "selection", { ids: ["heading"] });
  await other.keyboard.press("ControlOrMeta+c");
  await expect
    .poll(() =>
      other.evaluate(async () =>
        (await navigator.clipboard.readText()).includes('"fonts":['),
      ),
    )
    .toBe(true);
  const copied = await inspect(other);
  await tool(other, "workspace", {
    action: "create",
    name: "Clipboard destination",
    guard: guard(copied),
  });
  await other.keyboard.press("ControlOrMeta+v");
  await expect.poll(async () => (await inspect(other)).nodes.length).toBe(1);
  const pasted = await inspect(other);
  expect(pasted.textMetrics[0].resolvedFont.family).toBe("Source Serif 4");
  expect(
    pasted.fonts.some(
      (f: any) => f.source === "local" && f.family === "Source Serif 4",
    ),
  ).toBe(true);
  await fresh.close();
});

test("missing website font requests stay inspectable and explicitly mapped; glyph warnings are independent of overflow", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const prepared = await prepare(
    page,
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><text x="24" y="60" font-family="Iowan Old Style,Georgia,serif" font-size="31" font-weight="500" font-style="oblique" letter-spacing="1.5" line-height="1.6">Forward Deployed Engineer</text></svg>',
    ),
    "website.svg",
  );
  expect(prepared.warnings.join(" ")).toContain("substituted");
  const d = await inspect(page);
  await tool(page, "import_files", {
    action: "commit",
    artifactId: prepared.importId,
    guard: guard(d),
  });
  let state = await inspect(page);
  const n = state.nodes.find((x: any) => x.type === "text");
  expect([
    n.fontFamily,
    n.fontWeight,
    n.fontStyle,
    n.fontSize,
    n.letterSpacing,
    n.lineHeight,
  ]).toEqual(["Iowan Old Style,Georgia,serif", "500", "oblique", 31, 1.5, 1.6]);
  expect(state.textMetrics[0].overflow).toBe(false);
  expect(state.textMetrics[0].fallbackWarning).toContain("Requested Iowan");
  await tool(page, "selection", { ids: [n.id] });
  await page
    .getByLabel("Replacement", { exact: true })
    .selectOption("bundle-source-serif-4-400-normal");
  state = await inspect(page);
  expect(state.nodes.find((x: any) => x.id === n.id)).toEqual({
    ...n,
    fontId: "bundle-source-serif-4-400-normal",
  });
  expect(state.textMetrics[0].fontStatus).toBe("mapped");
  expect(state.textMetrics[0].requestedFont.family).toBe(n.fontFamily);
  await edits(page, [
    { op: "update", ids: [n.id], patch: { text: "漢字 😀" } },
  ]);
  state = await inspect(page);
  expect(state.textMetrics[0].overflow).toBe(false);
  expect(state.textMetrics[0].missingGlyphs).toContain("漢");
  expect(state.textMetrics[0].portable).toBe(false);
  const png = await tool(page, "export_design", { format: "preview" });
  expect(png.fontWarnings[0].message).toContain("Missing glyphs");
});

test("font ingress rejects bad files and metadata without replacing work, and rechecks cancellation after decoding", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  await edits(page, [{ op: "rename", name: "Keep this working copy" }]);
  const before = await inspect(page);
  for (const data of [
    Buffer.from("not a font at all"),
    Buffer.alloc(4_000_001),
    readFileSync("tests/fixtures/fonts/IBMPlexMono-Regular.ttf").subarray(
      0,
      30,
    ),
  ]) {
    const result = await tool(page, "import_font", {
      ...guard(before),
      name: "bad.ttf",
      base64: data.toString("base64"),
      license: "SIL OFL 1.1",
      redistributionAllowed: true,
    });
    expect(result.isError).toBe(true);
    expect((await inspect(page)).revision).toBe(before.revision);
  }
  const fontBytes = readFileSync(
    "tests/fixtures/fonts/IBMPlexMono-Regular.ttf",
  );
  const valid = await tool(page, "import_font", {
    ...guard(before),
    name: "mono.ttf",
    base64: fontBytes.toString("base64"),
    license: "SIL OFL 1.1",
    redistributionAllowed: true,
  });
  expect(valid.isError, valid.message).not.toBe(true);
  const file = await tool(page, "export_design", { format: "native" });
  const entries = unzipSync(await artifactBytes(page, file)),
    raw = JSON.parse(strFromU8(entries["document.json"]));
  entries[raw.fonts[0].files[0].data] = new Uint8Array(40);
  const current = await inspect(page),
    corrupt = await prepare(page, zipSync(entries));
  expect(corrupt.isError).toBe(true);
  expect((await inspect(page)).documentId).toBe(before.documentId);
  expect((await inspect(page)).revision).toBe(current.revision);
  const heldBytes = readFileSync(
    "node_modules/@fontsource/inter/files/inter-latin-500-normal.woff2",
  ).toString("base64");
  await page.evaluate(
    ({ data, g }) => {
      const original = FontFace.prototype.load;
      FontFace.prototype.load = function () {
        (window as any).__fontHeld = true;
        return new Promise<FontFace>((resolve) => {
          (window as any).__releaseFont = async () =>
            resolve(await original.call(this));
        });
      };
      const t = (window as any).__testSiteTools.get("localdesign_import_font");
      const cancel = new AbortController();
      (window as any).__cancelFont = cancel;
      (window as any).__pendingFont = t
        .execute(
          {
            ...g,
            name: "Inter500.woff2",
            base64: data,
            license: "SIL OFL 1.1",
            redistributionAllowed: true,
          },
          { signal: cancel.signal },
        )
        .then((r: unknown) => {
          (window as any).__fontResult = r;
        });
    },
    { data: heldBytes, g: guard(current) },
  );
  await expect
    .poll(() => page.evaluate(() => (window as any).__fontHeld))
    .toBe(true);
  await page.evaluate(async () => {
    (window as any).__cancelFont.abort();
    await (window as any).__releaseFont();
    await (window as any).__pendingFont;
  });
  expect(await page.evaluate(() => (window as any).__fontResult.code)).toBe(
    "DISPOSED",
  );
  expect((await inspect(page)).revision).toBe(current.revision);
  expect((await inspect(page)).name).toBe("Keep this working copy");
});
