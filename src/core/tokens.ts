import {
  NodeSchema,
  requireThat,
  type DesignDocument,
  type DesignNode,
  type TokenPropertyName,
} from "./model";
import { z } from "zod";
import {
  componentNodeId,
  componentThemeResolver,
  recordComponentBinding,
  resolveComponents,
} from "./components";

export const tokenPropertyTypes = {
  fill: "color",
  stroke: "color",
  strokeWidth: "spacing",
  opacity: "opacity",
  radius: "radius",
  width: "dimension",
  height: "dimension",
  fontFamily: "fontFamily",
  fontWeight: "fontWeight",
  fontSize: "fontSize",
  lineHeight: "lineHeight",
  letterSpacing: "letterSpacing",
  "layout.gap": "spacing",
  "layout.padding": "spacing",
} as const;

export function tokenResolver(doc: DesignDocument) {
  const tokens = new Map(doc.tokens.map((token) => [token.id, token]));
  const themes = new Set(doc.tokenThemes.map((theme) => theme.id));
  requireThat(
    new Set(doc.tokens.map((token) => token.name.toLowerCase())).size ===
      doc.tokens.length,
    "DUPLICATE_TOKEN",
    "Token names must be unique.",
  );
  requireThat(
    new Set(doc.tokenThemes.map((theme) => theme.name.toLowerCase())).size ===
      doc.tokenThemes.length,
    "DUPLICATE_THEME",
    "Theme names must be unique.",
  );
  requireThat(
    doc.activeTokenTheme === null || themes.has(doc.activeTokenTheme),
    "MISSING_THEME",
    "Unknown active token theme.",
  );
  const cache = new Map<string, string | number>();
  const value = (
    id: string,
    theme: string | null = null,
    chain = new Set<string>(),
  ): string | number => {
    const key = `${id}:${theme ?? ""}`;
    if (cache.has(key)) return cache.get(key)!;
    const token = tokens.get(id);
    requireThat(token, "MISSING_TOKEN", "Unknown design token.");
    requireThat(!chain.has(id), "TOKEN_CYCLE", "Token aliases form a cycle.");
    const raw =
      theme && token.themes[theme] !== undefined
        ? token.themes[theme]
        : token.value;
    let result: string | number;
    if (typeof raw === "object") {
      const target = tokens.get(raw.tokenId);
      requireThat(
        target?.type === token.type,
        "TOKEN_TYPE",
        "An alias must reference the same token type.",
      );
      result = value(raw.tokenId, theme, new Set([...chain, id]));
    } else result = raw;
    const property = Object.entries(tokenPropertyTypes).find(
      ([, type]) => type === token.type,
    )![0] as TokenPropertyName;
    if (token.type === "spacing")
      requireThat(
        z.number().finite().min(0).max(10000).safeParse(result).success,
        "TOKEN_VALUE",
        "Spacing must be between 0 and 10000.",
      );
    else validateValue(property, result);
    cache.set(key, result);
    return result;
  };
  for (const token of doc.tokens) {
    requireThat(
      Object.keys(token.themes).every((id) => themes.has(id)),
      "MISSING_THEME",
      "Token names an unknown theme.",
    );
    value(token.id);
    for (const theme of themes) value(token.id, theme);
  }
  return { value, tokens, themes };
}

function validateValue(property: TokenPropertyName, value: string | number) {
  const [outer, inner] = property.split(".");
  const schema = inner
    ? NodeSchema.shape.layout.removeDefault().shape[inner as "gap" | "padding"]
    : NodeSchema.shape[outer as Exclude<TokenPropertyName, `layout.${string}`>];
  requireThat(
    schema.safeParse(value).success,
    "TOKEN_VALUE",
    `Invalid ${property} token value.`,
  );
}

