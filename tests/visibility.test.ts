import { expect, it } from "vitest";
import { blankDocument, makeNode } from "../src/core/model";
import { indexNodes } from "../src/core/tree";
import { visibleNodes } from "../src/render/visibility";

it("keeps rotated descendants of offscreen groups/unclipped frames, hidden and clipped branches stay absent", () => {
  const doc = blankDocument();
  const page = doc.pages[0].id;
  doc.nodes = [
    makeNode("group", page, {
      id: "group",
      x: 2000,
      y: 0,
      rotation: 90,
      width: 10,
      height: 10,
    }),
    makeNode("rectangle", page, {
      id: "rotated",
      parentId: "group",
      x: 20,
      y: 1900,
      width: 30,
      height: 30,
    }),
    makeNode("frame", page, {
      id: "unclipped",
      x: 3000,
      y: 0,
      clip: false,
      width: 10,
      height: 10,
    }),
    makeNode("rectangle", page, {
      id: "overflow",
      parentId: "unclipped",
      x: -2900,
      y: 40,
      width: 30,
      height: 30,
    }),
    makeNode("frame", page, {
      id: "clipped",
      x: 4000,
      y: 0,
      clip: true,
      width: 10,
      height: 10,
    }),
    makeNode("rectangle", page, {
      id: "clipped-child",
      parentId: "clipped",
      x: -3900,
      y: 40,
      width: 30,
      height: 30,
    }),
    makeNode("group", page, { id: "hidden", hidden: true }),
    makeNode("rectangle", page, { id: "hidden-child", parentId: "hidden" }),
    makeNode("path", page, { id: "path", x: 9000, path: "M-8900 0L-8800 100" }),
    makeNode("frame", page, {
      id: "stroke",
      x: 205,
      y: 10,
      width: 20,
      height: 20,
      stroke: "#fff",
      strokeWidth: 20,
    }),
  ];
  const visible = visibleNodes(
    doc,
    doc.nodes.filter((n) => !n.parentId),
    indexNodes(doc),
    { x: 0, y: 0, width: 200, height: 200 },
  );
  expect([...visible].sort()).toEqual(
    ["group", "rotated", "unclipped", "overflow", "path", "stroke"].sort(),
  );
});
