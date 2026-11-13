import { it, expect } from "vitest";
import { DesignEngine } from "../src/core/engine";
import {
  blankDocument,
  ComponentSchema,
  TokenSchema,
  makeNode,
  nativeDocumentData,
  validateDocument,
  type LibraryPayload,
} from "../src/core/model";
import { CommandSchema } from "../src/core/commands";
import { libraryDigest } from "../src/core/packages";
function payload(): LibraryPayload {
  return {
    nodes: [],
    components: [
      ComponentSchema.parse({
        id: "button",
        name: "Button",
        rootId: "root",
        nodes: [
          makeNode("frame", "private", {
            id: "root",
            width: 160,
            height: 50,
            bindings: { fill: "constructor" },
          }),
          makeNode("text", "private", {
            id: "label",
            parentId: "root",
            text: "Buy",
          }),
        ],
        properties: [
          {
            name: "label",
            type: "text",
            defaultValue: "Buy",
            bindings: [{ partId: "label", field: "text" }],
          },
        ],
      }),
    ],
    tokens: [
      TokenSchema.parse({
        id: "constructor",
        name: "ink",
        type: "color",
        value: "#112233",
      }),
    ],
    tokenThemes: [],
    activeTokenTheme: null,
    assets: [],
    fonts: [],
  };
}
function command(
  e: DesignEngine,
  p: LibraryPayload,
  version = 1,
  mode = "import",
) {
  return CommandSchema.parse({
    op: "library_import",
    namespace: `import-${version}`,
    payload: p,
    originId: "library",
    version,
    digest: libraryDigest(p),
    pageId: e.pageId,
    mode,
  });
}
it("imports a stable origin atomically and dry-run IDs match commit/native reload", () => {
  const e = new DesignEngine(),
    p = payload(),
    request = { ...e.guard(), commands: [command(e, p)] };
  const preview = e.edit(request, true);
  expect(e.document.components).toHaveLength(0);
  const done = e.edit(request);
  expect(done.createdIds).toEqual(preview.createdIds);
  expect(e.edit(request)).toEqual(done);
  const source = e.document.packageSources[0];
  e.dispatch([
    CommandSchema.parse({
      op: "component_instance",
      id: "instance",
      componentId: source.componentMap.button,
      pageId: e.pageId,
    }),
  ]);
  expect(e.document.nodes.find((n) => n.id === "instance")?.fill).toBe(
    "#112233",
  );
  expect(
    validateDocument(nativeDocumentData(e.document)).packageSources,
  ).toEqual(e.document.packageSources);
});
it("sync keeps IDs, reports field diffs and requires explicit local-edit and override decisions", () => {
  const e = new DesignEngine(),
    p = payload();
  e.dispatch([command(e, p)]);
  const id = e.document.packageSources[0].componentMap.button;
  e.dispatch([
    CommandSchema.parse({
      op: "component_instance",
      id: "instance",
      componentId: id,
      pageId: e.pageId,
      properties: { label: "Mine" },
    }),
  ]);
  const local = e.document.components[0];
  e.dispatch([
    CommandSchema.parse({
      op: "component_set",
      id,
      expectedComponentRevision: local.revision,
      description: "Local edit",
    }),
  ]);
  const next = payload();
  next.components[0].nodes[0].width = 220;
  next.components[0].properties = [];
  const before = e.document;
  expect(() => e.dispatch([command(e, next, 2, "sync")])).toThrow(
    /local edits/,
  );
  expect(e.document).toBe(before);
  expect(() =>
    e.dispatch([
      CommandSchema.parse({
        ...command(e, next, 2, "sync"),
        replaceLocalEdits: true,
      }),
    ]),
  ).toThrow(/conflict/);
  const receipt = e.dispatch([
    CommandSchema.parse({
      ...command(e, next, 2, "sync"),
      replaceLocalEdits: true,
      conflictPolicy: "drop",
    }),
  ]);
  expect(e.document.components[0].id).toBe(id);
  expect(e.document.nodes.find((n) => n.id === "instance")?.width).toBe(220);
  expect(receipt.libraryImpact!.changes[0].parts[0].fields).toContain("width");
  expect(receipt.componentImpact?.conflictCount).toBe(1);
  const third = payload();
  third.components[0].nodes[0].width = 240;
  third.components[0].properties = [];
  expect(() => e.dispatch([command(e, third, 3, "sync")])).not.toThrow();
});
it("copying a linked instance remaps generated IDs and preserves base theme paint in a themed destination", () => {
  const source = new DesignEngine({ ...blankDocument(), ...payload() });
  source.dispatch([
    CommandSchema.parse({
      op: "component_instance",
      id: "old",
      componentId: "button",
      pageId: source.pageId,
    }),
  ]);
  const p = { ...payload(), nodes: source.document.nodes };
  const target = new DesignEngine();
  target.dispatch([
    {
      op: "token_themes_set",
      themes: [{ id: "dark", name: "Dark" }],
      activeThemeId: "dark",
    },
  ]);
  const receipt = target.dispatch([
    CommandSchema.parse({ ...command(target, p), mode: "copy" }),
  ]);
  const root = target.document.nodes.find((n) => n.component)!;
  expect(root.id).not.toBe("old");
  expect(root.fill).toBe("#112233");
  expect(root.tokenTheme).not.toBeNull();
  expect(
    target.document.nodes.find((n) => n.componentPart)?.componentPart
      ?.instanceId,
  ).toBe(root.id);
  expect(receipt.libraryImpact?.rootIds).toEqual([root.id]);
  expect(target.document.packageSources).toEqual([]);
});
it("rejects corrupted dependency payloads before any target mutation", () => {
  const e = new DesignEngine(),
    p = payload();
  p.components[0].nodes[0].bindings.fill = "missing";
  const before = e.document;
  expect(() => e.dispatch([command(e, p)])).toThrow(/token|Unknown/i);
  expect(e.document).toBe(before);
});

it("sync reintroduces omitted components with stable identity and retains the last imported baseline", () => {
  for (const editWhileOmitted of [false, true]) {
    const e = new DesignEngine();
    e.dispatch([command(e, payload())]);
    const id = e.document.packageSources[0].componentMap.button;
    e.dispatch([
      CommandSchema.parse({
        op: "component_instance",
        id: "instance",
        componentId: id,
        pageId: e.pageId,
      }),
    ]);
    const omitted = payload();
    omitted.components = [];
    omitted.tokens = [];
    if (editWhileOmitted)
      e.dispatch([
        CommandSchema.parse({
          op: "component_set",
          id,
          expectedComponentRevision: 1,
          description: "Local edit",
        }),
      ]);
    e.dispatch([command(e, omitted, 2, "sync")]);
    expect(e.document.packageSources[0].componentMap.button).toBe(id);
    const incoming = payload();
    incoming.components[0].nodes[0].width = 260;
    const update = command(e, incoming, 3, "sync");
    if (editWhileOmitted) {
      const before = e.document;
      expect(() => e.dispatch([update])).toThrow(/local edits/);
      expect(e.document).toBe(before);
    }
    e.dispatch([
      CommandSchema.parse({ ...update, replaceLocalEdits: editWhileOmitted }),
    ]);
    expect(e.document.components).toHaveLength(1);
    expect(e.document.components[0].id).toBe(id);
    expect(e.document.nodes.find((n) => n.id === "instance")?.width).toBe(260);
  }
});
