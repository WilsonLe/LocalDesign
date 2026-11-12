import { test, expect, type Page } from "@playwright/test";
import { harness, open, tool, inspect, edits } from "./helpers";

async function activate(
  page: Page,
  name: string,
  keyboard = false,
  shift = false,
) {
  const toggle = page.getByRole("button", {
    name: "Pages & layers",
    exact: true,
  });
  if (await toggle.isVisible()) await toggle.click();
  const row = page.getByRole("button", { name: `Select ${name}`, exact: true });
  if (keyboard) {
    await row.focus();
    await row.press(shift ? "Shift+Enter" : "Enter");
  } else await row.click({ modifiers: shift ? ["Shift"] : [] });
}
async function visibleAndClear(page: Page, id: string) {
  const item = await page.locator(`[data-node-id="${id}"]`).boundingBox();
  const canvas = await page.getByTestId("canvas").boundingBox();
  expect(item).toBeTruthy();
  expect(canvas).toBeTruthy();
  expect(item!.x).toBeGreaterThanOrEqual(canvas!.x + 23);
  expect(item!.x + item!.width).toBeLessThanOrEqual(
    canvas!.x + canvas!.width - 23,
  );
  expect(item!.y).toBeGreaterThanOrEqual(canvas!.y + 23);
  for (const selector of [
    ".floating-tools",
    ".zoom-controls",
    ".help-button",
  ]) {
    const control = await page.locator(selector).boundingBox();
    expect(item!.y + item!.height).toBeLessThanOrEqual(control!.y - 15);
  }
}
async function profile(page: Page) {
  const { pageId } = await inspect(page);
  // Deliberately arbitrary paint order, with overlap and auto-layout inside sections.
  await edits(page, [
    ...[3, 1, 0, 2].map((i) => ({
      op: "create",
      node: {
        id: `section-${i}`,
        name: ["Hero", "Selected work", "Get in touch", "Footer"][i],
        type: "frame",
        pageId,
        x: 1400,
        y: i * 2400,
        width: 600,
        height: 1600,
        fill: "#ffffff",
        layout: { direction: "vertical", gap: 24, padding: 24, align: "start" },
      },
    })),
    {
      op: "create",
      node: {
        id: "heading",
        name: "Work heading",
        type: "text",
        pageId,
        parentId: "section-1",
        width: 400,
        height: 100,
        text: "Selected work",
        fontSize: 32,
      },
    },
    {
      op: "create",
      node: {
        id: "card",
        name: "Work card",
        type: "rectangle",
        pageId,
        parentId: "section-1",
        width: 400,
        height: 900,
        fill: "#555555",
      },
    },
    {
      op: "create",
      node: {
        id: "nested",
        name: "Rotated workspace",
        type: "frame",
        pageId,
        x: 16000,
        y: 14000,
        width: 800,
        height: 800,
        rotation: 30,
        fill: "#ffffff",
      },
    },
    {
      op: "create",
      node: {
        id: "target",
        name: "Rotated target",
        type: "rectangle",
        pageId,
        parentId: "nested",
        x: 100,
        y: 120,
        width: 180,
        height: 100,
        rotation: 25,
        fill: "#888888",
      },
    },
  ]);
}
for (const width of [1440, 1000, 390]) {
  test(`layer activation reveals tall profile and rotated workspace at ${width}px without edits`, async ({
    page,
  }, testInfo) => {
    await harness(page);
    await open(page);
    await page.setViewportSize({ width, height: 900 });
    await profile(page);
    const initial = await inspect(page);
    await tool(page, "viewport", { x: -30000, y: -30000, zoom: 1.25 });
    await activate(page, "Selected work");
    await visibleAndClear(page, "section-1");
    const focused = await inspect(page);
    expect(focused.selection).toEqual(["section-1"]);
    expect(focused.viewport.zoom).toBeLessThan(1.25);
    await activate(page, "Selected work");
    expect((await inspect(page)).viewport).toEqual(focused.viewport);
    if (width === 390) {
      await expect(page.locator(".left-panel")).toBeHidden();
      await expect(page.getByTestId("canvas")).toBeFocused();
    }
    await tool(page, "viewport", { x: -30000, y: -30000, zoom: 1.25 });
    await activate(page, "Rotated target", true, true);
    await visibleAndClear(page, "target");
    const shifted = await inspect(page);
    expect(shifted.selection).toEqual(["section-1", "target"]);
    expect(shifted.viewport.zoom).toBe(1.25);
    await activate(page, "Rotated target", false, true);
    const final = await inspect(page);
    expect(final.selection).toEqual(["section-1"]);
    expect(final.viewport).toEqual(shifted.viewport);
    expect(final.nodes).toEqual(initial.nodes);
    expect(final.revision).toBe(initial.revision);
    expect(final.history).toEqual(initial.history);
    if (width === 1440) {
      await activate(page, "Selected work");
      await page.screenshot({
        path: testInfo.outputPath("layers-desktop.png"),
      });
    }
    if (width === 390)
      await page.screenshot({
        path: testInfo.outputPath("layers-mobile.png"),
      });
  });
}

