import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { harness, open, inspect, edits, tool, artifactBytes } from "./helpers";
const guard = (d: any) => ({
  expectedDocumentId: d.documentId,
  expectedRevision: d.revision,
  requestId: crypto.randomUUID(),
});
test("portable component packages carry nested/image/font/theme closure and explicitly sync stable instances", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const start = await inspect(page),
    sourceId = start.documentId;
  const font = await tool(page, "import_font", {
    ...guard(start),
    name: "SourceSerif4-Regular.otf",
    base64: readFileSync(
      "tests/fixtures/fonts/SourceSerif4-Regular.otf",
    ).toString("base64"),
    license: "SIL OFL 1.1",
    redistributionAllowed: true,
  });
  expect(font.isError, font.message).not.toBe(true);
  await edits(page, [
    {
      op: "token_themes_set",
      themes: [{ id: "dark", name: "Dark" }],
      activeThemeId: "dark",
    },
    {
      op: "token_set",
      token: {
        id: "ink",
        name: "ink",
        type: "color",
        value: "#112233",
        themes: { dark: "#ccddee" },
      },
    },
    {
      op: "create",
      node: {
        id: "source",
        type: "frame",
        pageId: start.pageId,
        name: "Button source",
        width: 200,
        height: 100,
        bindings: { fill: "ink" },
      },
    },
    {
      op: "create",
      node: {
        id: "label",
        type: "text",
        parentId: "source",
        pageId: start.pageId,
        name: "Label",
        text: "Bundle",
        fontId: font.font.id,
        fontFamily: "Source Serif 4",
        x: 12,
        y: 20,
        width: 170,
        height: 50,
      },
    },
  ]);
  const current = await inspect(page);
  const raster = await tool(page, "import_asset", {
    ...guard(current),
    name: "Bundle pixel",
    base64:
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
    place: {
      pageId: start.pageId,
      parentId: "source",
      x: 160,
      y: 10,
      width: 20,
      height: 20,
    },
  });
  expect(raster.isError, raster.message).not.toBe(true);
  await edits(page, [
    {
      op: "component_capture",
      id: "button",
      rootId: "source",
      name: "Button",
      properties: [
        {
          name: "label",
          type: "text",
          defaultValue: "Bundle",
          bindings: [{ partId: "label", field: "text" }],
        },
      ],
    },
    {
      op: "create",
      node: {
        id: "wrapper-source",
        type: "frame",
        name: "Wrapper source",
        pageId: start.pageId,
        x: 300,
        width: 240,
        height: 140,
      },
    },
    {
      op: "component_instance",
      id: "nested",
      componentId: "button",
      pageId: start.pageId,
      parentId: "wrapper-source",
      x: 10,
      y: 10,
    },
    {
      op: "component_capture",
      id: "wrapper",
      rootId: "wrapper-source",
      name: "Wrapper",
    },
  ]);
  const exported = await tool(page, "component_packages", {
    action: "export",
    rootIds: ["wrapper"],
    originId: "portable-test",
    version: 1,
  });
  expect(exported.isError, exported.message).not.toBe(true);
  const bytes = await artifactBytes(page, exported.id, exported.size);
  const sourceState = await inspect(page);
  await tool(page, "workspace", {
    action: "create",
    name: "Package destination",
    guard: guard(sourceState),
  });
  const dest = (await inspect(page)).documentId;
  await page
    .getByRole("button", { name: "Design resources", exact: true })
    .click();
  await page.getByRole("tab", { name: "Packages", exact: true }).click();
  await page
    .getByLabel("Component package file", { exact: true })
    .setInputFiles({
      name: "buttons.localcomponents",
      mimeType: "application/x-localdesign-components",
      buffer: bytes,
    });
  await page
    .getByRole("button", { name: "Review package changes", exact: true })
    .click();
  await expect(page.getByText(/2 definitions added/)).toBeVisible();
  await page
    .getByRole("button", { name: "Apply package changes", exact: true })
    .click();
  const installed = (await tool(page, "component_packages")).sources[0];
  expect(Object.keys(installed.componentMap)).toHaveLength(2);
  expect(installed.assetCount).toBe(1);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  let destination = await inspect(page);
  await edits(page, [
    {
      op: "component_instance",
      id: "usage",
      componentId: installed.componentMap.wrapper,
      pageId: destination.pageId,
    },
  ]);
  destination = await inspect(page);
  expect(destination.nodes.some((n: any) => n.text === "Bundle")).toBe(true);
  expect(
    destination.fonts.some(
      (f: any) => f.source === "local" && f.family === "Source Serif 4",
    ),
  ).toBe(true);
  await tool(page, "selection", { ids: ["usage"] });
  await page.getByTestId("canvas").focus();
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+v");
  await expect
    .poll(
      async () =>
        (await inspect(page)).nodes.filter(
          (n: any) =>
            n.component?.componentId === installed.componentMap.wrapper,
        ).length,
    )
    .toBe(2);
  await tool(page, "workspace", {
    action: "open",
    id: sourceId,
    guard: guard(await inspect(page)),
  });
  const definition = await tool(page, "components", {
    action: "get",
    id: "button",
  });
  await edits(page, [
    {
      op: "component_set",
      id: "button",
      expectedComponentRevision: definition.revision,
      nodes: definition.nodes.map((n: any) =>
        n.id === "source" ? { ...n, width: 220 } : n,
      ),
    },
  ]);
  const v2 = await tool(page, "component_packages", {
    action: "export",
    rootIds: ["wrapper"],
    originId: "portable-test",
    version: 2,
  });
  const updateBytes = await artifactBytes(page, v2.id, v2.size);
  await tool(page, "workspace", {
    action: "open",
    id: dest,
    guard: guard(await inspect(page)),
  });
  const prepared = await tool(page, "component_packages", {
    action: "prepare",
    base64: updateBytes.toString("base64"),
  });
  expect(prepared.isError, prepared.message).not.toBe(true);
  const before = await inspect(page),
    request = {
      action: "diff",
      importId: prepared.importId,
      mode: "sync",
      pageId: before.pageId,
      guard: guard(before),
    };
  const diff = await tool(page, "component_packages", request);
  expect(diff.isError, diff.message).not.toBe(true);
  expect(
    diff.libraryImpact.changes.some((change: any) =>
      change.parts.some((part: any) => part.fields.includes("width")),
    ),
  ).toBe(true);
  const committed = await tool(page, "component_packages", {
    ...request,
    action: "commit",
  });
  expect(committed.isError, committed.message).not.toBe(true);
  expect(
    await tool(page, "component_packages", { ...request, action: "commit" }),
  ).toEqual(committed);
  const after = await inspect(page);
  expect(
    after.nodes.find((n: any) => n.id === "usage")?.component.componentId,
  ).toBe(installed.componentMap.wrapper);
  expect(
    after.nodes.some(
      (n: any) => n.componentPart?.instanceId === "usage" && n.width === 220,
    ),
  ).toBe(true);
});
