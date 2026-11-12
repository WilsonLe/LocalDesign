import { test, expect } from "@playwright/test";
import { harness, open, inspect, edits, tool } from "./helpers";

async function workspaceAction(
  page: Parameters<typeof tool>[0],
  action: string,
  extra = {},
) {
  const d = await tool(page, "workspace");
  const result = await tool(page, "workspace", {
    action,
    ...extra,
    guard: {
      expectedDocumentId: d.documentId,
      expectedRevision: d.revision,
      requestId: crypto.randomUUID(),
    },
  });
  expect(result.isError, result.message).not.toBe(true);
  return result;
}

test("root lists workspaces without creating one; editor links reload the saved design", async ({
  page,
}) => {
  await harness(page);
  await page.goto("./");
  await expect(
    page.getByText("No workspaces yet", { exact: true }),
  ).toBeVisible();
  expect((await tool(page, "workspace")).documentOpen).toBe(false);
  expect((await tool(page, "workspace", { action: "list" })).documents).toEqual(
    [],
  );
  expect((await tool(page, "list_skills")).skills).toHaveLength(3);
  const d = await inspect(page);
  expect(
    (
      await tool(page, "apply_edits", {
        expectedDocumentId: d.documentId,
        expectedRevision: d.revision,
        requestId: "no-document",
        commands: [{ op: "rename", name: "Must not save" }],
      })
    ).code,
  ).toBe("NO_DOCUMENT");
  await page
    .getByRole("button", { name: "New blank design", exact: true })
    .click();
  await expect(page.getByTestId("canvas")).toBeVisible();
  const first = await inspect(page);
  await expect(page).toHaveURL(
    new RegExp(`/LocalDesign/workspace/${first.documentId}$`),
  );
  await page.getByLabel("Design name", { exact: true }).fill("Saved project");
  await page.getByLabel("Design name", { exact: true }).press("Enter");
  await edits(page, [
    {
      op: "create",
      node: {
        type: "rectangle",
        id: "saved-rectangle",
        name: "Saved rectangle",
        pageId: first.pageId,
        x: 10,
        y: 10,
      },
    },
  ]);
  await page.getByRole("button", { name: "Workspaces", exact: true }).click();
  await expect(page).toHaveURL(/\/LocalDesign\/$/);
  await expect(
    page.getByRole("link", { name: "Saved project", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Workspaces", exact: true }),
  ).toBeFocused();
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Saved project", exact: true }),
  ).toBeVisible();
  expect(
    (await tool(page, "workspace", { action: "list" })).documents,
  ).toHaveLength(1);
  await page
    .getByRole("link", { name: "Saved project", exact: true })
    .press("Enter");
  await expect(page.getByTestId("canvas")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Design name", { exact: true })).toHaveValue(
    "Saved project",
  );
  const reopened = await inspect(page);
  expect(reopened.documentId).toBe(first.documentId);
  expect(reopened.nodes.map((n: { id: string }) => n.id)).toContain(
    "saved-rectangle",
  );
});

test("Back and Forward restore the list and the workspace named by the URL", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const first = await inspect(page);
  await edits(page, [{ op: "rename", name: "First workspace" }]);
  await page
    .getByRole("button", { name: "Open workspace", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "First workspace" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "New blank design", exact: true })
    .click();
  await expect(page.getByTestId("canvas")).toBeVisible();
  const second = await inspect(page);
  await edits(page, [{ op: "rename", name: "Second workspace" }]);
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Workspaces", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link")).toHaveCount(2);
  await page.goBack();
  await expect(page.getByLabel("Design name", { exact: true })).toHaveValue(
    "First workspace",
  );
  expect((await inspect(page)).documentId).toBe(first.documentId);
  await page.goForward();
  await expect(
    page.getByRole("heading", { name: "Workspaces", exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(page.getByLabel("Design name", { exact: true })).toHaveValue(
    "Second workspace",
  );
  expect((await inspect(page)).documentId).toBe(second.documentId);
  await expect(page).toHaveURL(new RegExp(`/workspace/${second.documentId}$`));
});

test("tool switches, copies, close, root imports and deletion use the same routes", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const first = await inspect(page);
  await edits(page, [{ op: "rename", name: "Original workspace" }]);
  const created = await workspaceAction(page, "create", {
    name: "Agent workspace",
  });
  await expect(page).toHaveURL(new RegExp(`/workspace/${created.documentId}$`));
  const copied = await workspaceAction(page, "save_copy");
  await expect(page).toHaveURL(new RegExp(`/workspace/${copied.documentId}$`));
  await workspaceAction(page, "open", { id: first.documentId });
  await expect(page.getByLabel("Design name", { exact: true })).toHaveValue(
    "Original workspace",
  );
  await page.evaluate(() => {
    (window as any).__retired = (window as any).__testSiteTools.get(
      "localdesign_apply_edits",
    );
  });
  await workspaceAction(page, "close");
  await expect(page).toHaveURL(/\/LocalDesign\/$/);
  expect((await tool(page, "workspace")).documentOpen).toBe(false);
  expect(
    await page.evaluate(
      async () => (await (window as any).__retired.execute({})).code,
    ),
  ).toBe("DISPOSED");
  await page.getByLabel("Import design file", { exact: true }).setInputFiles({
    name: "Imported.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><rect width="100" height="80" fill="#ff0000"/></svg>',
    ),
  });
  await expect(page.getByTestId("canvas")).toBeVisible();
  const imported = await inspect(page);
  await expect(page).toHaveURL(
    new RegExp(`/workspace/${imported.documentId}$`),
  );
  await workspaceAction(page, "close");
  await expect(
    page.getByRole("link", { name: "Original workspace", exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete Original workspace", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Original workspace", exact: true }),
  ).toHaveCount(0);
  expect(
    (await tool(page, "workspace", { action: "list" })).documents,
  ).toHaveLength(3);
});