/** Materialize bound fields in the canonical snapshot, so all existing consumers share resolution. */
export function validateTokenBinding(
  doc: DesignDocument,
  node: DesignNode,
  property: TokenPropertyName,
  id: string,
  checked = new Set<string>(),
  resolver = tokenResolver(doc),
) {
  const token = resolver.tokens.get(id);
  requireThat(
    token?.type === tokenPropertyTypes[property],
    "TOKEN_TYPE",
    `Token type does not match ${property}.`,
  );
  requireThat(
    (!property.startsWith("font") &&
      !["lineHeight", "letterSpacing"].includes(property)) ||
      node.type === "text",
    "TOKEN_TARGET",
    "Typography tokens require a text layer.",
  );
  requireThat(
    !property.startsWith("layout.") || node.type === "frame",
    "TOKEN_TARGET",
    "Layout tokens require a frame.",
  );
  const key = `${id}:${property}`;
  if (!checked.has(key)) {
    for (const theme of [null, ...resolver.themes])
      validateValue(property, resolver.value(id, theme));
    checked.add(key);
  }
}
export function resolveTokens(doc: DesignDocument) {
  const resolver = tokenResolver(doc),
    nodes = new Map(doc.nodes.map((node) => [node.id, node]));
  const checkedBindings = new Set<string>();
  for (const node of doc.nodes) {
    requireThat(
      node.tokenTheme === null || resolver.themes.has(node.tokenTheme),
      "MISSING_THEME",
      "A layer names an unknown theme.",
    );
    if (!Object.keys(node.bindings).length) continue;
    let current: DesignNode | undefined = node,
      theme = doc.activeTokenTheme,
      depth = 0;
    while (current) {
      requireThat(
        ++depth <= 41,
        "INVALID_HIERARCHY",
        "Token theme ancestry is deeper than 40.",
      );
      if (current.tokenTheme) {
        theme = current.tokenTheme;
        break;
      }
      current = current.parentId ? nodes.get(current.parentId) : undefined;
    }
    for (const [name, id] of Object.entries(node.bindings)) {
      const property = name as TokenPropertyName;
      validateTokenBinding(doc, node, property, id!, checkedBindings, resolver);
      const result = resolver.value(id!, theme);
      validateValue(property, result);
      if (property === "layout.gap") node.layout.gap = result as number;
      else if (property === "layout.padding")
        node.layout.padding = result as number;
      else Object.assign(node, { [property]: result });
    }
  }
}