test("reading-order display and auxiliary controls preserve scene stacking, layout and camera", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  await profile(page);
  const { pageId } = await inspect(page);
  await edits(page, [
    {
      op: "create",
      node: {
        id: "tie-right",
        name: "Right first",
        type: "rectangle",
        pageId,
        parentId: "nested",
        x: 200,
        y: 0,
        width: 20,
        height: 20,
      },
    },
    {
      op: "create",
      node: {
        id: "tie-left",
        name: "Left first",
        type: "rectangle",
        pageId,
        parentId: "nested",
        x: 0,
        y: 0,
        width: 20,
        height: 20,
      },
    },
    {
      op: "create",
      node: {
        id: "tie-right2",
        name: "Right tie",
        type: "rectangle",
        pageId,
        parentId: "nested",
        x: 200,
        y: 0,
        width: 20,
        height: 20,
      },
    },
    { op: "update", ids: ["nested"], patch: { rotation: 0 } },
  ]);
  const before = await inspect(page);
  const names = await page.locator(".layer-select").allTextContents();
  expect(names.slice(0, 6)).toEqual([
    "Hero",
    "Selected work",
    "Work heading",
    "Work card",
    "Get in touch",
    "Footer",
  ]);
  expect(names.slice(7)).toEqual([
    "Left first",
    "Right first",
    "Right tie",
    "Rotated target",
  ]);
  // Mount the complete scene to check paint order, then restore the original camera.
  await tool(page, "viewport", { fit: "page", width: 1000, height: 700 });
  // Paint order is the original scene order, independent of panel order.
  const paint = await page
    .locator(".canvas [data-node-id]")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-node-id")));
  expect(paint.slice(0, 3)).toEqual(["section-3", "section-1", "heading"]);
  await tool(page, "viewport", before.viewport);
  await page
    .getByRole("button", { name: "Collapse Selected work", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Select Work card", exact: true }),
  ).toBeHidden();
  await page
    .getByRole("button", { name: "Expand Selected work", exact: true })
    .click();
  await page.getByRole("button", { name: "Hide Footer", exact: true }).click();
  await page.getByRole("button", { name: "Lock Footer", exact: true }).click();
  const toggled = await inspect(page);
  expect(toggled.viewport).toEqual(before.viewport);
  expect(toggled.selection).toEqual(before.selection);
  await activate(page, "Footer");
  const focused = await inspect(page);
  expect(focused.nodes).toEqual(toggled.nodes);
  expect(focused.nodes.find((n: any) => n.id === "section-3")).toMatchObject({
    hidden: true,
    locked: true,
  });
  expect(focused.revision).toBe(toggled.revision);
  // Ordinary canvas selection has no camera side effects.
  await activate(page, "Rotated target");
  const view = (await inspect(page)).viewport;
  await page.locator('[data-node-id="target"]').click();
  expect((await inspect(page)).viewport).toEqual(view);
});

