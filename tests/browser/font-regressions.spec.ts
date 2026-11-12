import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { harness, open, tool, inspect, edits } from "./helpers";

async function exported(
  page: Page,
  format: "png" | "svg" | "native",
  ids: string[],
) {
  const file = await tool(page, "export_design", { format, ids });
  expect(file.isError, file.message).not.toBe(true);
  const parts: Buffer[] = [];
  for (let offset = 0; offset < file.size; offset += 524288) {
    const part = await tool(page, "artifact", {
      id: file.id,
      action: "read",
      offset,
      length: 524288,
    });
    parts.push(Buffer.from(part.base64, "base64"));
  }
  return Buffer.concat(parts);
}

test("selected italic/diacritic outputs retain transformed ink and honor clipped frames", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const d = await inspect(page);
  const type = {
    type: "text",
    pageId: d.pageId,
    fontFamily: "Source Serif 4",
    fontWeight: "400",
    fontStyle: "italic",
    fontSize: 72,
    fill: "#111111",
  };
  await edits(page, [
    {
      op: "create",
      node: {
        ...type,
        id: "italic-ink",
        name: "Italic overhang",
        x: 100,
        y: 100,
        text: "f",
        width: 23.4,
        height: 94,
      },
    },
    {
      op: "create",
      node: {
        ...type,
        id: "accent-ink",
        name: "Rotated accent",
        x: 400,
        y: 100,
        rotation: 23,
        text: "Ấj",
        width: 100,
        height: 100,
      },
    },
    ...[true, false].flatMap((clip, i) => [
      {
        op: "create",
        node: {
          type: "frame",
          id: `ink-frame-${i}`,
          name: `Clip ${clip}`,
          pageId: d.pageId,
          x: 700 + i * 100,
          y: 100,
          width: 20,
          height: 80,
          clip,
          fill: "none",
        },
      },
      {
        op: "create",
        node: {
          ...type,
          id: `ink-child-${i}`,
          name: "Italic child",
          parentId: `ink-frame-${i}`,
          text: "f",
          width: 23.4,
          height: 94,
        },
      },
    ]),
  ]);
  const state = await inspect(page);
  expect(
    state.textMetrics.find((m: any) => m.id === "italic-ink").overflow,
  ).toBe(false);
  expect(
    state.textMetrics.find((m: any) => m.id === "italic-ink").inkBounds.x,
  ).toBeCloseTo(-12.096, 3);
  for (const id of ["italic-ink", "accent-ink"]) {
    // Independent browser SVG geometry, including the editor's transparent logical hit box.
    const reference = await page.evaluate((id) => {
      const canvas = document.querySelector('[data-testid="canvas"]')!;
      const node = canvas.querySelector(
        `[data-node-id="${id}"]`,
      ) as SVGGElement;
      const box = node.getBBox(),
        matrix = node.transform.baseVal.consolidate()!.matrix;
      const corners = [
        [box.x, box.y],
        [box.x + box.width, box.y],
        [box.x + box.width, box.y + box.height],
        [box.x, box.y + box.height],
      ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix));
      const x = Math.min(...corners.map((p) => p.x)),
        y = Math.min(...corners.map((p) => p.y)),
        width = Math.max(...corners.map((p) => p.x)) - x,
        height = Math.max(...corners.map((p) => p.y)) - y;
      const defs = [...canvas.querySelectorAll("defs")]
        .map((n) => n.outerHTML)
        .join("");
      return {
        x,
        y,
        width,
        height,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(width)}" height="${Math.ceil(height)}" viewBox="${x} ${y} ${width} ${height}">${defs}${node.outerHTML}</svg>`,
      };
    }, id);
    const png = await exported(page, "png", [id]),
      svg = (await exported(page, "svg", [id])).toString();
    const viewBox = svg
      .match(/viewBox="([^"]+)"/)![1]
      .split(" ")
      .map(Number);
    [reference.x, reference.y, reference.width, reference.height].forEach(
      (value, i) => expect(viewBox[i]).toBeCloseTo(value, 3),
    );
    const pixels = await page.evaluate(
      async ({ actual, reference }) => {
        const decode = async (url: string) => {
          const image = new Image();
          image.src = url;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          canvas.getContext("2d")!.drawImage(image, 0, 0);
          return canvas
            .getContext("2d")!
            .getImageData(0, 0, canvas.width, canvas.height);
        };
        const a = await decode(`data:image/png;base64,${actual}`),
          b = await decode(`data:image/svg+xml;base64,${reference}`);
        let error = 0,
          ink = 0;
        for (let i = 0; i < a.data.length; i++) {
          error += Math.abs(a.data[i] - b.data[i]);
          if (i % 4 === 3 && a.data[i] > 64) ink++;
        }
        return {
          width: a.width,
          height: a.height,
          referenceWidth: b.width,
          referenceHeight: b.height,
          error: error / a.data.length,
          ink,
        };
      },
      {
        actual: png.toString("base64"),
        reference: Buffer.from(reference.svg).toString("base64"),
      },
    );
    expect(pixels.width).toBe(pixels.referenceWidth);
    expect(pixels.height).toBe(pixels.referenceHeight);
    expect(pixels.ink).toBeGreaterThan(100);
    expect(pixels.error).toBeLessThan(1);
  }
  for (const [id, expected] of [
    ["ink-frame-0", [20, 80]],
    ["ink-frame-1", [47, 94]],
  ] as const) {
    const svg = (await exported(page, "svg", [id])).toString();
    expect(svg).toContain(`width="${expected[0]}" height="${expected[1]}"`);
  }
  const after = await inspect(page);
  expect(after.revision).toBe(state.revision);
  expect(after.nodes).toEqual(state.nodes);
});

