import { expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { blankDocument, makeNode, validateDocument } from "../src/core/model";
import { DesignEngine } from "../src/core/engine";
import { nativeImport } from "../src/files/native";
import { MAX_ASSETS, MAX_PAGES, MAX_NODES } from "../src/core/limits";
import { CommandSchema } from "../src/core/commands";
import { bounds } from "../src/core/geometry";

it("calculates fit/export bounds for large visible selections without argument spreading", () => {
  const doc = blankDocument();
  doc.nodes = Array.from({ length: 40_000 }, (_, i) =>
    makeNode("rectangle", doc.pages[0].id, {
      id: `visible-${i}`,
      width: 1,
      height: 1,
      x: 0,
      y: 0,
    }),
  );
  validateDocument(doc);
  expect(bounds(doc, doc.nodes)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
});

it("retains an entire multi-document project, assets and large selections without flattening", () => {
  const doc = blankDocument("Combined project");
  doc.pages = Array.from({ length: 206 }, (_, i) => ({
    id: `page-${i}`,
    name: `Section ${i}`,
    background: "#202020",
  }));
  const png = Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  const files: Record<string, Uint8Array> = {};
  doc.assets = Array.from({ length: 656 }, (_, i) => {
    const path = `assets/image-${i}.png`;
    files[path] = png;
    return {
      id: `image-${i}`,
      name: `Image ${i}`,
      mime: "image/png" as const,
      data: path,
      width: 1,
      height: 1,
    };
  });
  doc.nodes = Array.from({ length: 17_716 }, (_, i) =>
    makeNode(
      i < 656 ? "image" : "rectangle",
      doc.pages[i % doc.pages.length].id,
      {
        id: `node-${i}`,
        assetId: i < 656 ? `image-${i}` : null,
      },
    ),
  );
  files["document.json"] = strToU8(JSON.stringify(doc));
  const imported = nativeImport(zipSync(files), true);
  expect(imported.pages).toEqual(doc.pages);
  expect(imported.nodes).toEqual(doc.nodes);
  expect(imported.assets).toHaveLength(656);
  expect(imported.assets.at(-1)?.data).toContain("data:image/png;base64,");
  const engine = new DesignEngine(imported);
  const ids = imported.nodes.slice(0, 5_001).map((n) => n.id);
  engine.dispatch([{ op: "update", ids, patch: { name: "Shared edit" } }]);
  expect(
    engine.document.nodes
      .slice(0, 5_001)
      .every((n) => n.name === "Shared edit"),
  ).toBe(true);
  engine.history("undo", engine.guard());
  expect(engine.document.nodes).toEqual(imported.nodes);
});

it("retains finite resource ceilings above the old limits", () => {
  const d = blankDocument();
  d.pages = Array.from({ length: MAX_PAGES + 1 }, (_, i) => ({
    id: `p-${i}`,
    name: "Page",
    background: "#202020",
  }));
  expect(() => validateDocument(d)).toThrow();
  expect(() =>
    CommandSchema.parse({
      op: "update",
      ids: Array(MAX_NODES + 1).fill("node"),
      patch: { x: 1 },
    }),
  ).toThrow();
  const raw = { ...blankDocument(), assets: Array(MAX_ASSETS + 1).fill(null) };
  expect(() =>
    nativeImport(zipSync({ "document.json": strToU8(JSON.stringify(raw)) })),
  ).toThrow(/asset catalog/);
});

it("creates a full 500-command batch in an existing 20,000-node workspace", () => {
  const doc = blankDocument();
  const page = doc.pages[0].id;
  const template = makeNode("rectangle", page);
  doc.nodes = Array.from({ length: 20_000 }, (_, i) => ({
    ...template,
    id: `existing-${i}`,
  }));
  const engine = new DesignEngine(doc);
  const result = engine.dispatch(
    Array.from({ length: 500 }, (_, i) => ({
      op: "create" as const,
      node: { ...template, id: `created-${i}` },
    })),
  );
  expect(result.createdIds).toHaveLength(500);
  expect(engine.document.nodes).toHaveLength(20_500);
  expect(engine.document.revision).toBe(1);
  engine.history("undo", engine.guard());
  expect(engine.document.nodes).toEqual(doc.nodes);
}, 10_000);
