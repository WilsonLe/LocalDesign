import { expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { nativeImport } from "../src/files/native";
import { blankDocument, makeNode, uid } from "../src/core/model";
const archive = (raw: unknown, extra: Record<string, Uint8Array> = {}) =>
  zipSync({ "document.json": strToU8(JSON.stringify(raw)), ...extra });
it("reopens editable native files with embedded asset bytes and fresh workspace identity", () => {
  const doc = blankDocument("A portable design"),
    id = uid();
  doc.assets.push({
    id,
    name: "pixel",
    mime: "image/png",
    data: `assets/${id}.png`,
    width: 1,
    height: 1,
  });
  doc.nodes.push(makeNode("image", doc.pages[0].id, { assetId: id }));
  const imported = nativeImport(
    archive(doc, {
      [`assets/${id}.png`]: Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    }),
  );
  expect(imported.id).not.toBe(doc.id);
  expect(imported.nodes[0].assetId).toBe(id);
  expect(imported.assets[0].data).toBe("data:image/png;base64,iVBORw0KGgo=");
});
it("rejects unsafe paths, future versions, missing or mismatched assets and invalid JSON", () => {
  const d = blankDocument();
  expect(() => nativeImport(archive(d, { "../escape": strToU8("x") }))).toThrow(
    /path/,
  );
  expect(() => nativeImport(archive({ ...d, schemaVersion: 8 }))).toThrow(
    /version/,
  );
  expect(() =>
    nativeImport(zipSync({ "document.json": strToU8("{") })),
  ).toThrow(/invalid/);
  const id = uid();
  d.assets = [
    {
      id,
      name: "Missing",
      mime: "image/png",
      data: `assets/${id}.png`,
      width: 1,
      height: 1,
    },
  ];
  expect(() => nativeImport(archive(d))).toThrow(/Missing/);
  expect(() =>
    nativeImport(archive(d, { [`assets/${id}.png`]: strToU8("<svg/>") })),
  ).toThrow(/MIME/);
});
it("rejects declared archive expansion before decompression", () => {
  const b = archive(blankDocument()),
    view = new DataView(b.buffer);
  for (let i = 0; i < b.length - 28; i++) {
    if (view.getUint32(i, true) === 0x02014b50) {
      view.setUint32(i + 24, 81_000_000, true);
      break;
    }
  }
  expect(() => nativeImport(b)).toThrow(/expands/);
});
it("never treats a non-archive as a design", () => {
  expect(() => nativeImport(strToU8("Not a zip"))).toThrow(/valid/);
});
