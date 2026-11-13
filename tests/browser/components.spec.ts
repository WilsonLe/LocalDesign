import { expect, test } from "@playwright/test";
import { harness, open, inspect, edits, tool, artifactBytes } from "./helpers";

for (const width of [1440, 390])
  test(`components publish, properties, previews and native reopen at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    await harness(page);
    await open(page);
    const d = await inspect(page);
    await edits(page, [
      {
        op: "create",
        node: {
          id: "source",
          type: "frame",
          name: "Button",
          pageId: d.pageId,
          width: 180,
          height: 60,
          fill: "#112233",
        },
      },
      {
        op: "create",
        node: {
          id: "label",
          type: "text",
          name: "Label",
          pageId: d.pageId,
          parentId: "source",
          text: "Buy",
          x: 12,
          y: 12,
          width: 150,
          height: 32,
          fill: "#ffffff",
        },
      },
    ]);
    await tool(page, "selection", { ids: ["source"] });
    await page
      .getByRole("button", { name: "Design resources", exact: true })
      .click();
    await page.getByRole("tab", { name: "Components", exact: true }).click();
    await page.getByLabel("Component name", { exact: true }).fill("Button");
    await page
      .getByRole("button", { name: "Review library change", exact: true })
      .click();
    await expect(
      page.getByText("0 instances affected", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Apply library change", exact: true })
      .click();
    let catalog = await tool(page, "components");
    expect(catalog.components).toHaveLength(1);
    const id = catalog.components[0].id;
    const definition = await tool(page, "components", { action: "get", id });
    await edits(page, [
      {
        op: "component_set",
        id,
        expectedComponentRevision: definition.revision,
        properties: [
          {
            name: "label",
            type: "text",
            defaultValue: "Continue",
            bindings: [{ partId: "label", field: "text" }],
          },
        ],
        variants: [],
      },
    ]);
    await page
      .getByRole("button", { name: "Insert instance", exact: true })
      .click();
    const state = await inspect(page);
    const instance = state.nodes.find(
      (n: any) => n.component?.componentId === id,
    );
    expect(instance).toBeTruthy();
    if (width === 390)
      await page
        .getByRole("button", { name: "Properties", exact: true })
        .click();
    await page.getByLabel("label", { exact: true }).fill("Checkout");
    await page.getByLabel("label", { exact: true }).press("Tab");
    const after = await inspect(page);
    expect(
      after.nodes.find((n: any) => n.componentPart?.instanceId === instance.id)
        ?.text,
    ).toBe("Checkout");
    const preview = await tool(page, "components", {
      action: "preview",
      id,
      properties: { label: "Preview" },
    });
    expect(preview.content[0].data.length).toBeGreaterThan(100);
    const matrix = await tool(page, "components", {
      action: "preview_variants",
      id,
    });
    expect(matrix.states[0].name).toBe("Default");
    expect(matrix.content[0].data.length).toBeGreaterThan(100);
    const native = await tool(page, "export_design", { format: "native" });
    const bytes = await artifactBytes(page, native.id, native.size);
    const prepared = await tool(page, "import_files", {
      action: "prepare",
      name: "components.localdesign",
      base64: bytes.toString("base64"),
    });
    const current = await inspect(page);
    const committed = await tool(page, "import_files", {
      action: "commit",
      artifactId: prepared.importId,
      guard: {
        expectedDocumentId: current.documentId,
        expectedRevision: current.revision,
        requestId: "reopen-components",
      },
    });
    expect(committed.isError, committed.message).not.toBe(true);
    expect(
      (await inspect(page)).nodes.find(
        (n: any) => n.componentPart?.instanceId === instance.id,
      )?.text,
    ).toBe("Checkout");
  });
