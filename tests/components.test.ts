import { expect, it } from "vitest";
import {
  blankDocument,
  makeNode,
  ComponentSchema,
  ComponentInstanceSchema,
  TokenSchema,
  type DesignDocument,
} from "../src/core/model";
import {
  componentNodeId,
  resolveComponents,
  validateComponents,
} from "../src/core/components";
import { DesignEngine } from "../src/core/engine";
import { CommandSchema } from "../src/core/commands";
import { nativeDocumentData } from "../src/core/model";
import { nativeImport } from "../src/files/native";
import { strToU8, zipSync } from "fflate";

function fixture() {
  const doc = blankDocument();
  doc.components.push(
    ComponentSchema.parse({
      id: "button",
      name: "Button",
      rootId: "main",
      nodes: [
        makeNode("frame", "component", {
          id: "main",
          name: "Button source",
          width: 160,
          height: 48,
          fill: "#eeeeee",
        }),
        makeNode("text", "component", {
          id: "label",
          parentId: "main",
          name: "Label",
          text: "Source label",
          x: 16,
          y: 10,
          width: 128,
          height: 28,
        }),
      ],
      properties: [
        {
          name: "label",
          type: "text",
          defaultValue: "Buy",
          bindings: [{ partId: "label", field: "text" }],
        },
        {
          name: "state",
          type: "enum",
          defaultValue: "normal",
          options: ["normal", "hover"],
        },
      ],
      variants: [
        {
          id: "hover",
          name: "Hover",
          when: { state: "hover" },
          overrides: [
            { partId: "main", patch: { width: 200, fill: "#333333" } },
          ],
        },
      ],
    }),
  );
  return doc;
}
function instance(
  doc: DesignDocument,
  id: string,
  properties: Record<string, string> = {},
) {
  return makeNode("frame", doc.pages[0].id, {
    id,
    name: id,
    x: id === "a" ? 20 : 250,
    y: 30,
    component: ComponentInstanceSchema.parse({
      componentId: "button",
      properties,
    }),
  });
}

it("materializes properties, variants and sparse overrides with stable native IDs", () => {
  const doc = fixture();
  doc.nodes.push(
    instance(doc, "a"),
    instance(doc, "b", { label: "Continue", state: "hover" }),
  );
  const first = resolveComponents(doc);
  const labelId = componentNodeId("a", ["label"]);
  expect(first.createdIds).toContain(labelId);
  expect(doc.nodes.find((node) => node.id === "a")).toMatchObject({
    x: 20,
    y: 30,
    width: 160,
    name: "a",
  });
  expect(doc.nodes.find((node) => node.id === "b")).toMatchObject({
    width: 200,
    fill: "#333333",
  });
  expect(doc.nodes.find((node) => node.id === labelId)).toMatchObject({
    text: "Buy",
    parentId: "a",
    componentPart: { instanceId: "a", path: ["label"] },
  });
  doc.nodes
    .find((node) => node.id === "a")!
    .component!.overrides.push({
      path: ["label"],
      patch: { text: "My label" },
      bindings: {},
    });
  doc.components[0].properties[0].defaultValue = "New default";
  doc.components[0].nodes[0].height = 60;
  doc.components[0].revision++;
  resolveComponents(doc);
  expect(doc.nodes.find((node) => node.id === labelId)?.text).toBe("My label");
  expect(
    doc.nodes.find((node) => node.id === componentNodeId("b", ["label"]))?.text,
  ).toBe("Continue");
  expect(doc.nodes.find((node) => node.id === "a")?.height).toBe(60);
  expect(
    doc.nodes.find((node) => node.id === "a")!.component!.resolvedRevision,
  ).toBe(2);
});

it("nested reuse follows the inner definition rather than captured root literals", () => {
  const doc = fixture();
  doc.components.push(
    ComponentSchema.parse({
      id: "wrapper",
      name: "Wrapper",
      rootId: "wrapper-root",
      nodes: [
        makeNode("frame", "component", {
          id: "wrapper-root",
          name: "Wrapper",
          width: 300,
          height: 100,
        }),
        makeNode("frame", "component", {
          id: "reference",
          name: "Nested button",
          parentId: "wrapper-root",
          x: 12,
          y: 8,
          fill: "#ff0000",
          component: ComponentInstanceSchema.parse({
            componentId: "button",
            properties: { state: "hover" },
          }),
        }),
      ],
    }),
  );
  doc.nodes.push(
    makeNode("frame", doc.pages[0].id, {
      id: "outer",
      name: "Outer",
      component: ComponentInstanceSchema.parse({ componentId: "wrapper" }),
    }),
  );
  resolveComponents(doc);
  const nested = componentNodeId("outer", ["reference", "main"]),
    label = componentNodeId("outer", ["reference", "label"]);
  expect(doc.nodes.find((node) => node.id === nested)).toMatchObject({
    parentId: "outer",
    x: 12,
    y: 8,
    width: 200,
    fill: "#333333",
  });
  expect(doc.nodes.find((node) => node.id === label)).toMatchObject({
    parentId: nested,
    text: "Buy",
  });
  doc.components[0].properties[0].defaultValue = "Changed at source";
  doc.components[0].revision++;
  resolveComponents(doc);
  expect(doc.nodes.find((node) => node.id === label)?.text).toBe(
    "Changed at source",
  );
});

