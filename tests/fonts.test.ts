import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { unzipSync, strFromU8, zipSync, strToU8 } from "fflate";
import { expect, it } from "vitest";
import { DesignEngine } from "../src/core/engine";
import { blankDocument, makeNode, validateDocument } from "../src/core/model";
import { localFont, readFont, validateFontRecord } from "../src/fonts/data";
import { nativeExport, nativeImport } from "../src/files/native";
import { resolveFont } from "../src/render/fonts";
import { bundledCatalog, families } from "../src/fonts/bundled";
import { base64, portableFont } from "../src/fonts/data";
import type { DocumentFont } from "../src/fonts/schema";
import { measureText } from "../src/render/text";
import shapingReference from "./fixtures/fonts/shaping-reference.json" with { type: "json" };
import { MAX_ASSETS } from "../src/core/limits";

const bytes = (path: string) => new Uint8Array(readFileSync(path));
const serif = () =>
  localFont(
    bytes("tests/fixtures/fonts/SourceSerif4-Regular.otf"),
    "SourceSerif4-Regular.otf",
    "SIL OFL 1.1; editable redistribution permitted",
  );
it("opens a full image catalog with portable multi-file local fonts in the same archive", () => {
  const doc = blankDocument(),
    font = localFont(
      bytes(
        "node_modules/@fontsource/inter/files/inter-vietnamese-600-italic.woff2",
      ),
      "Licensed subset fixture",
      "SIL OFL 1.1",
    ),
    png = Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
        "base64",
      ),
    );
  doc.assets = Array.from({ length: MAX_ASSETS }, (_, i) => ({
    id: `image-${i}`,
    name: `Image ${i}`,
    mime: "image/png" as const,
    data: `data:image/png;base64,${base64(png)}`,
    width: 1,
    height: 1,
  }));
  doc.fonts = Array.from({ length: 48 }, (_, i) => ({
    ...font,
    id: `local-face-${i}`,
    files: Array.from({ length: 3 }, () => ({ ...font.files[0] })),
  }));
  validateDocument(doc);
  const portable = structuredClone(doc),
    entries: Record<string, Uint8Array> = {};
  for (const asset of portable.assets) {
    asset.data = `assets/${asset.id}.png`;
    entries[asset.data] = png;
  }
  for (const face of portable.fonts)
    face.files.forEach((file, i) => {
      file.data = `fonts/${face.id}-${i}.${file.format}`;
      entries[file.data] = bytes(
        "node_modules/@fontsource/inter/files/inter-vietnamese-600-italic.woff2",
      );
    });
  entries["document.json"] = strToU8(JSON.stringify(portable));
  const reopened = nativeImport(zipSync(entries));
  expect(reopened.assets).toEqual(doc.assets);
  expect(reopened.fonts).toEqual(doc.fonts);
});
it("shapes exact pinned bytes against independent HarfBuzz kerning and ligature advances", () => {
  for (const reference of shapingReference.fonts) {
    const data = bytes(reference.path);
    expect(createHash("sha256").update(data).digest("hex")).toBe(
      reference.sha256,
    );
    const font = localFont(data, reference.path, "SIL OFL 1.1"),
      doc = blankDocument();
    doc.fonts.push(font);
    for (const [text, advance] of Object.entries(reference.advances)) {
      const node = makeNode("text", doc.pages[0].id, {
        fontFamily: font.family,
        fontId: font.id,
        fontSize: 72,
        text,
        width: 10000,
        height: 200,
      });
      expect(measureText(node, doc).width).toBeCloseTo(
        (advance * 72) / reference.unitsPerEm,
        6,
      );
    }
  }
});
it("every bundled face matches its real bytes, license and total portable reserve", async () => {
  const doc = blankDocument();
  doc.fonts = bundledCatalog.map((face) => {
    const slug = families.find((f) => f.family === face.family)!.slug;
    const font: DocumentFont = {
      id: face.id,
      family: face.family,
      weight: face.weight,
      style: face.style,
      source: "bundled",
      files: ["latin", "latin-ext", "vietnamese"].map((subset) => ({
        format: "woff2",
        data: base64(
          bytes(
            `node_modules/@fontsource/${slug}/files/${slug}-${subset}-${face.weight}-${face.style}.woff2`,
          ),
        ),
      })),
      license: readFileSync(`public/${slug}-OFL.txt`, "utf8").trim(),
      provenance: "x".repeat(1000),
      redistributionAllowed: true,
    };
    expect(() => validateFontRecord(font)).not.toThrow();
    return font;
  });
  expect(() => validateDocument(doc)).not.toThrow();
  const bad = structuredClone(doc.fonts[0]);
  bad.files[0] = doc.fonts[1].files[0];
  expect(() => validateFontRecord(bad)).toThrow(/match|identity/);
  const entries = unzipSync(
    new Uint8Array(await (await nativeExport(doc)).arrayBuffer()),
  );
  const raw = JSON.parse(strFromU8(entries["document.json"]));
  expect(raw.fonts).toEqual([]);
  expect(JSON.parse(strFromU8(entries["fonts/catalog.json"]))).toEqual(
    doc.fonts.map(portableFont),
  );
  expect(nativeImport(zipSync(entries)).fonts.length).toBe(
    bundledCatalog.length,
  );
});
it("reads intrinsic static face identity and actual character coverage in all supported containers", () => {
  for (const [path, format, family] of [
    ["tests/fixtures/fonts/SourceSerif4-Regular.otf", "otf", "Source Serif 4"],
    ["tests/fixtures/fonts/IBMPlexMono-Regular.ttf", "ttf", "IBM Plex Mono"],
    [
      "node_modules/@fontsource/inter/files/inter-vietnamese-600-italic.woff2",
      "woff2",
      "Inter",
    ],
    [
      "node_modules/@fontsource/inter/files/inter-vietnamese-600-italic.woff",
      "woff",
      "Inter SemiBold",
    ],
  ]) {
    const font = readFont(bytes(path));
    expect(font.format).toBe(format);
    expect(font.family).toBe(family);
    expect(font.characters.has("ệ".codePointAt(0)!)).toBe(true);
    if (format.startsWith("woff"))
      expect([font.weight, font.style]).toEqual(["600", "italic"]);
  }
});
it("rejects corrupt, unsupported, oversized, expanding and embedding-restricted fonts", () => {
  expect(() =>
    readFont(
      bytes("tests/fixtures/fonts/IBMPlexMono-Regular.ttf").subarray(0, 16),
    ),
  ).toThrow(/corrupt|Truncated|bounds/);
  expect(() => readFont(new TextEncoder().encode("not a font at all"))).toThrow(
    /static/,
  );
  expect(() => readFont(new Uint8Array(4_000_001))).toThrow(/4 MB/);
  const compressed = bytes(
    "node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2",
  );
  new DataView(compressed.buffer).setUint32(16, 16_000_001);
  expect(() => readFont(compressed)).toThrow(/16 MB/);
  const restricted = bytes("tests/fixtures/fonts/IBMPlexMono-Regular.ttf"),
    view = new DataView(restricted.buffer);
  for (let i = 12; i < 12 + view.getUint16(4) * 16; i += 16) {
    if (String.fromCharCode(...restricted.subarray(i, i + 4)) === "OS/2")
      view.setUint16(view.getUint32(i + 8) + 8, 2);
  }
  expect(() => readFont(restricted)).toThrow(/restricts/);
});
it("font edits use guarded atomic history, retain requested identity and never resize text", () => {
  const doc = blankDocument(),
    font = serif(),
    node = makeNode("text", doc.pages[0].id, {
      id: "heading",
      fontFamily: "Iowan Old Style",
      fontWeight: "500",
      fontStyle: "oblique",
      fontSize: 51,
      lineHeight: 1.15,
      letterSpacing: -1.5,
      text: "Tiếng Việt",
      width: 490,
      height: 120,
    });
  doc.nodes.push(node);
  const engine = new DesignEngine(doc),
    guard = engine.guard();
  const request = {
    ...guard,
    commands: [
      { op: "font_add" as const, font },
      { op: "update" as const, ids: [node.id], patch: { fontId: font.id } },
    ],
  };
  const receipt = engine.edit(request);
  expect(engine.edit(request)).toEqual(receipt);
  expect(engine.document.nodes[0]).toEqual({ ...node, fontId: font.id });
  const resolved = resolveFont(engine.document.nodes[0], engine.document);
  expect(resolved.status).toBe("mapped");
  expect(resolved.requested.family).toBe("Iowan Old Style");
  expect(resolved.family).toBe("Source Serif 4");
  expect(() =>
    engine.edit({
      ...guard,
      requestId: "stale",
      commands: [{ op: "rename", name: "stale" }],
    }),
  ).toThrow(/revision/);
  engine.history("undo", engine.guard());
  expect(engine.document.fonts).toHaveLength(0);
  expect(engine.document.nodes[0]).toEqual(node);
  engine.history("redo", engine.guard());
  expect(engine.document.fonts).toHaveLength(1);
  const current = engine.document;
  expect(() =>
    engine.dispatch([
      { op: "rename", name: "must roll back" },
      {
        op: "font_add",
        font: { ...font, id: "forged", family: "Fake family" },
      },
    ]),
  ).toThrow(/metadata|match/);
  expect(engine.document).toBe(current);
  expect(() =>
    validateFontRecord({ ...font, redistributionAllowed: false } as never),
  ).toThrow();
});
it("native v2 embeds the actual local face, notices and requested/mapped identity; v1 remains editable", async () => {
  const doc = blankDocument(),
    font = serif();
  doc.fonts.push(font);
  doc.nodes.push(
    makeNode("text", doc.pages[0].id, {
      fontFamily: "Original serif",
      fontId: font.id,
      text: "Tiếng Việt editable",
      fontSize: 37,
      letterSpacing: 1.25,
    }),
  );
  const file = new Uint8Array(await (await nativeExport(doc)).arrayBuffer()),
    entries = unzipSync(file);
  const raw = JSON.parse(strFromU8(entries["document.json"]));
  expect(raw.schemaVersion).toBe(2);
  expect(raw.fonts[0].files[0].data).toBe(`fonts/${font.id}-0.otf`);
  expect(entries[raw.fonts[0].files[0].data]).toEqual(
    bytes("tests/fixtures/fonts/SourceSerif4-Regular.otf"),
  );
  expect(raw.fonts[0].license).toContain("OFL");
  const reopened = nativeImport(file);
  expect(reopened.fonts).toEqual(doc.fonts);
  expect(reopened.nodes).toEqual(doc.nodes);
  const missing = { ...entries };
  delete missing[raw.fonts[0].files[0].data];
  expect(() => nativeImport(zipSync(missing))).toThrow(/Missing/);
  const corrupt = {
    ...entries,
    [raw.fonts[0].files[0].data]: strToU8("corrupt font bytes"),
  };
  expect(() => nativeImport(zipSync(corrupt))).toThrow();
  const legacy = { ...blankDocument(), schemaVersion: 1, fonts: undefined };
  const old = nativeImport(
    zipSync({ "document.json": strToU8(JSON.stringify(legacy)) }),
  );
  expect(old.schemaVersion).toBe(2);
  expect(old.fonts).toEqual([]);
  expect(validateDocument(old)).toEqual(old);
});
