import catalog from "./catalog.json" with { type: "json" };

export const iconCatalog = catalog;
export type NativeIcon = (typeof catalog.icons)[number];
export const iconAttribution = `Lucide ${catalog.version}\n${catalog.source}\n\n${catalog.license}`;
export function findIcons(query = "") {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return catalog.icons.filter((icon) =>
    words.every((word) =>
      `${icon.id} ${icon.name} ${icon.keywords.join(" ")}`
        .toLowerCase()
        .includes(word),
    ),
  );
}