it("validates unused variants, mode bindings and reference cycles before rendering", () => {
  const doc = fixture();
  doc.components[0].variants[0].overrides[0].patch.width = -1;
  expect(() => validateComponents(doc)).toThrow();
  doc.components[0].variants[0].overrides[0].patch.width = 200;
  doc.tokenThemes = [{ id: "dark", name: "Dark" }];
  doc.tokens.push(
    TokenSchema.parse({
      id: "weight",
      name: "weight",
      type: "spacing",
      value: 2,
      themes: { dark: 2000 },
    }),
  );
  doc.components[0].nodes[0].bindings.strokeWidth = "weight";
  expect(() => validateComponents(doc)).toThrow(/strokeWidth/);
  delete doc.components[0].nodes[0].bindings.strokeWidth;
  doc.components[0].nodes.push(
    makeNode("frame", "component", {
      id: "cycle",
      name: "Cycle",
      parentId: "main",
      component: ComponentInstanceSchema.parse({ componentId: "button" }),
    }),
  );
  expect(() => validateComponents(doc)).toThrow(/cycle/);
});

it("reports incompatible instance data and drops it only with an explicit policy", () => {
  const doc = fixture();
  doc.nodes.push(instance(doc, "a", { label: "Custom" }));
  resolveComponents(doc);
  doc.nodes[0].component!.overrides.push({
    path: ["label"],
    patch: { text: "Local override" },
    bindings: {},
  });
  doc.components[0].nodes = doc.components[0].nodes.filter(
    (node) => node.id !== "label",
  );
  doc.components[0].properties = doc.components[0].properties.filter(
    (property) => property.name !== "label",
  );
  doc.components[0].revision++;
  expect(() => resolveComponents(doc)).toThrow(/conflict/);
  const result = resolveComponents(doc, { dropFor: new Set(["button"]) });
  expect(result.conflictCount).toBe(2);
  expect(doc.nodes).toHaveLength(1);
  expect(doc.nodes[0].component!.properties).toEqual({});
  expect(doc.nodes[0].component!.overrides).toEqual([]);
  expect(result.warnings).toHaveLength(1);
});

function engineFixture() {
  const definition = fixture().components[0],
    engine = new DesignEngine();
  engine.dispatch(
    definition.nodes.map((node) => ({
      op: "create" as const,
      node: { ...structuredClone(node), pageId: engine.pageId },
    })),
  );
  engine.dispatch([
    CommandSchema.parse({
      op: "component_capture",
      id: "button",
      rootId: "main",
      name: "Button",
      properties: definition.properties,
      variants: definition.variants,
    }),
  ]);
  engine.dispatch([
    CommandSchema.parse({
      op: "component_instance",
      id: "a",
      componentId: "button",
      pageId: engine.pageId,
      x: 200,
      y: 20,
    }),
  ]);
  return engine;
}

it("the canonical engine shares instance edits, reset, revision guards and one-step history", () => {
  const engine = engineFixture(),
    labelId = componentNodeId("a", ["label"]);
  const request = {
    ...engine.guard(),
    commands: [
      CommandSchema.parse({
        op: "update",
        ids: [labelId],
        patch: { text: "Local label" },
      }),
    ],
  };
  const receipt = engine.edit(request);
  expect(engine.document.nodes.find((node) => node.id === labelId)?.text).toBe(
    "Local label",
  );
  expect(
    engine.document.nodes.find((node) => node.id === "a")!.component!.overrides,
  ).toHaveLength(1);
  engine.dispatch([{ op: "rename", name: "Later edit" }]);
  expect(engine.edit(request)).toEqual(receipt);
  engine.history("undo", engine.guard());
  engine.history("undo", engine.guard());
  expect(engine.document.nodes.find((node) => node.id === labelId)?.text).toBe(
    "Buy",
  );
  const before = engine.document;
  expect(() =>
    engine.dispatch([
      CommandSchema.parse({
        op: "component_capture",
        id: "button",
        rootId: "main",
        expectedComponentRevision: 0,
      }),
    ]),
  ).toThrow(/component revision/);
  expect(engine.document).toBe(before);
  engine.dispatch([
    CommandSchema.parse({
      op: "component_properties",
      ids: ["a"],
      properties: { label: "Property label", state: "hover" },
    }),
  ]);
  expect(engine.document.nodes.find((node) => node.id === labelId)?.text).toBe(
    "Property label",
  );
  expect(engine.document.nodes.find((node) => node.id === "a")?.width).toBe(
    200,
  );
  engine.dispatch([
    CommandSchema.parse({
      op: "component_reset",
      ids: ["a"],
      scope: "instance",
      properties: true,
    }),
  ]);
  expect(engine.document.nodes.find((node) => node.id === labelId)?.text).toBe(
    "Buy",
  );
});