test("Fonts captures canvas shortcuts while preserving field undo and Escape focus", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const d = await inspect(page);
  await edits(page, [
    {
      op: "create",
      node: {
        id: "dialog-type",
        name: "Keep this text",
        type: "text",
        pageId: d.pageId,
      },
    },
  ]);
  await tool(page, "selection", { ids: ["dialog-type"] });
  const before = await inspect(page);
  await page.getByRole("button", { name: "Fonts", exact: true }).click();
  const close = page.getByRole("button", { name: "Close fonts", exact: true });
  await close.press("Delete");
  await close.press("ControlOrMeta+z");
  await close.press("ControlOrMeta+d");
  await expect(page.getByRole("dialog")).toBeVisible();
  let current = await inspect(page);
  expect(current.revision).toBe(before.revision);
  expect(current.nodes).toEqual(before.nodes);
  const license = page.getByLabel("License / permission");
  await license.pressSequentially("Draft");
  await license.press("ControlOrMeta+z");
  await expect(license).not.toHaveValue("Draft");
  expect((await inspect(page)).revision).toBe(before.revision);
  await close.press("Space");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Fonts", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Fonts", exact: true }),
  ).toBeFocused();
  current = await inspect(page);
  expect(current.selection).toEqual(["dialog-type"]);
  expect(current.revision).toBe(before.revision);
});

