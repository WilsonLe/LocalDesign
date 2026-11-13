import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { harness, open, inspect, edits, tool } from "./helpers";

test("shared primary controls and themed blank pages preserve artwork and exports", async ({
  page,
}) => {
  await harness(page);
  await page.goto("./");
  const create = page.getByRole("button", {
    name: "New blank design",
    exact: true,
  });
  await expect(create).toHaveAttribute("data-variant", "default");
  await expect(create).toHaveCSS("font-size", "14px");
  await expect(create).toHaveCSS("height", "36px");
  await create.click();
  const first = await inspect(page);
  expect(first.pages[0].background).toBe("none");
  const colors = () =>
    page.evaluate(() => ({
      shell: getComputedStyle(document.documentElement).backgroundColor,
      canvas: getComputedStyle(
        document.querySelector('[data-testid="canvas"]')!,
      ).backgroundColor,
    }));
  let surface = await colors();
  expect(surface.canvas).toBe(surface.shell);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByTestId("canvas").click({ position: { x: 140, y: 140 } });
  await page.getByLabel("Text content").fill("Theme-independent artwork");
  await page.getByLabel("Text content").press("Tab");
  const light = await inspect(page);
  expect(light.nodes[0].fill).toBe("#171717");
  async function exported() {
    const artifact = await tool(page, "export_design", { format: "svg" });
    expect(artifact.isError, artifact.message).not.toBe(true);
    return (await tool(page, "artifact", { id: artifact.id, action: "read" }))
      .base64;
  }
  const lightSVG = await exported();
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  surface = await colors();
  expect(surface.canvas).toBe(surface.shell);
  expect(surface.shell).not.toBe("rgb(255, 255, 255)");
  expect(await inspect(page)).toEqual(light);
  expect(await exported()).toBe(lightSVG);
  await page.getByRole("button", { name: "Add page", exact: true }).click();
  expect((await inspect(page)).pages[1].background).toBe("none");
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByTestId("canvas").click({ position: { x: 140, y: 140 } });
  expect((await inspect(page)).nodes[1].fill).toBe("#f5f5f5");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Switch to light theme" }),
  ).toBeVisible();
  await expect(page.getByTestId("canvas")).toBeVisible();
  expect((await inspect(page)).nodes[0].text).toBe("Theme-independent artwork");
  const current = await inspect(page);
  await edits(page, [
    { op: "page_update", id: current.pageId, patch: { background: "#123456" } },
  ]);
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.getByTestId("canvas")).toHaveCSS(
    "background-color",
    "rgb(18, 52, 86)",
  );
  await page
    .getByRole("button", { name: "Use app theme", exact: true })
    .click();
  surface = await colors();
  expect(surface.canvas).toBe(surface.shell);
});

test("workspace deletion uses a focused cancel-safe confirmation with failure and retry", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  await edits(page, [{ op: "rename", name: "Disposable workspace" }]);
  await page.getByRole("button", { name: "Workspaces", exact: true }).click();
  const trigger = page.getByRole("button", {
    name: "Delete Disposable workspace",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("alertdialog", {
    name: "Delete workspace?",
    exact: true,
  });
  await expect(dialog).toContainText("Disposable workspace");
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(trigger).toBeFocused();
  expect(
    (await tool(page, "workspace", { action: "list" })).documents,
  ).toHaveLength(1);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.delete;
    let fail = true;
    IDBObjectStore.prototype.delete = function (...args) {
      if (this.name === "documents" && fail) {
        fail = false;
        throw new Error("Simulated storage failure");
      }
      return original.apply(this, args);
    };
  });
  await trigger.click();
  const confirm = dialog.getByRole("button", {
    name: "Delete workspace",
    exact: true,
  });
  await confirm.click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Simulated storage failure",
  );
  await expect(confirm).toBeEnabled();
  expect(
    (await tool(page, "workspace", { action: "list" })).documents,
  ).toHaveLength(1);
  await confirm.click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText("No workspaces yet", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Workspaces", exact: true }),
  ).toBeFocused();
  expect((await tool(page, "workspace", { action: "list" })).documents).toEqual(
    [],
  );
});

for (const width of [1440, 885, 390]) {
  test(`shared controls and dialogs fit light/dark at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    const evidence = process.env.LOCALDESIGN_EVIDENCE_DIR;
    for (const theme of ["light", "dark"]) {
      if (theme === "dark")
        await page
          .getByRole("button", { name: "Switch to dark theme" })
          .click();
      const foreground = await page.evaluate(
        () => getComputedStyle(document.documentElement).color,
      );
      await expect(
        page.getByRole("button", { name: "Hand", exact: true }),
      ).toHaveCSS("color", foreground);
      if (width > 850)
        await expect(
          page.getByRole("button", { name: "Close layers", exact: true }),
        ).toBeHidden();
      else {
        const name = (await page
          .getByLabel("Design name", { exact: true })
          .boundingBox())!;
        expect(name.width).toBeGreaterThanOrEqual(70);
        await expect(
          page.getByRole("button", { name: "Pages & layers", exact: true }),
        ).toBeVisible();
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (evidence) {
        await mkdir(evidence, { recursive: true });
        await page.screenshot({
          path: join(evidence, `editor-${theme}-${width}.png`),
        });
      }
    }
    await page.getByRole("button", { name: "Workspaces", exact: true }).click();
    await page
      .getByRole("button", { name: "Delete Untitled design", exact: true })
      .click();
    const dialog = page.getByRole("alertdialog");
    await expect(
      dialog.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      dialog.getByRole("button", { name: "Delete workspace", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      dialog.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeFocused();
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    if (evidence)
      await page.screenshot({
        path: join(evidence, `delete-dark-${width}.png`),
      });
  });
}