it("editable sources retain part IDs while linked structure changes require detach", () => {
  const engine = engineFixture();
  engine.dispatch([
    CommandSchema.parse({
      op: "component_source",
      id: "source-copy",
      componentId: "button",
      pageId: engine.pageId,
      x: 500,
      y: 30,
    }),
  ]);
  const label = engine.document.nodes.find(
    (node) => node.componentSource?.partId === "label",
  )!;
  expect(label.componentSource).toEqual({
    componentId: "button",
    partId: "label",
    revision: 1,
  });
  engine.dispatch([
    { op: "update", ids: ["source-copy"], patch: { height: 72 } },
  ]);
  expect(engine.document.nodes.find((node) => node.id === "a")?.height).toBe(
    48,
  );
  engine.dispatch([
    CommandSchema.parse({
      op: "component_capture",
      id: "button",
      rootId: "source-copy",
      expectedComponentRevision: 1,
    }),
  ]);
  expect(engine.document.nodes.find((node) => node.id === "a")?.height).toBe(
    72,
  );
  expect(engine.document.components[0].rootId).toBe("main");
  const id = componentNodeId("a", ["label"]),
    before = engine.document;
  expect(() => engine.dispatch([{ op: "delete", ids: [id] }])).toThrow(
    /Detach/,
  );
  expect(engine.document).toBe(before);
  engine.dispatch([
    CommandSchema.parse({ op: "component_detach", ids: ["a"] }),
  ]);
  engine.dispatch([{ op: "delete", ids: [id] }]);
  expect(
    engine.document.nodes.find((node) => node.id === "a")!.component,
  ).toBeNull();
});

it("duplication, retained deletion/restoration and sparse native encoding preserve linked content", () => {
  const engine = engineFixture();
  const duplicate = engine.dispatch([
    { op: "duplicate", ids: ["a"], dx: 100, dy: 0 },
  ]);
  const copy = engine.document.nodes.find(
    (node) => duplicate.createdIds.includes(node.id) && node.component,
  )!;
  expect(
    engine.document.nodes.find(
      (node) => node.id === componentNodeId(copy.id, ["label"]),
    )?.text,
  ).toBe("Buy");
  const wire = nativeDocumentData(engine.document);
  expect(wire.nodes).toHaveLength(4); // Two source parts plus two instance roots; live parts regenerate.
  const reopened = nativeImport(
    zipSync({ "document.json": strToU8(JSON.stringify(wire)) }),
    true,
  );
  expect(reopened.nodes).toEqual(engine.document.nodes);
  engine.dispatch([
    CommandSchema.parse({ op: "component_delete", id: "button" }),
  ]);
  expect(
    engine.document.nodes.find((node) => node.id === "a")!.component!.frozen,
  ).toBe(true);
  const retained = nativeImport(
    zipSync({
      "document.json": strToU8(
        JSON.stringify(nativeDocumentData(engine.document)),
      ),
    }),
    true,
  );
  expect(retained.nodes).toEqual(engine.document.nodes);
  engine.dispatch([
    CommandSchema.parse({ op: "component_restore", id: "button" }),
  ]);
  expect(
    engine.document.nodes.find((node) => node.id === "a")!.component!.frozen,
  ).toBe(false);
  expect(
    engine.document.nodes.find(
      (node) => node.id === componentNodeId(copy.id, ["label"]),
    )?.text,
  ).toBe("Buy");
});

