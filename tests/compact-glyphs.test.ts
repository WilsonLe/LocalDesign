import { expect, it } from "vitest";
import { compactLine } from "../src/render/glyphs";

it("keeps overlapping glyphs in separate paint operations and bounds outline expansion", () => {
  const glyph = {
    id: "test",
    path: "M0 0L10 10Z",
    x: 0,
    y: 20,
    scale: 2,
    ink: { x: 0, y: 0, width: 20, height: 20 },
  };
  const paths = compactLine({
    width: 100,
    glyphs: [
      glyph,
      { ...glyph, x: 30, ink: { ...glyph.ink, x: 30 } },
      { ...glyph, x: 40, ink: { ...glyph.ink, x: 40 } },
    ],
  })!;
  expect(paths).toHaveLength(2);
  expect(paths[0]).toBe("M0 20L20 0ZM30 20L50 0Z");
  expect(paths[1]).toBe("M40 20L60 0Z");
  const large = {
    width: 1,
    glyphs: [{ ...glyph, path: "M0 0L10 10Z".repeat(30000) }],
  };
  expect(compactLine(large)).toBeNull();
  expect(compactLine(large)).toBeNull();
});
