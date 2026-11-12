import { z } from "zod";
import { MAX_FONT_FILE_BYTES, MAX_DOCUMENT_FONTS } from "../core/limits";

export const FontWeight = z.string().regex(/^(?:[1-9]\d{0,2}|1000)$/);
export const FontStyle = z.enum(["normal", "italic", "oblique"]);
export const FontFamily = z.string().trim().min(1).max(200);
export const FontFileSchema = z
  .object({
    format: z.enum(["ttf", "otf", "woff", "woff2"]),
    data: z
      .string()
      .min(4)
      .max(Math.ceil(MAX_FONT_FILE_BYTES / 3) * 4)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
export const FontSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[\w-]+$/),
    family: FontFamily,
    weight: FontWeight,
    style: FontStyle,
    source: z.enum(["bundled", "local"]),
    files: z.array(FontFileSchema).min(1).max(3),
    license: z.string().trim().min(1).max(16000),
    provenance: z.string().trim().min(1).max(1000),
    redistributionAllowed: z.literal(true),
  })
  .strict();
export const DocumentFonts = z
  .array(FontSchema)
  .max(MAX_DOCUMENT_FONTS)
  .default([]);
export type DocumentFont = z.infer<typeof FontSchema>;
export type FontFile = z.infer<typeof FontFileSchema>;
