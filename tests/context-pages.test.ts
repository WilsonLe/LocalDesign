import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { DesignEngine } from "../src/core/engine";
import {
  blankDocument,
  makeNode,
  uid,
  validateDocument,
} from "../src/core/model";
import { worldPoint, worldRotation } from "../src/core/geometry";
import { inspectNodes } from "../src/core/inspection";
import { nativeImport } from "../src/files/native";

describe("portable document context", () => {
  it("migrates v1/v2 with empty context and keeps legacy nodes editable", () => {
    for (const schemaVersion of [1, 2]) {
      const doc = blankDocument();
      const legacy = { ...doc, schemaVersion } as Record<string, unknown>;
      delete legacy.guidelines;
      delete legacy.decisions;
      delete legacy.references;
      legacy.nodes = [
        makeNode("text", doc.pages[0].id, { text: "Original copy" }),
      ];
      const imported = nativeImport(
        zipSync({ "document.json": strToU8(JSON.stringify(legacy)) }),
      );
      expect(imported.schemaVersion).toBe(3);
      expect(imported.guidelines).toEqual([]);
      expect(imported.references).toEqual([]);
      const engine = new DesignEngine(imported);
      engine.dispatch([
        {
          op: "update",
          ids: [imported.nodes[0].id],
          patch: { text: "Still editable" },
        },
      ]);
      expect(engine.document.nodes[0].text).toBe("Still editable");
    }
  });
  it("keeps atomic context edits, retry identity and undo shared with document history", () => {
    const engine = new DesignEngine(),
      id = uid();
    const request = {
      ...engine.guard(),
      commands: [
        {
          op: "guideline_set" as const,
          guideline: {
            id,
            name: "Brand",
            content: "Use a quiet editorial direction.",
          },
        },
      ],
    };
    const result = engine.edit(request);
    engine.dispatch([
      {
        op: "decision_add",
        decision: {
          id: uid(),
          decision: "Use serif headings",
          rationale: "Matches the approved reference",
          author: "Designer",
          createdAt: "2026-11-13T00:00:00Z",
        },
      },
    ]);
    expect(engine.edit(request)).toEqual(result);
    const before = engine.document;
    expect(() =>
      engine.dispatch([
        { op: "rename", name: "Must not persist" },
        {
          op: "guideline_set",
          guideline: { id: uid(), name: "brand", content: "Conflicting guide" },
        },
      ]),
    ).toThrow(/unique/);
    expect(engine.document).toBe(before);
    engine.history("undo", engine.guard());
    expect(engine.document.decisions).toEqual([]);
    expect(engine.document.guidelines[0].id).toBe(id);
    engine.history("undo", engine.guard());
    expect(engine.document.guidelines).toEqual([]);
  });
  it("rejects missing reference assets and context ID collisions before committing earlier commands", () => {
    const engine = new DesignEngine(),
      before = engine.document;
    expect(() =>
      engine.dispatch([
        { op: "rename", name: "Discard me" },
        {
          op: "reference_set",
          reference: {
            id: uid(),
            title: "Missing capture",
            assetId: "missing",
            provenance: "Test reference",
          },
        },
      ]),
    ).toThrow(/reference image/);
    expect(engine.document).toBe(before);
    expect(() =>
      engine.dispatch([
        {
          op: "guideline_set",
          guideline: {
            id: before.pages[0].id,
            name: "Collision",
            content: "No",
          },
        },
      ]),
    ).toThrow(/Duplicate ID/);
    expect(() =>
      validateDocument({
        ...before,
        decisions: [
          {
            id: uid(),
            decision: "x",
            rationale: "y",
            author: "z",
            createdAt: "invalid",
          },
        ],
      }),
    ).toThrow();
  });
});