it("instance token binding and literal detachment remain sparse through definition updates", () => {
  const engine = engineFixture(),
    labelId = componentNodeId("a", ["label"]);
  engine.dispatch([
    CommandSchema.parse({
      op: "token_set",
      token: { id: "ink", name: "ink", type: "color", value: "#123456" },
    }),
    CommandSchema.parse({
      op: "token_bind",
      ids: [labelId],
      property: "fill",
      tokenId: "ink",
    }),
  ]);
  expect(engine.document.nodes.find((node) => node.id === labelId)?.fill).toBe(
    "#123456",
  );
  engine.dispatch([
    CommandSchema.parse({
      op: "token_bind",
      ids: [labelId],
      property: "fill",
      tokenId: null,
    }),
  ]);
  engine.dispatch([
    CommandSchema.parse({
      op: "token_set",
      token: { id: "ink", name: "ink", type: "color", value: "#abcdef" },
    }),
  ]);
  expect(engine.document.nodes.find((node) => node.id === labelId)?.fill).toBe(
    "#123456",
  );
  engine.dispatch([
    CommandSchema.parse({
      op: "component_capture",
      id: "button",
      rootId: "main",
      expectedComponentRevision: 1,
    }),
  ]);
  expect(engine.document.nodes.find((node) => node.id === labelId)?.fill).toBe(
    "#123456",
  );
});

it("reconciles transitive nested conflicts only under explicit drop and reports impact", () => {
  const d = fixture();
  d.components.push(
    ComponentSchema.parse({
      id: "wrapper",
      name: "Wrapper",
      rootId: "outer",
      nodes: [
        makeNode("frame", "private", { id: "outer" }),
        makeNode("frame", "private", {
          id: "nested",
          parentId: "outer",
          component: ComponentInstanceSchema.parse({
            componentId: "button",
            properties: { state: "hover" },
          }),
        }),
      ],
    }),
  );
  const engine = new DesignEngine(d);
  engine.dispatch([
    {
      op: "component_instance",
      id: "wrapped",
      componentId: "wrapper",
      pageId: d.pages[0].id,
      parentId: null,
      x: 0,
      y: 0,
      rotation: 0,
      properties: {},
      overrides: [],
    },
  ]);
  const command = CommandSchema.parse({
    op: "component_set",
    id: "button",
    expectedComponentRevision: 1,
    properties: [d.components[0].properties[0]],
    variants: [],
    conflictPolicy: "reject",
  });
  const original = engine.document;
  expect(() => engine.dispatch([command])).toThrow(
    /nested reference conflicts/,
  );
  expect(engine.document).toBe(original);
  const receipt = engine.dispatch([
    { ...command, conflictPolicy: "drop" } as typeof command,
  ]);
  expect(receipt.componentImpact).toMatchObject({
    instanceCount: 1,
    conflictCount: 1,
  });
  expect(engine.document.components[1].revision).toBe(2);
  expect(engine.document.components[1].nodes[1].component!.properties).toEqual(
    {},
  );
});

it("deleting token uses includes private templates, variants and sparse instance bindings", () => {
  const d = fixture();
  d.tokens.push(
    TokenSchema.parse({
      id: "ink",
      name: "ink",
      type: "color",
      value: "#112233",
    }),
  );
  d.components[0].nodes[0].bindings.fill = "ink";
  d.components[0].variants[0].overrides[0].bindings.fill = "ink";
  d.nodes.push(instance(d, "a", { state: "hover" }));
  const engine = new DesignEngine(d);
  engine.dispatch([
    { op: "token_bind", ids: ["a"], property: "fill", tokenId: "ink" },
  ]);
  expect(() =>
    engine.dispatch([{ op: "token_delete", id: "ink", detach: false }]),
  ).toThrow(/in use/);
  engine.dispatch([{ op: "token_delete", id: "ink", detach: true }]);
  expect(engine.document.components[0].nodes[0]).toMatchObject({
    fill: "#112233",
    bindings: {},
  });
  expect(
    engine.document.components[0].variants[0].overrides[0].bindings.fill,
  ).toEqual({ value: "#112233" });
  expect(engine.document.nodes.find((n) => n.id === "a")?.fill).toBe("#112233");
  expect(
    () =>
      new DesignEngine(
        nativeDocumentData(engine.document) as unknown as DesignDocument,
      ),
  ).not.toThrow();
});

it("rejects root placement override rows and reconstructs unordered source definitions", () => {
  const d = fixture();
  d.components[0].nodes.reverse();
  const engine = new DesignEngine(d);
  engine.dispatch([
    CommandSchema.parse({
      op: "component_source",
      id: "source",
      componentId: "button",
      pageId: d.pages[0].id,
      x: 20,
      y: 20,
    }),
  ]);
  expect(
    engine.document.nodes.find((n) => n.componentSource?.partId === "label")
      ?.parentId,
  ).toBe("source");
  const before = engine.document;
  expect(() =>
    engine.dispatch([
      CommandSchema.parse({
        op: "component_instance",
        id: "bad",
        componentId: "button",
        pageId: d.pages[0].id,
        overrides: [{ path: ["main"], patch: { x: 99 } }],
      }),
    ]),
  ).toThrow(/placement|position/);
  expect(engine.document).toBe(before);
});
