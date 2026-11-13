import { expect, test } from "@playwright/test";
import { harness, open, inspect, edits, tool } from "./helpers";
test("human threads and transient agent status share the active design and retain missing anchors", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const d = await inspect(page);
  await edits(page, [
    {
      op: "create",
      node: {
        id: "review-frame",
        type: "frame",
        name: "Anchored frame",
        pageId: d.pageId,
        x: 200,
        y: 100,
        width: 200,
        height: 100,
      },
    },
  ]);
  await tool(page, "selection", { ids: ["review-frame"] });
  await tool(page, "activity", {
    action: "set",
    expectedDocumentId: d.documentId,
    actor: "Design agent",
    message: "Reviewing frame",
    ttlMs: 1000,
  });
  await expect(
    page.getByText("Design agent: Reviewing frame", { exact: true }),
  ).toBeVisible();
  const revision = (await inspect(page)).revision;
  await page
    .getByRole("button", { name: "Design resources", exact: true })
    .click();
  await page.getByRole("tab", { name: "Review", exact: true }).click();
  await page
    .getByLabel("Comment", { exact: true })
    .fill("Increase the heading contrast.");
  await page.getByRole("button", { name: "Add thread", exact: true }).click();
  const threads = await tool(page, "review");
  expect(threads.threads[0].anchorExists).toBe(true);
  expect((await inspect(page)).revision).toBe(revision + 1);
  await page.getByLabel("Reply", { exact: true }).fill("Contrast updated.");
  await page
    .getByRole("button", { name: "Reply to thread", exact: true })
    .click();
  await page.getByRole("button", { name: "Resolve", exact: true }).click();
  await page.getByLabel("Show resolved", { exact: true }).check();
  await expect(
    page.getByRole("button", { name: "Reopen", exact: true }),
  ).toBeVisible();
  await edits(page, [{ op: "delete", ids: ["review-frame"] }]);
  await expect(page.getByText(/Anchored frame \(missing\)/)).toBeVisible();
  expect((await tool(page, "review")).threads[0].anchorExists).toBe(false);
  await expect(
    page.getByText("Design agent: Reviewing frame", { exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("canvas")).toBeVisible();
  const reopened = await tool(page, "review", {
    action: "get",
    id: threads.threads[0].id,
  });
  expect(reopened.replies[0].body).toBe("Contrast updated.");
  expect(reopened.resolved).toBe(true);
});
