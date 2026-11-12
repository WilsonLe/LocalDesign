import type { DocumentFont } from "./schema";
export const families = [
  { slug: "inter", family: "Inter", category: "sans-serif" },
  { slug: "source-serif-4", family: "Source Serif 4", category: "serif" },
  { slug: "ibm-plex-mono", family: "IBM Plex Mono", category: "monospace" },
] as const;
export type FontChoice = Pick<
  DocumentFont,
  "id" | "family" | "weight" | "style" | "source"
> & { category?: string };
export const bundledCatalog: FontChoice[] = families.flatMap((f) =>
  (f.slug === "ibm-plex-mono" ? ["400", "700"] : ["400", "600", "700"]).flatMap(
    (weight) =>
      (["normal", "italic"] as const).map((style) => ({
        id: `bundle-${f.slug}-${weight}-${style}`,
        family: f.family,
        category: f.category,
        weight,
        style,
        source: "bundled" as const,
      })),
  ),
);
