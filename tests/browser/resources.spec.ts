import { expect, test } from "@playwright/test";
import { harness, open, inspect, edits } from "./helpers";
for (const width of [1440, 850, 390, 320])
  test(`all resource panels retain visible fields inside the shared dialog at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await harness(page);
    await open(page);
    const d = await inspect(page);
    const longName =
      "A portable native resource with a deliberately long descriptive name ".repeat(
        2,
      );
    await edits(page, [
      {
        op: "create",
        node: {
          id: "resource-frame",
          name: longName,
          type: "frame",
          pageId: d.pageId,
          width: 400,
          height: 200,
        },
      },
      {
        op: "create",
        node: {
          id: "resource-label",
          name: "Label",
          type: "text",
          pageId: d.pageId,
          parentId: "resource-frame",
          text: "Native resource",
        },
      },
      {
        op: "component_capture",
        id: "resource-component",
        name: longName,
        rootId: "resource-frame",
      },
      {
        op: "guideline_set",
        guideline: {
          id: "guide",
          name: longName,
          content: "Retain the visible resource fields.",
        },
      },
      {
        op: "handoff_request",
        handoff: {
          id: "handoff",
          frameId: "resource-frame",
          requestedBy: "Fixture",
          note: "Pending review",
        },
      },
    ]);
    for (const theme of ["light", "dark"]) {
      if (theme === "dark")
        await page
          .getByRole("button", { name: "Switch to dark theme", exact: true })
          .click();
      await page
        .getByRole("button", { name: "Design resources", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Design resources",
        exact: true,
      });
      for (const name of [
        "Context",
        "Pages",
        "Tokens",
        "Icons",
        "Components",
        "History",
        "Review",
        "Prototype",
        "Packages",
        "Handoff",
      ]) {
        await dialog.getByRole("tab", { name, exact: true }).click();
        const layout = await dialog.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return {
            width: el.clientWidth,
            scrollWidth: el.scrollWidth,
            scrollLeft: el.scrollLeft,
            overflow: [...el.querySelectorAll("*")]
              .filter(
                (n) =>
                  !n.closest(".resource-tabs") &&
                  n.getBoundingClientRect().right > r.left + el.clientWidth + 1,
              )
              .map((n) => ({
                tag: n.tagName,
                width: n.getBoundingClientRect().width,
                text: n.textContent?.slice(0, 90),
              })),
            fields: [...el.querySelectorAll("input,select,textarea")]
              .filter((n) => n.getClientRects().length)
              .map((n) => ({
                left: n.getBoundingClientRect().left - r.left,
                right: n.getBoundingClientRect().right - r.left,
              })),
          };
        });
        expect(
          layout.scrollWidth,
          `${name} ${theme} ${JSON.stringify(layout.overflow)}`,
        ).toBeLessThanOrEqual(layout.width + 1);
        expect(layout.scrollLeft, `${name} ${theme}`).toBe(0);
        for (const field of layout.fields) {
          expect(field.left, `${name} left`).toBeGreaterThanOrEqual(0);
          expect(field.right, `${name} right`).toBeLessThanOrEqual(
            layout.width + 1,
          );
        }
      }
      await dialog
        .getByRole("tab", { name: "Components", exact: true })
        .click();
      await page.screenshot({
        path: info.outputPath(`resources-${theme}-${width}.png`),
      });
      await dialog
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
    }
  });
