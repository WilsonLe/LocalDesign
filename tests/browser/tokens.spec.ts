import { expect, test } from "@playwright/test";
import { artifactBytes, edits, harness, inspect, open, tool } from "./helpers";
import { strFromU8, unzipSync } from "fflate";

test("native backups retain font bytes needed only by an inactive token theme", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const before = await inspect(page);
  const themes = [{ id: "serif-mode", name: "Serif" }];
  await edits(page, [
    { op: "token_themes_set", themes, activeThemeId: null },
    {
      op: "token_set",
      token: {
        id: "type-family",
        name: "type-family",
        type: "fontFamily",
        value: "Inter",
        themes: { "serif-mode": "Source Serif 4" },
        description: "Heading family",
      },
    },
    {
      op: "create",
      node: {
        id: "heading",
        type: "text",
        pageId: before.pageId,
        name: "Portable heading",
        text: "Tiếng Việt",
        fontSize: 32,
        fontStyle: "italic",
        fontWeight: "600",
        width: 300,
        height: 80,
        bindings: { fontFamily: "type-family" },
      },
    },
  ]);
  const native = await tool(page, "export_design", { format: "native" });
  const bytes = await artifactBytes(page, native.id, native.size);
  const files = unzipSync(bytes);
  const catalog = JSON.parse(strFromU8(files["fonts/catalog.json"]));
  expect(
    catalog.some(
      (font: { family: string; weight: string; style: string }) =>
        font.family === "Source Serif 4" &&
        font.weight === "600" &&
        font.style === "italic",
    ),
  ).toBe(true);
  await edits(page, [
    { op: "token_themes_set", themes, activeThemeId: "serif-mode" },
  ]);
  const reference = await tool(page, "export_design", { format: "png" });
  const referenceBytes = await artifactBytes(
    page,
    reference.id,
    reference.size,
  );
  const prepared = await tool(page, "import_files", {
    action: "prepare",
    name: "inactive-fonts.localdesign",
    base64: bytes.toString("base64"),
  });
  const current = await inspect(page);
  const reopened = await tool(page, "import_files", {
    action: "commit",
    artifactId: prepared.importId,
    guard: {
      expectedDocumentId: current.documentId,
      expectedRevision: current.revision,
      requestId: "inactive-font-reopen",
    },
  });
  expect(reopened.isError, reopened.message).not.toBe(true);
  await edits(page, [
    { op: "token_themes_set", themes, activeThemeId: "serif-mode" },
  ]);
  const exported = await tool(page, "export_design", { format: "png" });
  expect(await artifactBytes(page, exported.id, exported.size)).toEqual(
    referenceBytes,
  );
});