test("groups and clipped/unclipped frames focus their existing visible bounds", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const { pageId } = await inspect(page);
  await edits(page, [
    {
      op: "create",
      node: {
        id: "group",
        name: "Wide group",
        type: "group",
        pageId,
        x: 5000,
        y: 8000,
        width: 10,
        height: 10,
      },
    },
    {
      op: "create",
      node: {
        id: "left",
        name: "Left",
        type: "rectangle",
        pageId,
        parentId: "group",
        x: -600,
        y: -200,
        width: 100,
        height: 100,
      },
    },
    {
      op: "create",
      node: {
        id: "right",
        name: "Right",
        type: "rectangle",
        pageId,
        parentId: "group",
        x: 900,
        y: 400,
        width: 100,
        height: 100,
      },
    },
    {
      op: "create",
      node: {
        id: "clip",
        name: "Clipped frame",
        type: "frame",
        pageId,
        x: 10000,
        y: 9000,
        width: 160,
        height: 160,
        clip: true,
      },
    },
    {
      op: "create",
      node: {
        id: "outside",
        name: "Outside",
        type: "rectangle",
        pageId,
        parentId: "clip",
        x: 900,
        y: 400,
        width: 100,
        height: 100,
      },
    },
  ]);
  await activate(page, "Wide group");
  await visibleAndClear(page, "left");
  await visibleAndClear(page, "right");
  await tool(page, "viewport", { zoom: 1 });
  await activate(page, "Clipped frame");
  expect((await inspect(page)).viewport.zoom).toBe(1);
  // Its child outside the clipping region must not force a zoom-out.
  await edits(page, [{ op: "update", ids: ["clip"], patch: { clip: false } }]);
  await activate(page, "Clipped frame");
  await visibleAndClear(page, "outside");
  expect((await inspect(page)).viewport.zoom).toBeLessThan(1);
});

test("Space activation and disabled collapse hit targets retain button semantics", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  await profile(page);
  await tool(page, "viewport", { x: 0, y: 0, zoom: 1 });
  await tool(page, "selection", { ids: [] });
  const before = await inspect(page);
  const disabled = await page
    .getByRole("button", { name: "Collapse Rotated target", exact: true })
    .boundingBox();
  // A real pointer can land here even though Playwright locator.click rejects disabled buttons.
  await page.mouse.click(
    disabled!.x + disabled!.width / 2,
    disabled!.y + disabled!.height / 2,
  );
  expect((await inspect(page)).viewport).toEqual(before.viewport);
  expect((await inspect(page)).selection).toEqual([]);
  const row = page.getByRole("button", {
    name: "Select Rotated target",
    exact: true,
  });
  await row.focus();
  await row.press("Space");
  await visibleAndClear(page, "target");
  expect((await inspect(page)).selection).toEqual(["target"]);
  await page
    .getByRole("button", { name: "Select Footer", exact: true })
    .press("Shift+Space");
  expect((await inspect(page)).selection).toEqual(["target", "section-3"]);
  const after = await inspect(page);
  expect(after.nodes).toEqual(before.nodes);
  expect(after.revision).toBe(before.revision);
  expect(after.history).toEqual(before.history);
  // Space still pans when the canvas has focus.
  await tool(page, "viewport", { x: 0, y: 0, zoom: 1 });
  await page.getByTestId("canvas").focus();
  await page.keyboard.down("Space");
  const box = (await page.getByTestId("canvas").boundingBox())!;
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 140);
  await page.mouse.up();
  await page.keyboard.up("Space");
  expect((await inspect(page)).viewport).toEqual({ x: 60, y: 40, zoom: 1 });
});
