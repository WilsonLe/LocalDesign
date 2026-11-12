import { expect, it } from "vitest";
import { blankDocument, makeNode } from "../src/core/model";
import { exportBounds, exportDimensions } from "../src/files/export";

it("scales output bounds without changing native geometry and rejects invalid dimensions", () => {
  const doc = blankDocument(),
    frame = makeNode("frame", doc.pages[0].id, {
      x: 100,
      y: 60,
      width: 120,
      height: 80,
    });
  doc.nodes.push(frame);
  const box = exportBounds(doc, doc.pages[0].id, [frame.id]);
  expect(exportDimensions(box, 2)).toEqual({ width: 240, height: 160 });
  expect(exportDimensions(box, 0.5)).toEqual({ width: 60, height: 40 });
  expect(frame).toMatchObject({ x: 100, y: 60, width: 120, height: 80 });
  for (const scale of [0, -1, NaN, Infinity, 5])
    expect(() => exportDimensions(box, scale)).toThrow();
  expect(() => exportDimensions({ width: 10000, height: 100 }, 2)).toThrow(
    /16,384/,
  );
  expect(() => exportBounds(doc, doc.pages[0].id, ["missing"])).toThrow(
    /Export IDs/,
  );
});