test("human token binding, alias/theme edits and undo share rendered/exported/native state", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const d = await inspect(page);
  await edits(page, [
    {
      op: "create",
      node: {
        id: "token-frame",
        type: "frame",
        pageId: d.pageId,
        name: "Themed frame",
        x: 0,
        y: 0,
        width: 160,
        height: 100,
        fill: "#ffffff",
      },
    },
  ]);
  await tool(page, "selection", { ids: ["token-frame"] });
  await page
    .getByRole("button", { name: "Design resources", exact: true })
    .click();
  await page.getByRole("tab", { name: "Tokens", exact: true }).click();
  await page.getByLabel("Token name", { exact: true }).fill("color-primary");
  await page.getByLabel("Token value", { exact: true }).fill("#124466");
  await page
    .getByLabel("Token usage note", { exact: true })
    .fill("Primary brand ink for native surfaces.");
  await page.getByRole("button", { name: "Save token", exact: true }).click();
  const catalog = await tool(page, "tokens");
  const id = catalog.tokens[0].id;
  await page.getByLabel("Token name", { exact: true }).fill("color-surface");
  await page
    .getByLabel("Token value source", { exact: true })
    .selectOption("alias");
  await page.getByLabel("Alias token", { exact: true }).selectOption(id);
  await page.getByRole("button", { name: "Save token", exact: true }).click();
  const aliasId = (await tool(page, "tokens")).tokens.find(
    (token: { name: string }) => token.name === "color-surface",
  ).id;
  await page.getByLabel("Binding token", { exact: true }).selectOption(aliasId);
  await page
    .getByRole("button", { name: "Apply binding", exact: true })
    .click();
  await page.getByLabel("Theme name", { exact: true }).fill("Dark");
  await page.getByRole("button", { name: "Add theme", exact: true }).click();
  const theme = (await tool(page, "tokens")).themes[0];
  await page.getByLabel("Theme name", { exact: true }).fill("Compact");
  await page.getByRole("button", { name: "Add theme", exact: true }).click();
  await page
    .getByRole("button", { name: "Move theme Compact earlier", exact: true })
    .click();
  expect((await tool(page, "tokens")).themes[0].name).toBe("Compact");
  await page.getByLabel("Rename theme Dark", { exact: true }).fill("Night");
  await page.getByLabel("Rename theme Dark", { exact: true }).press("Tab");
  expect(
    (await tool(page, "tokens")).themes.find(
      (item: { id: string }) => item.id === theme.id,
    ).name,
  ).toBe("Night");
  await page.getByLabel("Choose token", { exact: true }).selectOption(id);
  await page
    .getByLabel("Token value theme", { exact: true })
    .selectOption(theme.id);
  await page.getByLabel("Token value", { exact: true }).fill("#bb7733");
  await page.getByRole("button", { name: "Save token", exact: true }).click();
  await page
    .getByLabel("Document token theme", { exact: true })
    .selectOption(theme.id);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  expect((await inspect(page)).nodes[0].fill).toBe("#bb7733");
  await expect(
    page.locator(
      '[data-node-id="token-frame"] > rect[fill]:not([fill="transparent"])',
    ),
  ).toHaveAttribute("fill", "#bb7733");
  const svg = await tool(page, "export_design", {
    format: "svg",
    ids: ["token-frame"],
  });
  const svgData = await tool(page, "artifact", { action: "read", id: svg.id });
  expect(Buffer.from(svgData.base64, "base64").toString()).toContain("#bb7733");
  const css = await tool(page, "tokens", { format: "css" });
  expect(css.text).toContain("--color-primary: #bb7733;");
  await page.reload();
  await expect(page.getByTestId("canvas")).toBeVisible();
  expect((await inspect(page)).nodes[0].fill).toBe("#bb7733");
  expect((await tool(page, "tokens")).activeThemeId).toBe(theme.id);
  const tokenSnapshot = await tool(page, "tokens");
  const native = await tool(page, "export_design", { format: "native" });
  const chunks = [];
  for (let offset = 0; offset < native.size; offset += 262144)
    chunks.push(
      Buffer.from(
        (
          await tool(page, "artifact", {
            action: "read",
            id: native.id,
            offset,
          })
        ).base64,
        "base64",
      ),
    );
  const prepared = await tool(page, "import_files", {
    action: "prepare",
    name: "tokens.localdesign",
    base64: Buffer.concat(chunks).toString("base64"),
  });
  const current = await inspect(page);
  const result = await tool(page, "import_files", {
    action: "commit",
    artifactId: prepared.importId,
    guard: {
      expectedDocumentId: current.documentId,
      expectedRevision: current.revision,
      requestId: crypto.randomUUID(),
    },
  });
  expect(result.isError).not.toBe(true);
  const reopened = await tool(page, "tokens");
  expect(reopened.tokens).toEqual(tokenSnapshot.tokens);
  await edits(page, [
    { op: "token_themes_set", themes: reopened.themes, activeThemeId: null },
  ]);
  expect((await inspect(page)).nodes[0].fill).toBe("#124466");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await inspect(page)).nodes[0].fill).toBe("#bb7733");
});

for (const width of [1440, 390])
  test(`resource tabs and token controls remain keyboard accessible at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await harness(page);
    await open(page);
    await page
      .getByRole("button", { name: "Design resources", exact: true })
      .click();
    const context = page.getByRole("tab", { name: "Context", exact: true });
    await context.focus();
    await context.press("ArrowRight");
    await expect(
      page.getByRole("tab", { name: "Pages", exact: true }),
    ).toBeFocused();
    await page.getByRole("tab", { name: "Pages", exact: true }).press("End");
    await expect(
      page.getByRole("tab", { name: "Icons", exact: true }),
    ).toBeFocused();
    await page
      .getByRole("tab", { name: "Icons", exact: true })
      .press("ArrowLeft");
    await expect(
      page.getByRole("tab", { name: "Tokens", exact: true }),
    ).toBeFocused();
    await expect(
      page.getByRole("tabpanel", { name: "Tokens", exact: true }),
    ).toBeVisible();
    const dialog = page.getByRole("dialog", {
      name: "Design resources",
      exact: true,
    });
    await expect(dialog).toBeInViewport();
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.getByLabel("Token name", { exact: true }).fill("color-accent");
    await page.getByLabel("Token value", { exact: true }).fill("#385fcb");
    await page.getByRole("button", { name: "Save token", exact: true }).click();
    expect((await tool(page, "tokens")).tokens[0].name).toBe("color-accent");
    await page.getByRole("tab", { name: "Tokens", exact: true }).focus();
    await page.screenshot({
      path: info.outputPath(`resources-tokens-${width}.png`),
    });
    await page
      .getByRole("tab", { name: "Tokens", exact: true })
      .press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Design resources", exact: true }),
    ).toBeFocused();
  });
