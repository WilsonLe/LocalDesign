import { it, expect, vi } from "vitest";
import { DesignEngine } from "../src/core/engine";
import {
  blankDocument,
  makeNode,
  validateDocument,
  nativeDocumentData,
} from "../src/core/model";
import { CommandSchema } from "../src/core/commands";
it("review anchors retain their latest world context after cross-page movement, deletion and native reload", () => {
  const d = blankDocument();
  d.nodes.push(
    makeNode("frame", d.pages[0].id, {
      id: "frame",
      name: "Original",
      x: 20,
      y: 30,
    }),
  );
  const e = new DesignEngine(d);
  e.dispatch([
    CommandSchema.parse({
      op: "review_add",
      id: "thread",
      anchor: { pageId: e.pageId, nodeId: "frame", x: 10, y: 15 },
      message: { id: "first", author: "You", body: "Review this frame" },
    }),
  ]);
  e.dispatch([
    { op: "update", ids: ["frame"], patch: { x: 200, y: 300, name: "Moved" } },
    { op: "delete", ids: ["frame"] },
  ]);
  expect(e.document.reviewThreads[0].anchor).toMatchObject({
    nodeName: "Moved",
    lastX: 210,
    lastY: 315,
  });
  e.dispatch([
    CommandSchema.parse({
      op: "review_reply",
      id: "thread",
      message: { id: "reply", author: "Agent", body: "Retained context" },
    }),
    { op: "review_resolve", id: "thread", resolved: true },
  ]);
  expect(() =>
    e.dispatch([
      CommandSchema.parse({
        op: "review_reply",
        id: "thread",
        message: { id: "late", author: "You", body: "Closed" },
      }),
    ]),
  ).toThrow(/Reopen/);
  const saved = validateDocument(nativeDocumentData(e.document));
  expect(saved.reviewThreads).toEqual(e.document.reviewThreads);
  e.history("undo", e.guard());
  expect(e.document.reviewThreads[0].resolved).toBe(false);
});
it("transient agent status expires, never changes revision/history, and resets on document replacement", () => {
  vi.useFakeTimers();
  try {
    const e = new DesignEngine();
    const before = e.document;
    const revision = before.revision;
    e.setActivity(before.id, "Agent", "Checking components", 1000);
    expect(e.getSnapshot().activity?.message).toBe("Checking components");
    expect(e.document).toBe(before);
    expect(e.document.revision).toBe(revision);
    expect(e.getSnapshot().canUndo).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(e.getSnapshot().activity).toBeNull();
    e.setActivity(before.id, "Agent", "Working");
    e.replace(blankDocument());
    expect(e.getSnapshot().activity).toBeNull();
    expect(() => e.setActivity(before.id, "Agent", "Stale")).toThrow(/changed/);
  } finally {
    vi.useRealTimers();
  }
});