export function detachToken(doc: DesignDocument, id: string, detach: boolean) {
  const resolver = tokenResolver(doc);
  requireThat(resolver.tokens.has(id), "MISSING_TOKEN", "Unknown token.");
  const references = doc.tokens.filter((token) =>
    [token.value, ...Object.values(token.themes)].some(
      (value) => typeof value === "object" && value.tokenId === id,
    ),
  );
  const allNodes = [
    ...doc.nodes,
    ...doc.components.flatMap((definition) => definition.nodes),
  ];
  const bound = allNodes.filter((node) =>
    Object.values(node.bindings).includes(id),
  );
  const scene = new Map(doc.nodes.map((node) => [node.id, node]));
  const inheritedTheme = (
    node: DesignNode | undefined,
    nodes: Map<string, DesignNode>,
    patches = new Map<string, Record<string, unknown>>(),
  ) => {
    while (node) {
      const patch = patches.get(node.id);
      const theme =
        patch && Object.hasOwn(patch, "tokenTheme")
          ? patch.tokenTheme
          : node.tokenTheme;
      if (typeof theme === "string") return theme;
      node = node.parentId ? nodes.get(node.parentId) : undefined;
    }
    return doc.activeTokenTheme;
  };
  const privateTheme = componentThemeResolver(doc);
  const rows = [
    ...doc.nodes.flatMap((node) =>
      (node.component?.overrides ?? []).map((row) => ({
        row,
        theme: inheritedTheme(
          row.path.length === 1 &&
            row.path[0] ===
              doc.components.find((d) => d.id === node.component!.componentId)
                ?.rootId
            ? node
            : scene.get(componentNodeId(node.id, row.path)),
          scene,
        ),
      })),
    ),
    ...doc.components.flatMap((definition) => [
      ...definition.nodes.flatMap((node) =>
        (node.component?.overrides ?? []).map((row) => ({
          row,
          theme: privateTheme(definition.id, [node.id, ...row.path]),
        })),
      ),
      ...definition.variants.flatMap((variant) =>
        variant.overrides.map((row) => ({
          row,
          theme: privateTheme(definition.id, [row.partId], variant.when),
        })),
      ),
    ]),
  ];
  const rowUses = rows.filter(({ row }) =>
    Object.values(row.bindings).includes(id),
  );
  requireThat(
    detach || (!references.length && !bound.length && !rowUses.length),
    "TOKEN_IN_USE",
    "Token is in use. Detach its uses explicitly before deleting.",
  );
  resolveTokens(doc);
  const painted = doc.nodes.flatMap((node) =>
    Object.entries(node.bindings)
      .filter(([, tokenId]) => tokenId === id)
      .map(([property]) => ({
        id: node.id,
        property: property as TokenPropertyName,
        value:
          property === "layout.gap"
            ? node.layout.gap
            : property === "layout.padding"
              ? node.layout.padding
              : node[
                  property as Exclude<TokenPropertyName, `layout.${string}`>
                ],
      })),
  );
  for (const definition of doc.components) {
    resolveTokens({ ...doc, nodes: definition.nodes });
    for (const node of definition.nodes)
      for (const [field, tokenId] of Object.entries(node.bindings))
        if (tokenId === id) {
          const value = resolver.value(
            id,
            privateTheme(definition.id, [node.id]),
          );
          if (field === "layout.gap") node.layout.gap = value as number;
          else if (field === "layout.padding")
            node.layout.padding = value as number;
          else Object.assign(node, { [field]: value });
        }
  }
  for (const token of references) {
    const base = resolver.value(token.id),
      themes = Object.fromEntries(
        doc.tokenThemes.map((theme) => [
          theme.id,
          resolver.value(token.id, theme.id),
        ]),
      );
    token.value = base;
    token.themes = themes;
  }
  for (const node of bound)
    for (const [property, tokenId] of Object.entries(node.bindings))
      if (tokenId === id) delete node.bindings[property as TokenPropertyName];
  for (const { row, theme } of rowUses)
    for (const [property, tokenId] of Object.entries(row.bindings))
      if (tokenId === id)
        row.bindings[property as TokenPropertyName] = {
          value: resolver.value(id, theme),
        };
  doc.tokens = doc.tokens.filter((token) => token.id !== id);
  // One definition may be used under several inherited themes. Preserve each current
  // instance's visible value when replacing its shared binding with a literal.
  resolveComponents(doc);
  resolveTokens(doc);
  const byId = new Map(doc.nodes.map((node) => [node.id, node]));
  for (const paint of painted) {
    const node = byId.get(paint.id)!;
    const current =
      paint.property === "layout.gap"
        ? node.layout.gap
        : paint.property === "layout.padding"
          ? node.layout.padding
          : node[
              paint.property as Exclude<TokenPropertyName, `layout.${string}`>
            ];
    if (current === paint.value) continue;
    if (paint.property === "layout.gap")
      node.layout.gap = paint.value as number;
    else if (paint.property === "layout.padding")
      node.layout.padding = paint.value as number;
    else Object.assign(node, { [paint.property]: paint.value });
    recordComponentBinding(doc, node, paint.property, null, byId);
  }
}

export function tokenBindingUsage(doc: DesignDocument) {
  const usage = new Map<string, number>();
  const count = (bindings: Record<string, unknown>) => {
    for (const id of Object.values(bindings))
      if (typeof id === "string") usage.set(id, (usage.get(id) ?? 0) + 1);
  };
  for (const node of [
    ...doc.nodes,
    ...doc.components.flatMap((definition) => definition.nodes),
  ]) {
    count(node.bindings);
    for (const row of node.component?.overrides ?? []) count(row.bindings);
  }
  for (const definition of doc.components)
    for (const variant of definition.variants)
      for (const row of variant.overrides) count(row.bindings);
  return usage;
}

export function clearRemovedThemes(doc: DesignDocument, allowed: Set<string>) {
  const clearPatch = (patch: Record<string, unknown>) => {
    if (typeof patch.tokenTheme === "string" && !allowed.has(patch.tokenTheme))
      patch.tokenTheme = null;
  };
  for (const node of [
    ...doc.nodes,
    ...doc.components.flatMap((definition) => definition.nodes),
  ]) {
    if (node.tokenTheme && !allowed.has(node.tokenTheme))
      node.tokenTheme = null;
    for (const row of node.component?.overrides ?? []) clearPatch(row.patch);
  }
  for (const definition of doc.components)
    for (const variant of definition.variants)
      for (const row of variant.overrides) clearPatch(row.patch);
}
