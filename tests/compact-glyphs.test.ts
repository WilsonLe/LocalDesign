import { expect, it } from "vitest";
import { compactLine } from "../src/render/glyphs";

it("retains live line references after geometry-cache eviction", () => {
  const retained = {
    geometryKey: "retained-geometry",
    width: 10,
    positions: new Float64Array([0, 10, 1]),
    glyphs: [
      {
        id: "retained-glyph",
        path: "M0 0L10 10Z",
        minX: 0,
        minY: 0,
        maxX: 10,
        maxY: 10,
      },
    ],
  };
  const first = compactLine(retained)!;
  const large = {
    ...retained.glyphs[0],
    id: "geometry-eviction-glyph",
    path: "M0 0L10 10Z".repeat(15000),
  };
  for (let i = 0; i < 40; i++)
    expect(
      compactLine({
        geometryKey: `evict-${i}`,
        width: 10,
        glyphs: [large],
        positions: new Float64Array([0, 10, 1]),
      }),
    ).not.toBeNull();
  const rebuilt = compactLine({ ...retained, glyphs: [...retained.glyphs] })!;
  expect(rebuilt.id).not.toBe(first.id);
  expect(compactLine(retained)!.id).toBe(first.id);
  expect(compactLine(retained)!.paths).toBe(first.paths);
});

it("shares normalized line geometry while retaining each requested scale", () => {
  const line = (scale: number) => ({
    geometryKey: "shared-geometry-test",
    width: 10 * scale,
    positions: new Float64Array([0, 10 * scale, scale]),
    glyphs: [
      {
        id: "shared-geometry-glyph",
        path: "M0 0L10 10Z",
        minX: 0,
        minY: 0,
        maxX: 10,
        maxY: 10,
      },
    ],
  });
  const first = compactLine(line(2))!;
  const second = compactLine(line(3.125))!;
  expect(second.id).toBe(first.id);
  expect(second.paths).toBe(first.paths);
  expect(first.scale).toBe(2);
  expect(second.scale).toBe(3.125);
});

it("keeps overlapping glyphs in separate paint operations and bounds outline expansion", () => {
  const glyph = {
    id: "test",
    path: "M0 0L10 10Z",
    minX: 0,
    minY: 0,
    maxX: 10,
    maxY: 10,
  };
  const paths = compactLine({
    width: 100,
    glyphs: [glyph, glyph, glyph],
    positions: new Float64Array([0, 20, 2, 30, 20, 2, 40, 20, 2]),
  })!;
  expect(paths.scale).toBe(2);
  expect(paths.paths).toHaveLength(2);
  expect(paths.paths[0]).toBe("M0 -10l10 10zM15 -10l10 10z");
  expect(paths.paths[1]).toBe("M20 -10l10 10z");
  expect(
    compactLine({
      width: 100,
      glyphs: [glyph, glyph],
      positions: new Float64Array([0, 20, 2, 0, 20, 3]),
    }),
  ).toBeNull();
  const large = {
    width: 1,
    positions: new Float64Array([0, 20, 2]),
    glyphs: [{ ...glyph, path: "M0 0L10 10Z".repeat(30000) }],
  };
  expect(compactLine(large)).toBeNull();
  expect(compactLine(large)).toBeNull();
});
