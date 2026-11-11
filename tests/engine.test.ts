import { describe, expect, it } from "vitest";
import { DesignEngine } from "../src/core/engine";
import {
  blankDocument,
  makeNode,
  uid,
  validateDocument,
} from "../src/core/model";
import { worldPoint, worldRotation } from "../src/core/geometry";
import { CommandSchema } from "../src/core/commands";
function scene() {
  const doc = blankDocument();
  const frame = makeNode("frame", doc.pages[0].id, {
      x: 100,
      y: 80,
      rotation: 30,
    }),
    a = makeNode("rectangle", doc.pages[0].id, {
      parentId: frame.id,
      x: 20,
      y: 30,
      width: 70,
      height: 50,
      fill: "#123456",
    }),
    b = makeNode("text", doc.pages[0].id, {
      parentId: frame.id,
      x: 150,
      y: 90,
      text: "Keep this text",
      fontSize: 23,
    });
  doc.nodes = [frame, a, b];
  return { engine: new DesignEngine(doc), frame, a, b };
}
describe("shared engine transactions", () => {
  it("updates only provided fields, without creation defaults resetting existing design", () => {
    const { engine, a, b } = scene();
    engine.dispatch([
      { op: "update", ids: [a.id], patch: { name: "Renamed" } },
    ]);
    expect(engine.document.nodes.find((n) => n.id === a.id)).toEqual({
      ...a,
      name: "Renamed",
    });
    engine.dispatch([
      { op: "update", ids: [b.id], patch: { fill: "#00ff00" } },
    ]);
    expect(engine.document.nodes.find((n) => n.id === b.id)).toEqual({
      ...b,
      fill: "#00ff00",
    });
    engine.dispatch([
      { op: "page_update", id: engine.pageId, patch: { name: "Another name" } },
    ]);
    expect(engine.document.pages[0].background).toBe("#202023");
  });
  it("rejects an entire invalid batch, including earlier valid operations, without history", () => {
    const { engine, a } = scene(),
      before = structuredClone(engine.document);
    expect(() =>
      engine.dispatch([
        { op: "rename", name: "Should not persist" },
        { op: "update", ids: [a.id], patch: { assetId: "missing" } },
        { op: "reparent", ids: [a.id], parentId: "missing" },
      ]),
    ).toThrow();
    expect(engine.document).toEqual(before);
    expect(engine.getSnapshot().canUndo).toBe(false);
  });
  it("rejects stale edits and changed retry payload; identical retries return original receipts after later edits", () => {
    const { engine, a } = scene();
    const request = {
        ...engine.guard(),
        commands: [{ op: "update" as const, ids: [a.id], patch: { x: 90 } }],
      },
      receipt = engine.edit(request);
    engine.dispatch([{ op: "rename", name: "Later human edit" }]);
    expect(engine.edit(request)).toEqual(receipt);
    expect(engine.document.revision).toBe(2);
    expect(() => engine.edit({ ...request, requestId: uid() })).toThrow(
      /current revision/,
    );
    expect(() =>
      engine.edit({
        ...request,
        commands: [{ op: "rename", name: "Changed payload" }],
      }),
    ).toThrow(/already used/);
  });
  it("dry-run leaves revision, document, selection and history untouched", () => {
    const { engine, a } = scene(),
      before = engine.getSnapshot();
    engine.edit(
      {
        ...engine.guard(),
        commands: [{ op: "update", ids: [a.id], patch: { x: 42 } }],
      },
      true,
    );
    expect(engine.getSnapshot()).toBe(before);
  });
  it("keeps monotonic revisions through undo, redo and new branches", () => {
    const { engine, a } = scene();
    engine.dispatch([{ op: "update", ids: [a.id], patch: { x: 90 } }]);
    const guard = engine.guard(),
      undo = engine.history("undo", guard);
    expect(engine.document.nodes.find((n) => n.id === a.id)?.x).toBe(a.x);
    expect(engine.history("undo", guard)).toEqual(undo);
    engine.history("redo", engine.guard());
    expect(engine.document.revision).toBe(3);
    expect(engine.document.nodes.find((n) => n.id === a.id)?.x).toBe(90);
    engine.history("undo", engine.guard());
    engine.dispatch([{ op: "rename", name: "Branched" }]);
    expect(engine.document.revision).toBe(5);
    expect(engine.getSnapshot().canRedo).toBe(false);
  });
  it("selection and view are shared without editing/history", () => {
    const { engine, a } = scene();
    engine.select([a.id]);
    engine.setViewport({ zoom: 2, x: -200 });
    expect(engine.getSnapshot().selection).toEqual([a.id]);
    expect(engine.document.revision).toBe(0);
    expect(engine.getSnapshot().canUndo).toBe(false);
    expect(() => engine.setViewport({ zoom: 0 })).toThrow();
    expect(() => engine.select(["missing"])).toThrow();
  });
  it("uses global unique IDs and validates hierarchy and missing assets", () => {
    const { engine, frame, a } = scene();
    expect(() =>
      engine.dispatch([{ op: "reparent", ids: [frame.id], parentId: a.id }]),
    ).toThrow();
    expect(() =>
      engine.dispatch([
        {
          op: "asset_add",
          asset: {
            id: a.id,
            name: "bad",
            mime: "image/png",
            data: "data:image/png;base64,AAAA",
            width: 1,
            height: 1,
          },
        },
      ]),
    ).toThrow();
    expect(() =>
      engine.dispatch([
        {
          op: "create",
          node: makeNode("image", engine.pageId, { assetId: "missing" }),
        },
      ]),
    ).toThrow(/asset/);
    expect(() =>
      validateDocument({ ...engine.document, schemaVersion: 2 }),
    ).toThrow();
  });
  it("blocks edits to locked nodes/ancestors and permits unlocking", () => {
    const { engine, frame, a } = scene();
    engine.dispatch([
      { op: "update", ids: [frame.id], patch: { locked: true } },
    ]);
    expect(() =>
      engine.dispatch([{ op: "update", ids: [a.id], patch: { x: 80 } }]),
    ).toThrow(/Unlock/);
    expect(() => engine.dispatch([{ op: "delete", ids: [frame.id] }])).toThrow(
      /Unlock/,
    );
    engine.dispatch([
      { op: "update", ids: [frame.id], patch: { locked: false } },
    ]);
    engine.dispatch([{ op: "update", ids: [a.id], patch: { x: 80 } }]);
    expect(engine.document.nodes.find((n) => n.id === a.id)?.x).toBe(80);
  });
  it("rejects unsupported properties and invalid numeric/paint values", () => {
    expect(() =>
      CommandSchema.parse({ op: "update", ids: ["x"], patch: { x: Infinity } }),
    ).toThrow();
    expect(() =>
      CommandSchema.parse({
        op: "update",
        ids: ["x"],
        patch: { fill: "url(https://example.com)" },
      }),
    ).toThrow();
    expect(() =>
      CommandSchema.parse({
        op: "update",
        ids: ["x"],
        patch: { pageId: "other" },
      }),
    ).toThrow();
  });
});
describe("geometry and structural edits", () => {
  it("reparents across rotated frames without moving/rotating the visual result", () => {
    const { engine, a } = scene(),
      before = worldPoint(engine.document, a),
      angle = worldRotation(engine.document, a);
    const f = makeNode("frame", engine.pageId, {
      x: 500,
      y: 200,
      rotation: -60,
    });
    engine.dispatch([
      { op: "create", node: f },
      { op: "reparent", ids: [a.id], parentId: f.id },
    ]);
    const n = engine.document.nodes.find((n) => n.id === a.id)!;
    expect(worldPoint(engine.document, n).x).toBeCloseTo(before.x);
    expect(worldPoint(engine.document, n).y).toBeCloseTo(before.y);
    expect(worldRotation(engine.document, n)).toBeCloseTo(angle);
  });
  it("groups and ungroups siblings preserving world positions", () => {
    const { engine, a, b } = scene(),
      before = worldPoint(engine.document, a),
      id = uid();
    engine.dispatch([{ op: "group", ids: [a.id, b.id], id }]);
    expect(
      worldPoint(
        engine.document,
        engine.document.nodes.find((n) => n.id === a.id)!,
      ).x,
    ).toBeCloseTo(before.x);
    engine.dispatch([{ op: "ungroup", ids: [id] }]);
    expect(
      worldPoint(
        engine.document,
        engine.document.nodes.find((n) => n.id === a.id)!,
      ).y,
    ).toBeCloseTo(before.y);
    expect(engine.document.nodes).toHaveLength(3);
  });
  it("duplicates a subtree once, remaps hierarchy, and deletion cascades", () => {
    const { engine, frame } = scene();
    const r = engine.dispatch([
      { op: "duplicate", ids: [frame.id], dx: 24, dy: 24 },
    ]);
    expect(r.createdIds).toHaveLength(3);
    const copy = engine.document.nodes.find((n) => n.id === r.createdIds[0])!;
    expect(copy.x).toBe(frame.x + 24);
    expect(
      engine.document.nodes.filter((n) => n.parentId === copy.id),
    ).toHaveLength(2);
    engine.dispatch([{ op: "delete", ids: [copy.id] }]);
    expect(engine.document.nodes).toHaveLength(3);
  });
  it("positions frame children with gap/padding/cross-axis alignment in one batch", () => {
    const { engine, frame, a, b } = scene();
    engine.dispatch([
      {
        op: "update",
        ids: [frame.id],
        patch: {
          width: 400,
          height: 350,
          layout: {
            direction: "vertical",
            gap: 12,
            padding: 20,
            align: "center",
          },
        },
      },
    ]);
    const aa = engine.document.nodes.find((n) => n.id === a.id)!,
      bb = engine.document.nodes.find((n) => n.id === b.id)!;
    expect(aa.x).toBe((400 - a.width) / 2);
    expect(aa.y).toBe(20);
    expect(bb.y).toBe(20 + a.height + 12);
    engine.history("undo", engine.guard());
    expect(engine.document.nodes.find((n) => n.id === a.id)?.y).toBe(a.y);
  });
  it("aligns/distributes/orders siblings and keeps at least one page", () => {
    const { engine, a, b } = scene(),
      c = makeNode("rectangle", engine.pageId, {
        parentId: a.parentId,
        x: 400,
        y: 180,
        width: 90,
      });
    engine.dispatch([
      { op: "create", node: c },
      { op: "align", ids: [a.id, b.id, c.id], axis: "top" },
      { op: "distribute", ids: [a.id, b.id, c.id], axis: "horizontal" },
    ]);
    const nodes = [a, b, c].map((n) =>
      engine.document.nodes.find((x) => x.id === n.id)!,
    );
    expect(nodes.map((n) => n.y)).toEqual([30, 30, 30]);
    expect(nodes[1].x - (nodes[0].x + nodes[0].width)).toBeCloseTo(
      nodes[2].x - (nodes[1].x + nodes[1].width),
    );
    engine.dispatch([{ op: "order", ids: [a.id], direction: "front" }]);
    expect(engine.document.nodes.at(-1)?.id).toBe(a.id);
    expect(() =>
      engine.dispatch([{ op: "page_delete", id: engine.pageId }]),
    ).toThrow(/at least/);
  });
});

it("locked ancestry also blocks creating/reparenting children into a destination", () => {
  const doc = blankDocument(),
    parent = makeNode("frame", doc.pages[0].id, { locked: true }),
    inner = makeNode("group", doc.pages[0].id, { parentId: parent.id }),
    shape = makeNode("rectangle", doc.pages[0].id);
  doc.nodes = [parent, inner, shape];
  const engine = new DesignEngine(doc);
  expect(() =>
    engine.dispatch([
      {
        op: "create",
        node: makeNode("rectangle", engine.pageId, { parentId: inner.id }),
      },
    ]),
  ).toThrow(/Unlock/);
  expect(() =>
    engine.dispatch([{ op: "reparent", ids: [shape.id], parentId: inner.id }]),
  ).toThrow(/unlocked/);
});
