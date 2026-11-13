import { expect, test } from "@playwright/test";
import { harness, open, inspect, edits, tool } from "./helpers";
for (const width of [1440, 390])
  test(`native prototype player navigates, overlays and preserves saved editing at ${width}px`, async ({
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
          id: "home",
          type: "frame",
          pageId: d.pageId,
          name: "Home",
          width: 320,
          height: 240,
          fill: "#ffffff",
        },
      },
      {
        op: "create",
        node: {
          id: "details",
          type: "frame",
          pageId: d.pageId,
          name: "Details",
          x: 400,
          width: 320,
          height: 240,
          fill: "#112233",
        },
      },
      {
        op: "create",
        node: {
          id: "dialog",
          type: "frame",
          pageId: d.pageId,
          name: "Confirm",
          x: 800,
          width: 160,
          height: 100,
          fill: "#ccddff",
        },
      },
      {
        op: "create",
        node: {
          id: "next",
          type: "rectangle",
          pageId: d.pageId,
          name: "Continue",
          parentId: "home",
          x: 20,
          y: 30,
          width: 120,
          height: 40,
          fill: "#112233",
        },
      },
      {
        op: "create",
        node: {
          id: "show",
          type: "rectangle",
          pageId: d.pageId,
          name: "Show dialog",
          parentId: "details",
          x: 20,
          y: 30,
          width: 120,
          height: 40,
          fill: "#ffffff",
        },
      },
      {
        op: "create",
        node: {
          id: "done",
          type: "rectangle",
          pageId: d.pageId,
          name: "Dismiss",
          parentId: "dialog",
          x: 20,
          y: 30,
          width: 100,
          height: 40,
          fill: "#112233",
        },
      },
      {
        op: "prototype_set",
        prototype: {
          entryFrameId: "home",
          interactions: [
            {
              id: "forward",
              sourceId: "next",
              action: "navigate",
              targetFrameId: "details",
            },
            {
              id: "overlay",
              sourceId: "show",
              action: "overlay",
              targetFrameId: "dialog",
              position: "bottom-right",
            },
            { id: "dismiss", sourceId: "done", action: "close_overlay" },
          ],
        },
      },
    ]);
    const revision = (await inspect(page)).revision;
    await page
      .getByRole("button", { name: "Play prototype", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Prototype player", exact: true }),
    ).toBeVisible();
    await page.locator('.prototype-stage [data-node-id="next"]').click();
    expect((await tool(page, "prototype")).player.frameId).toBe("details");
    await page
      .getByRole("button", { name: "Show dialog → Confirm", exact: true })
      .click();
    await expect(
      page.locator(".prototype-overlay.position-bottom-right"),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Dismiss → close overlay", exact: true })
      .click();
    await expect(page.locator(".prototype-overlay")).toHaveCount(0);
    await page.getByRole("button", { name: "Back", exact: true }).click();
    expect((await tool(page, "prototype")).player.frameId).toBe("home");
    expect((await inspect(page)).revision).toBe(revision);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.reload();
    await expect(page.getByTestId("canvas")).toBeVisible();
    const graph = await tool(page, "prototype");
    expect(graph.interactions).toHaveLength(3);
    expect(graph.player.open).toBe(false);
    await edits(page, [{ op: "delete", ids: ["details"] }]);
    expect((await tool(page, "prototype")).problems.length).toBeGreaterThan(0);
  });