test("family and selected-type previews use the document's glyphs and subset precedence", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const d = await inspect(page);
  await edits(page, [
    {
      op: "create",
      node: {
        id: "sample-frame",
        name: "Sample",
        type: "frame",
        pageId: d.pageId,
        width: 600,
        height: 200,
      },
    },
    {
      op: "create",
      node: {
        id: "sample-type",
        name: "Font sample",
        type: "text",
        pageId: d.pageId,
        parentId: "sample-frame",
        x: 12,
        y: 12,
        rotation: 20,
        text: "Aa Bb 0123 · Tiếng Việt",
        fontFamily: "Source Serif 4",
        fontSize: 22,
        width: 550,
        height: 80,
      },
    },
  ]);
  await tool(page, "selection", { ids: ["sample-type"] });
  const glyphs = (selector: string) =>
    page.locator(selector).evaluateAll((nodes) =>
      nodes.map((n) => ({
        glyph: n
          .getAttribute("href")!
          .slice(n.getAttribute("href")!.indexOf("glyph-")),
        transform: n.getAttribute("transform"),
      })),
    );
  const regular = await glyphs('[data-node-id="sample-type"] use');
  expect(regular.length).toBeGreaterThan(10);
  expect(await glyphs(".type-preview .font-sample use")).toEqual(regular);
  await page.getByLabel("Font weight", { exact: true }).selectOption("700");
  await page.getByLabel("Font style", { exact: true }).selectOption("italic");
  const italic = await glyphs('[data-node-id="sample-type"] use');
  expect(italic).not.toEqual(regular);
  expect(await glyphs(".type-preview .font-sample use")).toEqual(italic);
  await page.getByRole("button", { name: "Fonts", exact: true }).click();
  const sample = page
    .getByRole("dialog")
    .getByRole("img", { name: "Source Serif 4 preview", exact: true });
  const family = await sample.locator("use").evaluateAll((nodes) =>
    nodes.map((n) => ({
      glyph: n
        .getAttribute("href")!
        .slice(n.getAttribute("href")!.indexOf("glyph-")),
      transform: n.getAttribute("transform"),
    })),
  );
  expect(family).toEqual(regular);
  expect(
    await page.evaluate(() => {
      const ids = [...document.querySelectorAll("svg [id]")].map((n) => n.id);
      return ids.length === new Set(ids).size;
    }),
  ).toBe(true);
  await page.getByRole("button", { name: "Close fonts", exact: true }).click();
  await page.getByLabel("Font weight", { exact: true }).selectOption("400");
  await page.getByLabel("Font style", { exact: true }).selectOption("normal");
  // A native working copy may already retain this bundled family/weight/style.
  await edits(page, [
    {
      op: "font_add",
      font: {
        id: "bundle-source-serif-4-400-normal",
        family: "Source Serif 4",
        weight: "400",
        style: "normal",
        source: "bundled",
        files: ["latin", "latin-ext", "vietnamese"].map((subset) => ({
          format: "woff2",
          data: readFileSync(
            `node_modules/@fontsource/source-serif-4/files/source-serif-4-${subset}-400-normal.woff2`,
          ).toString("base64"),
        })),
        license: readFileSync("public/source-serif-4-OFL.txt", "utf8"),
        provenance: "Bundled face retained in this working copy",
        redistributionAllowed: true,
      },
    },
  ]);
  const existing = await inspect(page);
  const imported = await tool(page, "import_font", {
    expectedDocumentId: existing.documentId,
    expectedRevision: existing.revision,
    requestId: crypto.randomUUID(),
    name: "SourceSerif4-Regular.otf",
    base64: readFileSync(
      "tests/fixtures/fonts/SourceSerif4-Regular.otf",
    ).toString("base64"),
    license: "SIL OFL 1.1",
    redistributionAllowed: true,
  });
  expect(imported.isError, imported.message).not.toBe(true);
  expect((await inspect(page)).textMetrics[0].fontId).toBe(
    "bundle-source-serif-4-400-normal",
  );
  await page
    .getByLabel("Font source", { exact: true })
    .selectOption(imported.font.id);
  const assigned = await inspect(page);
  expect(
    assigned.nodes.find((n: any) => n.id === "sample-type").fontFamily,
  ).toBe("Source Serif 4");
  expect(assigned.textMetrics[0].fontId).toBe(imported.font.id);
  await expect(
    page.getByLabel("Font source", { exact: true }).locator("option:checked"),
  ).toContainText("Local");
  await expect(
    page.getByLabel("Font source", { exact: true }).locator("option:checked"),
  ).toContainText("SourceSerif4-Regular.otf");
  await edits(page, [
    {
      op: "create",
      node: {
        id: "automatic-type",
        name: "Automatic source",
        type: "text",
        pageId: d.pageId,
        parentId: "sample-frame",
        x: 12,
        y: 100,
        text: "Tiếng Việt: Thiết kế và kiểu chữ",
        fontFamily: "Source Serif 4",
        fontSize: 29,
        width: 550,
        height: 80,
      },
    },
  ]);
  const beforeReopen = await inspect(page),
    png = await exported(page, "png", ["sample-frame"]),
    native = await exported(page, "native", ["sample-frame"]);
  expect(
    beforeReopen.textMetrics.find((m: any) => m.id === "automatic-type").fontId,
  ).toBe("bundle-source-serif-4-400-normal");
  const prepared = await tool(page, "import_files", {
    action: "prepare",
    name: "same-family-sources.localdesign",
    base64: native.toString("base64"),
  });
  expect(prepared.isError, prepared.message).not.toBe(true);
  const reopened = await tool(page, "import_files", {
    action: "commit",
    artifactId: prepared.importId,
    guard: {
      expectedDocumentId: beforeReopen.documentId,
      expectedRevision: beforeReopen.revision,
      requestId: crypto.randomUUID(),
    },
  });
  expect(reopened.isError, reopened.message).not.toBe(true);
  const afterReopen = await inspect(page);
  expect(afterReopen.nodes).toEqual(beforeReopen.nodes);
  expect(afterReopen.textMetrics).toEqual(beforeReopen.textMetrics);
  expect((await exported(page, "png", ["sample-frame"])).equals(png)).toBe(
    true,
  );
});

