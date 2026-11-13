import {
  type DesignDocument,
  type DesignNode,
  type LibraryPayload,
  requireThat,
} from "./model";
import { componentClosure } from "./checkpoints";
import { exportFonts } from "../render/fonts";
import { tokenResolver } from "./tokens";
export function resourceClosure(
  doc: DesignDocument,
  rootIds: string[],
  nodes: DesignNode[] = [],
): LibraryPayload {
  const components = componentClosure(doc, [
    ...rootIds,
    ...nodes.flatMap((node) =>
      node.component ? [node.component.componentId] : [],
    ),
  ]);
  const all = [...nodes, ...components.flatMap((item) => item.nodes)];
  const rows = [
    ...all.flatMap((node) => node.component?.overrides ?? []),
    ...components.flatMap((item) =>
      item.variants.flatMap((variant) => variant.overrides),
    ),
  ];
  const assetIds = new Set(
      all.flatMap((node) => (node.assetId ? [node.assetId] : [])),
    ),
    fontIds = new Set(
      all.flatMap((node) => (node.fontId ? [node.fontId] : [])),
    ),
    families = new Set(
      all.filter((node) => node.type === "text").map((node) => node.fontFamily),
    );
  const themeIds = new Set(
      all.flatMap((node) => (node.tokenTheme ? [node.tokenTheme] : [])),
    ),
    tokenIds = new Set(
      all.flatMap((node) =>
        Object.values(node.bindings).filter(
          (id): id is string => typeof id === "string",
        ),
      ),
    );
  for (const row of rows) {
    for (const id of Object.values(row.bindings))
      if (typeof id === "string") tokenIds.add(id);
    if (typeof row.patch.assetId === "string") assetIds.add(row.patch.assetId);
    if (typeof row.patch.fontId === "string") fontIds.add(row.patch.fontId);
    if (typeof row.patch.fontFamily === "string")
      families.add(row.patch.fontFamily);
    if (typeof row.patch.tokenTheme === "string")
      themeIds.add(row.patch.tokenTheme);
  }
  for (const definition of components)
    for (const property of definition.properties)
      if (property.bindings.some((binding) => binding.field === "fontFamily"))
        for (const value of [property.defaultValue, ...property.options])
          if (typeof value === "string") families.add(value);
  const tokenMap = new Map(doc.tokens.map((token) => [token.id, token]));
  const visit = (id: string) => {
    const token = tokenMap.get(id);
    requireThat(
      token,
      "MISSING_TOKEN",
      "A library token dependency is missing.",
    );
    for (const [theme] of Object.entries(token.themes)) themeIds.add(theme);
    for (const value of [token.value, ...Object.values(token.themes)])
      if (typeof value === "object" && !tokenIds.has(value.tokenId)) {
        tokenIds.add(value.tokenId);
        visit(value.tokenId);
      }
  };
  for (const id of [...tokenIds]) visit(id);
  if (doc.activeTokenTheme) themeIds.add(doc.activeTokenTheme);
  const resolver = tokenResolver(doc);
  for (const id of tokenIds)
    if (tokenMap.get(id)!.type === "fontFamily")
      for (const theme of [null, ...themeIds])
        families.add(String(resolver.value(id, theme)));
  const fonts = (
    families.size || fontIds.size ? exportFonts(doc, true) : []
  ).filter((font) => fontIds.has(font.id) || families.has(font.family));
  return structuredClone({
    nodes,
    components,
    tokens: doc.tokens.filter((token) => tokenIds.has(token.id)),
    tokenThemes: doc.tokenThemes.filter((theme) => themeIds.has(theme.id)),
    activeTokenTheme: doc.activeTokenTheme,
    assets: doc.assets.filter((asset) => assetIds.has(asset.id)),
    fonts,
  });
}
