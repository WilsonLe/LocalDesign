import { expect, it } from "vitest";
import { DesignEngine } from "../src/core/engine";
import { blankDocument, makeNode, validateDocument } from "../src/core/model";
import { CommandSchema } from "../src/core/commands";
import { findIcons, iconCatalog } from "../src/icons/catalog";

it("bundled catalog has bounded safe native paths and complete upstream notices", () => {
  expect(iconCatalog.icons).toHaveLength(48);
  expect(new Set(iconCatalog.icons.map((icon) => icon.id)).size).toBe(48);
  expect(findIcons("home").map((icon) => icon.id)).toContain("house");
  expect(findIcons("unlikely missing icon")).toEqual([]);
  expect(iconCatalog.license).toContain("ISC License");
  expect(iconCatalog.license).toContain("Cole Bemis");
  const doc = blankDocument();
  for (const icon of iconCatalog.icons)
    doc.nodes.push(
      makeNode("path", doc.pages[0].id, {
        id: icon.id,
        name: icon.name,
        path: icon.path,
      }),
    );
  expect(validateDocument(doc).nodes).toHaveLength(48);
});

it("icon insertion uses canonical parent locks, atomic history, guards and retry receipts", () => {
  const engine = new DesignEngine();
  const command = CommandSchema.parse({
    op: "icon_insert",
    id: "icon",
    iconId: "house",
    pageId: engine.pageId,
    size: 48,
  });
  const request = { ...engine.guard(), commands: [command] };
  const dry = engine.edit(request, true);
  expect(dry.createdIds).toEqual(["icon"]);
  expect(engine.document.nodes).toHaveLength(0);
  const receipt = engine.edit(request);
  const node = engine.document.nodes[0];
  expect(node).toMatchObject({
    type: "path",
    width: 48,
    height: 48,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    pathViewBox: { width: 24, height: 24 },
  });
  expect(node.attribution).toContain("Lucide 1.72.0");
  engine.dispatch([{ op: "rename", name: "Later change" }]);
  expect(engine.edit(request)).toEqual(receipt);
  engine.history("undo", engine.guard());
  engine.history("undo", engine.guard());
  expect(engine.document.nodes).toEqual([]);
  expect(engine.document.revision).toBe(4);
  expect(() => engine.edit({ ...request, requestId: "stale" })).toThrow(
    /Expected revision/,
  );
  engine.dispatch([
    {
      op: "create",
      node: makeNode("frame", engine.pageId, { id: "locked", locked: true }),
    },
  ]);
  const before = engine.document;
  expect(() =>
    engine.dispatch([
      CommandSchema.parse({ ...command, id: "blocked", parentId: "locked" }),
    ]),
  ).toThrow(/destination parent/);
  expect(engine.document).toBe(before);
});

it("unknown icons and invalid path coordinate boxes fail before any batch commits", () => {
  const engine = new DesignEngine();
  const before = engine.document;
  expect(() =>
    engine.dispatch([
      CommandSchema.parse({
        op: "icon_insert",
        id: "unknown",
        pageId: engine.pageId,
        iconId: "unbundled",
      }),
    ]),
  ).toThrow(/bundled catalog/);
  expect(engine.document).toBe(before);
  expect(() =>
    engine.edit({
      ...engine.guard(),
      commands: [
        CommandSchema.parse({
          op: "icon_insert",
          id: "icon",
          pageId: engine.pageId,
          iconId: "check",
        }),
        {
          op: "update",
          ids: ["icon"],
          patch: { pathViewBox: { width: 0, height: 24 } },
        },
      ],
    }),
  ).toThrow();
  expect(engine.document).toBe(before);
  expect(engine.selection).toEqual([]);
});

it("legacy paths keep literal coordinates and new icon geometry remains portable data", () => {
  const doc = blankDocument();
  doc.schemaVersion = 1 as never;
  doc.nodes.push({
    id: "old",
    type: "path",
    name: "Old",
    pageId: doc.pages[0].id,
    path: "M0 0L20 20",
  } as never);
  const migrated = validateDocument(doc);
  expect(migrated.nodes[0]).toMatchObject({
    pathViewBox: null,
    strokeLinecap: "butt",
    strokeLinejoin: "miter",
    attribution: "",
  });
  const engine = new DesignEngine(migrated);
  engine.dispatch([
    CommandSchema.parse({
      op: "icon_insert",
      id: "new",
      iconId: "mail",
      pageId: engine.pageId,
    }),
  ]);
  expect(
    validateDocument(JSON.parse(JSON.stringify(engine.document))).nodes[1]
      .attribution,
  ).toContain("MIT License");
});
