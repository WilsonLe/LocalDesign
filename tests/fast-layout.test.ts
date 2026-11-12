import { readFileSync } from "node:fs";
import { create } from "fontkit";
import { expect, it } from "vitest";
import { prefixWidths, lineWidth } from "../src/render/glyphs";
import { base64 } from "../src/fonts/data";
import type { DocumentFont } from "../src/fonts/schema";
import { bundledCatalog, families } from "../src/fonts/bundled";
import { fastLayout, prepareFastLayout } from "../src/render/fastLayout";

it("matches original bundled Latin shaping, including every wrapping prefix", async () => {
  await prepareFastLayout();
  const samples = [
    "AVATAR To Wa office affine ffi fl fj fi -> <-- --> === != <= >= (1234)",
    "Tiếng Việt: Trường học, cộng đồng, Đăng nhập, Quản lý lớp học",
    "ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞß àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ",
    "“Typography” – naïve, façade, œuf; Āā Ăă Ąą Łł Žž € $ £ ¥ 0123456789",
    "Text\tcontrol\u007f\u00ad spaces\u00a0and accents".normalize("NFC"),
  ];
  for (const choice of bundledCatalog) {
    const slug = families.find(
      (family) => family.family === choice.family,
    )!.slug;
    for (const subset of ["latin", "latin-ext", "vietnamese"]) {
      const font = create(
        new Uint8Array(
          readFileSync(
            `node_modules/@fontsource/${slug}/files/${slug}-${subset}-${choice.weight}-${choice.style}.woff2`,
          ),
        ),
      );
      const record = {
        ...choice,
        files: [
          {
            format: "woff2",
            data: base64(
              new Uint8Array(
                readFileSync(
                  `node_modules/@fontsource/${slug}/files/${slug}-${subset}-${choice.weight}-${choice.style}.woff2`,
                ),
              ),
            ),
          },
        ],
      } as DocumentFont;
      for (const sample of samples) {
        const covered = Array.from(sample)
          .filter(
            (c) =>
              font.characterSet.includes(c.codePointAt(0)!) &&
              !/[\u0000-\u001f\u007f-\u009f\u00ad]/u.test(c),
          )
          .join("");
        for (const letterSpacing of [-2, 0, 1.25]) {
          const n = { fontSize: 17.3, letterSpacing };
          const prefixes = prefixWidths(n, record, covered);
          for (const [length, width] of prefixes)
            expect(width).toBe(lineWidth(n, record, covered.slice(0, length)));
        }
        for (let length = 1; length <= covered.length; length++) {
          const text = covered.slice(0, length);
          for (const tracking of [false, true]) {
            const expected = font.layout(
              text,
              tracking ? { liga: false, clig: false } : undefined,
            );
            const actual = fastLayout(font, text, tracking);
            expect(
              actual,
              `${choice.id} ${subset}: ${JSON.stringify(text)}`,
            ).not.toBeNull();
            expect(actual!.glyphs.map((g) => g.id)).toEqual(
              expected.glyphs.map((g) => g.id),
            );
            expect(
              actual!.positions,
              `${choice.id} ${subset} ${tracking}: ${JSON.stringify(text)}`,
            ).toEqual(
              expected.positions.map(
                ({ xAdvance, yAdvance, xOffset, yOffset }) => ({
                  xAdvance,
                  yAdvance,
                  xOffset,
                  yOffset,
                }),
              ),
            );
          }
        }
      }
    }
  }
}, 120000);

it("keeps exhaustive grapheme wrapping at narrow boundaries and with negative tracking", async () => {
  const { blankDocument, makeNode } = await import("../src/core/model");
  const { measureText } = await import("../src/render/text");
  const { validateFontRecord } = await import("../src/fonts/data");
  await prepareFastLayout();
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  for (const choice of bundledCatalog) {
    const slug = families.find(
      (family) => family.family === choice.family,
    )!.slug;
    const files = ["latin", "latin-ext", "vietnamese"].map((subset) => ({
      format: "woff2" as const,
      data: readFileSync(
        `node_modules/@fontsource/${slug}/files/${slug}-${subset}-${choice.weight}-${choice.style}.woff2`,
      ).toString("base64"),
    }));
    const record: DocumentFont = {
      id: choice.id,
      family: choice.family,
      weight: choice.weight,
      style: choice.style,
      source: "bundled",
      files,
      license: readFileSync(`public/${slug}-OFL.txt`, "utf8").trim(),
      provenance: "Pinned bundled comparison",
      redistributionAllowed: true,
    };
    validateFontRecord(record);
    const fonts = files.map((file) =>
      create(new Uint8Array(Buffer.from(file.data, "base64"))),
    );
    const doc = blankDocument();
    doc.fonts = [record];
    for (const letterSpacing of [-2, 0, 1.25]) {
      const rawWidth = (text: string) => {
        const segments: { face: number; text: string }[] = [];
        for (const c of text) {
          const index = fonts.findIndex((f) =>
            f.characterSet.includes(c.codePointAt(0)!),
          );
          const face = Math.max(0, index),
            last = segments.at(-1);
          if (last?.face === face) last.text += c;
          else segments.push({ face, text: c });
        }
        let x = 0,
          spaced = false;
        for (const segment of segments)
          for (const position of fonts[segment.face].layout(
            segment.text,
            letterSpacing ? { liga: false, clig: false } : undefined,
          ).positions) {
            x += position.xAdvance * (17.3 / fonts[segment.face].unitsPerEm);
            if (position.xAdvance) {
              x += letterSpacing;
              spaced = true;
            }
          }
        return x - (spaced ? letterSpacing : 0);
      };
      for (const text of [
        "AV office -> Lớp học: Tiếng Việt, “Typography” € 123",
        "Ta\nĐa\u0306ng ky\u0301, ffi và cộng đồng",
        "missing ☃ and soft\u00adhyphen",
      ]) {
        const normalized = text.normalize("NFC");
        const widths = [
          1,
          30,
          90,
          200,
          10000,
          rawWidth(normalized.split("\n")[0]) - 1e-7,
          rawWidth(normalized.split("\n")[0]) + 1e-7,
        ];
        for (const width of widths) {
          const lines: string[] = [];
          for (const paragraph of normalized.split("\n")) {
            let line = "";
            for (const { segment } of segmenter.segment(paragraph)) {
              if (line && rawWidth(line + segment) > width) {
                const split = line.lastIndexOf(" ");
                if (split > line.length * 0.4) {
                  lines.push(line.slice(0, split));
                  line = line.slice(split + 1) + segment;
                } else {
                  lines.push(line);
                  line = segment;
                }
              } else line += segment;
            }
            lines.push(line);
          }
          const node = makeNode("text", doc.pages[0].id, {
            text,
            fontFamily: choice.family,
            fontId: choice.id,
            fontSize: 17.3,
            fontWeight: choice.weight,
            fontStyle: choice.style,
            letterSpacing,
            width,
          });
          expect(
            measureText(node, doc).lines,
            `${choice.id}: ${JSON.stringify(text)} spacing=${letterSpacing} width=${width}`,
          ).toEqual(lines);
        }
      }
    }
  }
}, 120000);

it("leaves controls, default ignorables, missing glyphs and complex scripts to the original shaper", async () => {
  await prepareFastLayout();
  const font = create(
    new Uint8Array(
      readFileSync(
        "node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2",
      ),
    ),
  );
  for (const text of [
    "soft\u00adhyphen",
    "a\u200db",
    "a\u200bb",
    "a\t b",
    "missing ☃",
    "مرحبا",
    "हिन्दी",
  ])
    expect(fastLayout(font, text, false)).toBeNull();
});
