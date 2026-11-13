import { it, expect } from "vitest";
import { DesignEngine } from "../src/core/engine";
import {
  blankDocument,
  makeNode,
  validateDocument,
  nativeDocumentData,
} from "../src/core/model";
import { CommandSchema } from "../src/core/commands";
import { prototypeProblems } from "../src/core/prototype";
function fixture() {
  const d = blankDocument();
  d.nodes.push(
    makeNode("frame", d.pages[0].id, { id: "a" }),
    makeNode("frame", d.pages[0].id, { id: "b" }),
    makeNode("frame", d.pages[0].id, { id: "overlay" }),
    makeNode("rectangle", d.pages[0].id, { id: "next", parentId: "a" }),
    makeNode("rectangle", d.pages[0].id, { id: "open", parentId: "b" }),
    makeNode("rectangle", d.pages[0].id, { id: "close", parentId: "overlay" }),
  );
  const e = new DesignEngine(d);
  e.dispatch([
    CommandSchema.parse({
      op: "prototype_set",
      prototype: {
        entryFrameId: "a",
        interactions: [
          {
            id: "ab",
            sourceId: "next",
            action: "navigate",
            targetFrameId: "b",
          },
          {
            id: "bo",
            sourceId: "open",
            action: "overlay",
            targetFrameId: "overlay",
            position: "bottom-right",
          },
          { id: "oc", sourceId: "close", action: "close_overlay" },
        ],
      },
    }),
  ]);
  return e;
}
it("native prototype navigation/overlay/back are transient, source-scoped and bounded", () => {
  const e = fixture(),
    before = e.document;
  e.playPrototype(before.id, { action: "start" });
  expect(() =>
    e.playPrototype(before.id, { action: "event", interactionId: "bo" }),
  ).toThrow(/available interaction/);
  e.playPrototype(before.id, { action: "event", interactionId: "ab" });
  e.playPrototype(before.id, { action: "event", interactionId: "bo" });
  expect(e.getSnapshot().player).toMatchObject({
    frameId: "b",
    history: ["a"],
    overlays: [{ frameId: "overlay", position: "bottom-right" }],
  });
  e.playPrototype(before.id, { action: "event", interactionId: "oc" });
  e.playPrototype(before.id, { action: "back" });
  expect(e.getSnapshot().player.frameId).toBe("a");
  expect(e.document).toBe(before);
  expect(() => e.playPrototype("stale", { action: "stop" })).toThrow(/changed/);
});
it("retains and reports broken prototype targets without blocking ordinary edits or native files", () => {
  const e = fixture();
  e.dispatch([{ op: "delete", ids: ["b"] }]);
  expect(prototypeProblems(e.document).length).toBeGreaterThan(0);
  expect(() => validateDocument(nativeDocumentData(e.document))).not.toThrow();
  e.playPrototype(e.document.id, { action: "start" });
  expect(() =>
    e.playPrototype(e.document.id, { action: "event", interactionId: "ab" }),
  ).toThrow(/available interaction/);
  const before = e.document;
  expect(() =>
    e.dispatch([
      CommandSchema.parse({
        op: "prototype_set",
        prototype: { entryFrameId: "missing", interactions: [] },
      }),
    ]),
  ).toThrow(/missing/);
  expect(e.document).toBe(before);
  e.dispatch([{ op: "delete", ids: ["a"] }]);
  expect(e.getSnapshot().player.open).toBe(false);
});

it("clipped sources do not become keyboard or agent prototype actions", () => {
  const e = fixture();
  e.dispatch([
    {
      op: "update",
      ids: ["a"],
      patch: { width: 100, height: 100, clip: true },
    },
    { op: "update", ids: ["next"], patch: { x: 200, y: 200 } },
  ]);
  e.playPrototype(e.document.id, { action: "start" });
  expect(() =>
    e.playPrototype(e.document.id, { action: "event", interactionId: "ab" }),
  ).toThrow(/available interaction/);
});
