import { it, expect } from "vitest";
import { DesignEngine } from "../src/core/engine";
import {
  blankDocument,
  makeNode,
  ComponentSchema,
  ComponentInstanceSchema,
  TokenSchema,
  validateDocument,
  nativeDocumentData,
} from "../src/core/model";
import { checkpointDiff } from "../src/core/checkpoints";
import { CommandSchema } from "../src/core/commands";
function fixture() {
  const d = blankDocument();
  d.tokens.push(
    TokenSchema.parse({
      id: "ink",
      name: "ink",
      type: "color",
      value: "#112233",
    }),
  );
  d.components.push(
    ComponentSchema.parse({
      id: "button",
      name: "Button",
      rootId: "root",
      nodes: [
        makeNode("frame", "private", {
          id: "root",
          width: 120,
          height: 50,
          bindings: { fill: "ink" },
        }),
      ],
    }),
  );
  d.nodes.push(
    makeNode("frame", d.pages[0].id, { id: "frame", width: 300, height: 200 }),
    makeNode("frame", d.pages[0].id, {
      id: "instance",
      parentId: "frame",
      component: ComponentInstanceSchema.parse({ componentId: "button" }),
    }),
  );
  return new DesignEngine(d);
}
it("retains rendered frame content across dependency edits and restores as a guarded monotonic revision", () => {
  const e = fixture();
  e.dispatch([
    {
      op: "checkpoint_create",
      id: "v1",
      kind: "frame",
      targetId: "frame",
      label: "Before",
      author: "You",
    },
  ]);
  e.dispatch([
    { op: "token_set", token: { ...e.document.tokens[0], value: "#445566" } },
    {
      op: "component_set",
      id: "button",
      expectedComponentRevision: 1,
      nodes: e.document.components[0].nodes.map((n) => ({ ...n, height: 80 })),
      conflictPolicy: "reject",
    },
  ]);
  expect(
    checkpointDiff(e.document, e.document.checkpoints[0]).dependencyCount,
  ).toBe(2);
  const before = e.document;
  const request = {
    ...e.guard(),
    commands: [
      CommandSchema.parse({
        op: "checkpoint_restore",
        id: "v1",
        mode: "linked",
      }),
    ],
  };
  expect(() => e.edit(request)).toThrow(/dependencies changed/);
  expect(e.document).toBe(before);
  const receipt = e.dispatch([
    CommandSchema.parse({ op: "checkpoint_restore", id: "v1" }),
  ]);
  expect(receipt.revision).toBe(before.revision + 1);
  expect(e.document.nodes.find((n) => n.id === "instance")).toMatchObject({
    fill: "#112233",
    height: 50,
    bindings: {},
    component: null,
  });
  e.history("undo", e.guard());
  expect(e.document.nodes.find((n) => n.id === "instance")?.fill).toBe(
    "#445566",
  );
  expect(e.document.checkpoints).toHaveLength(1);
  expect(() => validateDocument(nativeDocumentData(e.document))).not.toThrow();
});
it("restores component versions with explicit dependency updates and current revision guards", () => {
  const e = fixture();
  e.dispatch([
    {
      op: "checkpoint_create",
      id: "v1",
      kind: "component",
      targetId: "button",
      label: "Initial",
      author: "You",
    },
  ]);
  e.dispatch([
    {
      op: "component_set",
      id: "button",
      expectedComponentRevision: 1,
      nodes: e.document.components[0].nodes.map((n) => ({ ...n, width: 220 })),
      conflictPolicy: "reject",
    },
    { op: "token_set", token: { ...e.document.tokens[0], value: "#aabbcc" } },
  ]);
  const restore = CommandSchema.parse({
    op: "checkpoint_restore",
    id: "v1",
    restoreDependencies: true,
  });
  const guard = e.guard();
  const request = { ...guard, commands: [restore] };
  const preview = e.edit(request, true);
  expect(preview.componentImpact?.instanceCount).toBe(1);
  expect(e.document.components[0].revision).toBe(2);
  const done = e.edit(request);
  expect(e.edit(request)).toEqual(done);
  expect(e.document.components[0].revision).toBe(3);
  expect(e.document.nodes.find((n) => n.id === "instance")).toMatchObject({
    width: 120,
    fill: "#112233",
  });
});
it("rejects altered checkpoint payloads/resources, enforces retention and preserves failed transactions", () => {
  const e = fixture();
  e.dispatch([
    {
      op: "checkpoint_create",
      id: "v1",
      kind: "frame",
      targetId: "frame",
      label: "Initial",
      author: "You",
    },
  ]);
  const broken = structuredClone(e.document);
  broken.checkpoints[0].payload.nodes[0].width++;
  expect(() => validateDocument(broken)).toThrow(/digest/);
  const before = e.document;
  expect(() =>
    e.dispatch(
      Array.from({ length: 100 }, (_, i) => ({
        op: "checkpoint_create" as const,
        id: `checkpoint-${i}`,
        kind: "frame" as const,
        targetId: "frame",
        label: "Many",
        author: "You",
      })),
    ),
  ).toThrow();
  expect(e.document).toBe(before);
  e.dispatch([{ op: "checkpoint_delete", id: "v1" }]);
  expect(e.document.checkpoints).toEqual([]);
});