test("unknown or unavailable workspace paths never open the last saved document", async ({
  page,
  context,
}) => {
  await harness(page);
  await open(page);
  const first = await inspect(page);
  await edits(page, [{ op: "rename", name: "Keep existing work" }]);
  await expect(page.locator(".save-state")).toContainText("Saved locally");
  const missing = await context.newPage();
  await harness(missing);
  await missing.goto("workspace/not-saved-here");
  await expect(missing.getByRole("alert")).toContainText("Unknown document");
  await expect(missing.getByTestId("canvas")).toHaveCount(0);
  await expect(
    missing.getByRole("link", { name: "Keep existing work", exact: true }),
  ).toBeVisible();
  expect((await tool(missing, "workspace")).documentOpen).toBe(false);
  await missing
    .getByRole("button", { name: "Back to workspaces", exact: true })
    .click();
  await expect(missing).toHaveURL(/\/LocalDesign\/$/);
  await missing.goto("unknown/path");
  await expect(missing.getByRole("alert")).toContainText("Workspace not found");
  expect(
    (await tool(missing, "workspace", { action: "list" })).documents,
  ).toHaveLength(1);
  await missing.goto(`workspace/${first.documentId}`);
  await expect(missing.getByLabel("Design name", { exact: true })).toHaveValue(
    "Keep existing work",
  );
});

test("failed saves keep the editor and URL through list navigation and browser Back", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const originalUrl = page.url();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      if (this.name === "documents")
        throw new DOMException("Quota full", "QuotaExceededError");
      return put.apply(this, args);
    };
    (window as any).__restorePut = () => {
      IDBObjectStore.prototype.put = put;
    };
  });
  await edits(page, [{ op: "rename", name: "Unsaved route work" }]);
  await expect(page.getByRole("alert").first()).toContainText(
    "Local save failed",
  );
  await page.getByRole("button", { name: "Workspaces", exact: true }).click();
  await expect(page).toHaveURL(originalUrl);
  await expect(page.getByLabel("Design name", { exact: true })).toHaveValue(
    "Unsaved route work",
  );
  await page.goBack();
  await expect(page).toHaveURL(originalUrl);
  await expect(page.getByTestId("canvas")).toBeVisible();
  expect(
    (await tool(page, "export_design", { format: "native" })).isError,
  ).not.toBe(true);
  await page.evaluate(() => (window as any).__restorePut());
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(page.locator(".save-state")).toContainText("Saved locally");
  await page.getByRole("button", { name: "Workspaces", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Unsaved route work", exact: true }),
  ).toBeVisible();
});

for (const width of [1440, 900, 390]) {
  test(`workspace list is keyboard reachable and fits at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await harness(page);
    await open(page);
    await edits(page, [
      {
        op: "rename",
        name: "A workspace with a long name that should stay readable without horizontal page overflow ".repeat(
          2,
        ),
      },
    ]);
    await workspaceAction(page, "close");
    const heading = page.getByRole("heading", {
      name: "Workspaces",
      exact: true,
    });
    await expect(heading).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link").first()).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const box = await page
      .getByRole("button", { name: /^Delete / })
      .boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({
      path: testInfo.outputPath(`workspaces-${width}.png`),
    });
  });
}

test("Pages-style 404 entry boots direct workspace links and reloads with absolute assets", async ({
  page,
  request,
}) => {
  await harness(page);
  await open(page);
  await edits(page, [{ op: "rename", name: "Direct Pages workspace" }]);
  await expect(page.locator(".save-state")).toContainText("Saved locally");
  const url = page.url();
  const fallback = await request.get("404.html");
  expect(fallback.status()).toBe(200);
  const html = await fallback.text();
  expect(html).toContain("/LocalDesign/assets/");
  await page.route(url, (route) =>
    route.fulfill({ status: 404, contentType: "text/html", body: html }),
  );
  const response = await page.goto(url);
  expect(response!.status()).toBe(404);
  await expect(page.getByLabel("Design name", { exact: true })).toHaveValue(
    "Direct Pages workspace",
  );
  await expect(page.getByTestId("canvas")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("canvas")).toBeVisible();
  await expect(page.getByLabel("Design name", { exact: true })).toHaveValue(
    "Direct Pages workspace",
  );
});

test("deleting the final closed workspace leaves a durable empty list", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  await workspaceAction(page, "close");
  await expect(page.getByRole("link")).toHaveCount(1);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /^Delete / }).click();
  await expect(
    page.getByText("No workspaces yet", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("No workspaces yet", { exact: true }),
  ).toBeVisible();
  expect((await tool(page, "workspace", { action: "list" })).documents).toEqual(
    [],
  );
});
