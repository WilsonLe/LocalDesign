import { expect, type Page } from "@playwright/test";
export async function harness(page: Page) {
  await page.addInitScript(() => {
    const registry = new Map<
      string,
      { execute: (input: unknown) => Promise<unknown> }
    >();
    Object.defineProperty(document, "modelContext", {
      value: {
        registerTool(
          tool: { name: string; execute: (input: unknown) => Promise<unknown> },
          options: { signal: AbortSignal },
        ) {
          registry.set(tool.name, tool);
          options.signal.addEventListener(
            "abort",
            () => {
              if (registry.get(tool.name) === tool) registry.delete(tool.name);
            },
            { once: true },
          );
        },
      },
    });
    Object.defineProperty(window, "__testSiteTools", { value: registry });
  });
}
export async function tool<T = any>(
  page: Page,
  name: string,
  input: unknown = {},
): Promise<T> {
  return page.evaluate(
    async ({ name, input }) => {
      const tools = (
        window as unknown as {
          __testSiteTools: Map<
            string,
            { execute: (input: unknown) => Promise<unknown> }
          >;
        }
      ).__testSiteTools;
      const t = tools.get(name);
      if (!t) throw new Error(`No registered tool ${name}`);
      return t.execute(input);
    },
    { name: `localdesign_${name}`, input },
  ) as Promise<T>;
}
export async function open(page: Page) {
  await page.goto("./");
  await expect(page.getByTestId("canvas")).toBeVisible();
  await expect
    .poll(async () => page.locator(".save-state").innerText())
    .toContain("Saved locally");
}
export async function inspect(page: Page) {
  return tool(page, "inspect_document");
}
export async function edits(page: Page, commands: unknown[]) {
  const d = await inspect(page);
  const result = await tool(page, "apply_edits", {
    expectedDocumentId: d.documentId,
    expectedRevision: d.revision,
    requestId: crypto.randomUUID(),
    commands,
  });
  expect(result.isError, result.message).not.toBe(true);
  return result;
}
export async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}
