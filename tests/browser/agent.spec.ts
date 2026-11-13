import { test, expect } from "@playwright/test";
import { harness, open, tool, inspect, edits } from "./helpers";
test("scripted cold start uses only served schemas/skills, validates, authors, previews, exports and reopens", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  await page.route("https://github.com/**", (r) => r.abort());
  const registeredBytes = await page.evaluate(
    () =>
      JSON.stringify(
        [...(window as any).__testSiteTools.values()].map(
          ({ execute: _, ...tool }: any) => tool,
        ),
      ).length,
  );
  // Stay within the catalog size accepted by the actual browser host.
  expect(registeredBytes).toBeLessThan(100_000);
  const before = await inspect(page);
  const catalog = await tool(page, "list_skills");
  expect(catalog.skills.map((s: any) => s.id)).toEqual([
    "getting-started",
    "ui-design",
    "typography",
  ]);
  for (const id of ["getting-started", "ui-design", "typography"]) {
    const p = await tool(page, "get_skill", {
      id,
      expectedBundleVersion: catalog.bundleVersion,
    });
    expect(p.instructions).toContain("## Tool loop");
    expect(p.instructions).toContain(
      "Hero → Selected work → Get in touch → Footer",
    );
    expect(p.instructions).toContain(
      "left-to-right for elements on the same row",
    );
    expect(p.instructions).toContain(
      "inspect the Layers tree alongside the rendered canvas",
    );
    expect(p.instructions).toContain(
      "Do not reorder scene nodes merely to tidy the panel",
    );
    expect(p.instructions).toContain(
      "respect intentional existing organization",
    );
    expect(p.bundleVersion).toBe(catalog.bundleVersion);
    expect(p.version).toBe(
      catalog.skills.find((s: any) => s.id === id).version,
    );
    const browserPreference = p.instructions
      .split("## Browser preference\n")[1]
      ?.split("\n## ")[0];
    expect(browserPreference).toContain(
      "Before opening Chrome, first try the host's built-in browser",
    );
    expect(browserPreference).toContain(
      "state the observed reason for the fallback",
    );
    expect(browserPreference).toContain("do not leave unsaved work behind");
    expect(browserPreference).toContain(
      "discover tools again and inspect the actual document and revision",
    );
  }
  const after = await inspect(page);
  expect(after.revision).toBe(before.revision);
  expect(after.history).toEqual(before.history);
  expect((await tool(page, "get_skill", { id: "unknown" })).code).toBe(
    "UNKNOWN_SKILL",
  );
  expect(
    (
      await tool(page, "get_skill", {
        id: "typography",
        expectedBundleVersion: "missing",
      })
    ).code,
  ).toBe("SKILL_VERSION_UNAVAILABLE");
  const guide = await tool(page, "get_skill", { id: "getting-started" }),
    example = JSON.parse(
      guide.instructions.match(/```json\n([\s\S]*?)\n```/)[1],
    );
  example.expectedDocumentId = before.documentId;
  example.expectedRevision = before.revision;
  for (const c of example.commands) c.node.pageId = before.pageId;
  const validated = await tool(page, "validate_edits", example);
  expect(validated.isError, validated.message).not.toBe(true);
  expect((await inspect(page)).revision).toBe(before.revision);
  const applied = await tool(page, "apply_edits", example);
  expect(applied.isError, applied.message).not.toBe(true);
  const d = await inspect(page);
  expect(d.nodes).toHaveLength(2);
  expect(d.textMetrics[0].overflow).toBe(false);
  expect(d.nodes[1].y).toBe(24);
  const preview = await tool(page, "export_design", { format: "preview" });
  expect(preview.mime).toBe("image/png");
  await page.getByRole("button", { name: "Fit canvas", exact: true }).click();
  await expect(page.getByTestId("canvas")).toBeVisible();
  const native = await tool(page, "export_design", { format: "native" });
  const chunks: string[] = [];
  for (let offset = 0; offset < native.size; offset += 262144) {
    const part = await tool(page, "artifact", {
      id: native.id,
      action: "read",
      offset,
    });
    chunks.push(part.base64);
  }
  const bytes = Buffer.concat(chunks.map((c) => Buffer.from(c, "base64")));
  const prepared = await tool(page, "import_files", {
    action: "prepare",
    name: "agent-authored.localdesign",
    base64: bytes.toString("base64"),
  });
  expect(prepared.isError, prepared.message).not.toBe(true);
  const current = await inspect(page);
  expect(current.documentId).toBe(before.documentId);
  const committed = await tool(page, "import_files", {
    action: "commit",
    artifactId: prepared.importId,
    guard: {
      expectedDocumentId: current.documentId,
      expectedRevision: current.revision,
      requestId: "commit-import",
    },
  });
  expect(committed.isError, committed.message).not.toBe(true);
  expect(committed.documentId).not.toBe(current.documentId);
  await expect
    .poll(async () => (await inspect(page)).documentId)
    .toBe(committed.documentId);
  await edits(page, [
    {
      op: "update",
      ids: ["EXAMPLE_TEXT"],
      patch: { text: "Reopened via site tools" },
    },
  ]);
  expect((await inspect(page)).nodes[1].text).toBe("Reopened via site tools");
  expect(
    (await tool(page, "artifact", { action: "metadata", id: native.id })).code,
  ).toBe("MISSING_ARTIFACT");
  await page.context().setOffline(true);
  const offline = await tool(page, "get_skill", { id: "typography" });
  expect(offline.instructions).toContain("## Errors");
  await page.context().setOffline(false);
});
test("agent/human interleaving, atomic errors, idempotent retries, shared selection and document retirement", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  let d = await inspect(page);
  const batch = {
    expectedDocumentId: d.documentId,
    expectedRevision: d.revision,
    requestId: "first-batch",
    commands: [
      {
        op: "create",
        node: {
          id: "shared",
          type: "rectangle",
          name: "Shared layer",
          pageId: d.pageId,
          x: 60,
          y: 70,
          width: 150,
          height: 100,
        },
      },
    ],
  };
  const r = await tool(page, "apply_edits", batch);
  expect(r.revision).toBe(1);
  await tool(page, "selection", { ids: ["shared"] });
  await expect(page.getByLabel("X", { exact: true })).toHaveValue("60");
  await page.getByLabel("X", { exact: true }).fill("80");
  await page.getByLabel("X", { exact: true }).press("Tab");
  d = await inspect(page);
  expect(d.revision).toBe(2);
  expect(d.nodes[0].x).toBe(80);
  expect(await tool(page, "apply_edits", batch)).toEqual(r);
  const stale = await tool(page, "apply_edits", {
    ...batch,
    requestId: "stale",
    commands: [{ op: "update", ids: ["shared"], patch: { x: 0 } }],
  });
  expect(stale.code).toBe("STALE_REVISION");
  const changed = await tool(page, "apply_edits", {
    ...batch,
    commands: [{ op: "rename", name: "reused" }],
  });
  expect(changed.code).toBe("REQUEST_ID_REUSED");
  const bad = await tool(page, "apply_edits", {
    expectedDocumentId: d.documentId,
    expectedRevision: d.revision,
    requestId: "atomic",
    commands: [
      { op: "rename", name: "Wrong" },
      { op: "update", ids: ["missing"], patch: { x: 0 } },
    ],
  });
  expect(bad.code).toBe("MISSING_NODE");
  expect((await inspect(page)).name).toBe("Untitled design");
  await page.evaluate(() => {
    const t = (window as any).__testSiteTools.get("localdesign_apply_edits");
    (window as any).__retiredTool = t;
  });
  const created = await tool(page, "workspace", {
    action: "create",
    name: "Another design",
    guard: {
      expectedDocumentId: d.documentId,
      expectedRevision: d.revision,
      requestId: "new-doc",
    },
  });
  expect(created.isError, created.message).not.toBe(true);
  const retired = await page.evaluate(() =>
    (window as any).__retiredTool.execute({}),
  );
  expect(retired.code).toBe("DISPOSED");
  const retry = await tool(page, "workspace", {
    action: "create",
    name: "Another design",
    guard: {
      expectedDocumentId: d.documentId,
      expectedRevision: d.revision,
      requestId: "new-doc",
    },
  });
  expect(retry.documentId).toBe(created.documentId);
});

test("pagehide retires site tools and restoration registers a fresh document-bound set", async ({
  page,
}) => {
  await harness(page);
  await open(page);
  const discoveredNames = await page.evaluate(() =>
    [...(window as any).__testSiteTools.keys()].sort(),
  );
  await page.evaluate(() => {
    const tools = (window as any).__testSiteTools;
    (window as any).__oldInspect = tools.get("localdesign_inspect_document");
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    );
  });
  expect(await page.evaluate(() => (window as any).__testSiteTools.size)).toBe(
    0,
  );
  const old = await page.evaluate(() =>
    (window as any).__oldInspect.execute({}),
  );
  expect(old.code).toBe("DISPOSED");
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    ),
  );
  await expect
    .poll(async () =>
      page.evaluate(() => [...(window as any).__testSiteTools.keys()].sort()),
    )
    .toEqual(discoveredNames);
  expect((await inspect(page)).nodes).toHaveLength(0);
});