test("native font collection preserves fallback priority independently of first text use", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const d = await inspect(page);
  await edits(page, [
    {
      op: "create",
      node: {
        id: "weight-frame",
        name: "Fallback weight",
        type: "frame",
        pageId: d.pageId,
        width: 620,
        height: 260,
        fill: "#ffffff",
      },
    },
    ...["600", "500"].map((fontWeight, i) => ({
      op: "create",
      node: {
        id: `weight-${fontWeight}`,
        name: `Requested ${fontWeight}`,
        type: "text",
        pageId: d.pageId,
        parentId: "weight-frame",
        fontFamily: "Inter",
        fontWeight,
        fontSize: 72,
        text: "AVATAR",
        x: 20,
        y: 10 + i * 120,
        width: 580,
        height: 100,
        fill: "#111111",
      },
    })),
  ]);
  const before = await inspect(page),
    png = await exported(page, "png", ["weight-frame"]),
    native = await exported(page, "native", ["weight-frame"]);
  expect(
    before.textMetrics.find((m: any) => m.id === "weight-500").fontId,
  ).toBe("bundle-inter-400-normal");
  const prepared = await tool(page, "import_files", {
    action: "prepare",
    name: "weight-priority.localdesign",
    base64: native.toString("base64"),
  });
  expect(prepared.isError, prepared.message).not.toBe(true);
  const reopened = await tool(page, "import_files", {
    action: "commit",
    artifactId: prepared.importId,
    guard: {
      expectedDocumentId: before.documentId,
      expectedRevision: before.revision,
      requestId: crypto.randomUUID(),
    },
  });
  expect(reopened.isError, reopened.message).not.toBe(true);
  const after = await inspect(page);
  expect(after.nodes).toEqual(before.nodes);
  expect(after.textMetrics).toEqual(before.textMetrics);
  expect((await exported(page, "png", ["weight-frame"])).equals(png)).toBe(
    true,
  );
});

test("tight Vietnamese wrapping keeps NFC and NFD graphemes together without rewriting text", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const d = await inspect(page);
  await edits(page, [
    {
      op: "create",
      node: {
        id: "cluster-type",
        name: "Vietnamese",
        type: "text",
        pageId: d.pageId,
        fontFamily: "Source Serif 4",
        fontSize: 72,
        width: 80,
        height: 1000,
        text: "Tế",
      },
    },
  ]);
  for (const [fontFamily, text, width] of [
    ["Source Serif 4", "Tế", 80],
    ["Inter", "Vệ", 90],
  ] as const) {
    await edits(page, [
      {
        op: "update",
        ids: ["cluster-type"],
        patch: { fontFamily, text, width },
      },
    ]);
    const before = await inspect(page),
      png = await exported(page, "png", ["cluster-type"]);
    const decomposed = text.normalize("NFD");
    await edits(page, [
      { op: "update", ids: ["cluster-type"], patch: { text: decomposed } },
    ]);
    const after = await inspect(page);
    expect(after.nodes[0].text).toBe(decomposed);
    expect(after.textMetrics[0]).toEqual(before.textMetrics[0]);
    expect(after.textMetrics[0].lines).toEqual(Array.from(text));
    expect((await exported(page, "png", ["cluster-type"])).equals(png)).toBe(
      true,
    );
  }
});
