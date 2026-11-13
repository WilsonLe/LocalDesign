import { test, expect } from "@playwright/test";
import { harness, open, inspect, edits, tool } from "./helpers";

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1000, height: 600 },
  { width: 390, height: 640 },
  { width: 740, height: 360 },
]) {
  test(`many pages keep page navigation and layers reachable at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await harness(page);
    await open(page);
    await page.setViewportSize(viewport);
    const { pageId } = await inspect(page);
    await edits(page, [
      ...Array.from({ length: 59 }, (_, i) => ({
        op: "page_create",
        page: {
          id: `page-${i + 2}`,
          name: `Page ${i + 2}`,
          background: "#202020",
        },
      })),
      ...Array.from({ length: 40 }, (_, i) => ({
        op: "create",
        node: {
          id: `layer-${i}`,
          pageId,
          type: "rectangle",
          name: `Layer ${i + 1}`,
          y: i * 40,
          width: 20,
          height: 20,
        },
      })),
    ]);
    const before = await inspect(page);
    const toggle = page.getByRole("button", {
      name: "Pages & layers",
      exact: true,
    });
    if (await toggle.isVisible()) await toggle.click();

    // Viewport assertions prevent Playwright's automatic scrolling from hiding the defect.
    await expect(
      page.getByRole("heading", { name: "Layers", exact: true }),
    ).toBeInViewport();
    await expect(
      page.getByRole("textbox", { name: "Search layers" }),
    ).toBeInViewport();
    // Tool changes also reveal the active page, including a drawer opened later.
    const drawer = await toggle.isVisible();
    if (drawer) await toggle.click();
    await tool(page, "selection", { ids: [], pageId: "page-60" });
    if (drawer) await toggle.click();
    await expect(
      page.getByRole("button", { name: "Page 60", exact: true }),
    ).toBeInViewport();
    await tool(page, "selection", { ids: [], pageId });
    await expect(
      page.getByRole("button", { name: "Page 1", exact: true }),
    ).toBeInViewport();
    const firstLayer = page.getByRole("button", {
      name: "Select Layer 1",
      exact: true,
    });
    await expect(firstLayer).toBeInViewport();
    await firstLayer.hover();
    await page.mouse.wheel(0, 2000);
    const lastLayer = page.getByRole("button", {
      name: "Select Layer 40",
      exact: true,
    });
    await expect(lastLayer).toBeInViewport();
    await expect(
      page.getByRole("button", { name: "Add page", exact: true }),
    ).toBeInViewport();

    const firstPage = page.getByRole("button", { name: "Page 1", exact: true });
    await firstPage.hover();
    await page.mouse.wheel(0, 4000);
    const lastPage = page.getByRole("button", { name: "Page 60", exact: true });
    await expect(lastPage).toBeInViewport();
    await expect(lastLayer).toBeInViewport();
    await page.screenshot({
      path: testInfo.outputPath(`sidebar-${viewport.width}.png`),
    });
    await lastPage.click();
    expect((await inspect(page)).pageId).toBe("page-60");
    await expect(page.getByText("No layers", { exact: true })).toBeInViewport();

    // Keyboard focus must scroll a clipped page into view without moving Layers away.
    await firstPage.focus();
    await expect(firstPage).toBeInViewport();
    await firstPage.press("Enter");
    expect((await inspect(page)).pageId).toBe(pageId);
    await page.getByRole("textbox", { name: "Search layers" }).fill("Layer 40");
    await expect(lastLayer).toBeInViewport();
    await lastLayer.focus();
    await lastLayer.press("Enter");
    const after = await inspect(page);
    expect(after.selection).toEqual(["layer-39"]);
    expect(after.nodes).toEqual(before.nodes);
    expect(after.revision).toBe(before.revision);
    expect(after.history).toEqual(before.history);
    if (viewport.width <= 850) {
      await expect(page.locator(".left-panel")).toBeHidden();
      await expect(page.getByTestId("canvas")).toBeFocused();
      await toggle.click();
    }
    await page.getByRole("button", { name: "Add page", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Page 61", exact: true }),
    ).toBeInViewport();
    await expect(page.getByText("No layers", { exact: true })).toBeInViewport();
    await page
      .getByRole("button", { name: "Delete Page 61", exact: true })
      .click();
    expect((await inspect(page)).pages).toHaveLength(60);
    await expect(
      page.getByRole("textbox", { name: "Search layers" }),
    ).toBeInViewport();
  });
}
