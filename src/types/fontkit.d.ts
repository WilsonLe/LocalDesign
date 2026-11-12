declare module "fontkit" {
  export interface Glyph {
    id: number;
    codePoints: number[];
    path: { toSVG(): string };
  }
  export function create(bytes: Uint8Array): {
    familyName: string;
    subfamilyName: string;
    italicAngle: number;
    numGlyphs: number;
    unitsPerEm: number;
    getGlyph(id: number): Glyph;
    layout(
      text: string,
      features?: Record<string, boolean>,
    ): {
      glyphs: Glyph[];
      positions: {
        xAdvance: number;
        yAdvance: number;
        xOffset: number;
        yOffset: number;
      }[];
    };
    characterSet: number[];
    variationAxes: Record<string, unknown>;
    name: { records: Record<string, Record<string, string>> };
    directory: { tables: Record<string, unknown> };
    "OS/2": {
      usWeightClass: number;
      fsType: {
        noEmbedding: boolean;
        viewOnly: boolean;
        editable: boolean;
        bitmapOnly: boolean;
      };
      fsSelection: { italic: boolean; oblique: boolean };
    };
  };
}
declare module "fontkit/core" {
  export { create } from "fontkit";
  export function registerFormat(format: unknown): void;
}
declare module "fontkit/formats/TTFFont" {
  export const TTFFont: unknown;
}
declare module "fontkit/formats/WOFFFont" {
  export const WOFFFont: unknown;
}
declare module "fontkit/formats/WOFF2Font" {
  export const WOFF2Font: unknown;
}