describe("page organization", () => {
  it("requires a complete page permutation and preserves identity through undo", () => {
    const doc = blankDocument();
    doc.pages.push({ id: uid(), name: "Second", background: "#202020" });
    const engine = new DesignEngine(doc),
      ids = doc.pages.map((p) => p.id);
    engine.dispatch([{ op: "pages_reorder", pageIds: [...ids].reverse() }]);
    expect(engine.document.pages.map((p) => p.id)).toEqual([...ids].reverse());
    expect(() =>
      engine.dispatch([{ op: "pages_reorder", pageIds: [ids[0], ids[0]] }]),
    ).toThrow(/exactly once/);
    expect(() =>
      engine.dispatch([{ op: "pages_reorder", pageIds: [ids[0], "missing"] }]),
    ).toThrow(/Unknown/);
    engine.history("undo", engine.guard());
    expect(engine.document.pages.map((p) => p.id)).toEqual(ids);
  });
  it("moves a rotated nested subtree to another page with the same world transform and node IDs", () => {
    const doc = blankDocument(),
      destination = uid();
    doc.pages.push({
      id: destination,
      name: "Destination",
      background: "#ffffff",
    });
    const outer = makeNode("frame", doc.pages[0].id, {
      x: 310,
      y: 90,
      rotation: 21,
    });
    const inner = makeNode("group", doc.pages[0].id, {
      parentId: outer.id,
      x: 60,
      y: 40,
      rotation: -12,
    });
    const child = makeNode("rectangle", doc.pages[0].id, {
      parentId: inner.id,
      x: 10,
      y: 20,
    });
    doc.nodes.push(outer, inner, child);
    const point = worldPoint(doc, child),
      rotation = worldRotation(doc, child),
      engine = new DesignEngine(doc);
    engine.select([inner.id, child.id]);
    engine.dispatch([
      { op: "move_to_page", ids: [inner.id, child.id], pageId: destination },
    ]);
    const moved = engine.document.nodes.find((n) => n.id === child.id)!;
    expect(worldPoint(engine.document, moved).x).toBeCloseTo(point.x);
    expect(worldPoint(engine.document, moved).y).toBeCloseTo(point.y);
    expect(worldRotation(engine.document, moved)).toBeCloseTo(rotation);
    expect(moved.parentId).toBe(inner.id);
    expect(moved.pageId).toBe(destination);
    expect(
      engine.document.nodes.find((n) => n.id === inner.id)?.parentId,
    ).toBeNull();
    expect(engine.selection).toEqual([]);
    engine.select([inner.id], destination);
    engine.history("undo", engine.guard());
    expect(engine.document.nodes).toEqual(doc.nodes);
    expect(engine.selection).toEqual([]);
  });
  it("rejects moves through locked ancestors atomically", () => {
    const doc = blankDocument(),
      frame = makeNode("frame", doc.pages[0].id, { locked: true });
    const child = makeNode("text", doc.pages[0].id, { parentId: frame.id });
    doc.nodes.push(frame, child);
    const engine = new DesignEngine(doc),
      before = engine.document;
    expect(() =>
      engine.dispatch([
        { op: "rename", name: "No" },
        { op: "move_to_page", ids: [child.id], pageId: doc.pages[0].id },
      ]),
    ).toThrow(/Unlock/);
    expect(engine.document).toBe(before);
  });
});

it("bounds discovery, applies combined filters and omits editable payloads in summaries", () => {
  const doc = blankDocument(),
    frame = makeNode("frame", doc.pages[0].id, { name: "Hero", x: 100 });
  const text = makeNode("text", doc.pages[0].id, {
    name: "Hero title",
    parentId: frame.id,
    text: "Exact copy",
  });
  doc.nodes.push(frame, text);
  const overview = inspectNodes(doc, {
    detail: "overview",
    offset: 0,
    limit: 1,
  });
  expect(overview.total).toBe(1);
  expect(overview.nodes[0]).toMatchObject({
    id: frame.id,
    childCount: 1,
    worldBounds: { x: 100 },
  });
  expect(overview.nodes[0]).not.toHaveProperty("text");
  const focused = inspectNodes(doc, {
    rootId: frame.id,
    ids: [text.id],
    pageId: doc.pages[0].id,
    type: "text",
    query: "TITLE",
    detail: "full",
    offset: 0,
    limit: 1,
  });
  expect(focused.nodes).toEqual([text]);
  expect(focused.nextOffset).toBeNull();
  expect(() =>
    inspectNodes(doc, { ids: ["unknown"], offset: 0, limit: 100 }),
  ).toThrow(/Unknown node/);
});
