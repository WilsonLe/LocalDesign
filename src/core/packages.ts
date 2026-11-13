import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { contentDigest } from "./hash";
import {
  type DesignDocument,
  type DesignNode,
  type LibraryPayload,
  blankDocument,
  compactNativeNode,
  requireThat,
  validateDocument,
} from "./model";
import type { Command } from "./commands";
import { componentNodeId, recordComponentPatch } from "./components";
import {
  MAX_ASSETS,
  MAX_COMPONENTS,
  MAX_DOCUMENT_FONTS,
  MAX_TOKEN_THEMES,
  MAX_TOKENS,
} from "./limits";
type Source = DesignDocument["packageSources"][number];
type Import = Extract<Command, { op: "library_import" }>;
export const resourceImportId = (
  documentId: string,
  namespace: string,
  kind: string,
  id: string,
) =>
  `import-${bytesToHex(sha256(new TextEncoder().encode(JSON.stringify([documentId, namespace, kind, id])))).slice(0, 40)}`;
export const definitionDigest = (item: DesignDocument["components"][number]) =>
  contentDigest({
    ...item,
    revision: 0,
    nodes: item.nodes.map(compactNativeNode),
  });
export const libraryWire = (payload: LibraryPayload) => ({
  ...payload,
  nodes: payload.nodes.map(compactNativeNode),
  components: payload.components.map((item) => ({
    ...item,
    nodes: item.nodes.map(compactNativeNode),
  })),
});
export const libraryDigest = (payload: LibraryPayload) =>
  contentDigest(libraryWire(payload));
export function validateLibrary(payload: LibraryPayload) {
  const pageIds = [...new Set(payload.nodes.map((node) => node.pageId))];
  validateDocument({
    ...blankDocument("Portable library"),
    ...payload,
    pages: pageIds.length
      ? pageIds.map((id) => ({ id, name: "Library", background: "none" }))
      : blankDocument().pages,
  });
}
export function validatePackageSources(doc: DesignDocument) {
  requireThat(
    new Set(doc.packageSources.map((source) => source.originId)).size ===
      doc.packageSources.length,
    "PACKAGE_SOURCE",
    "Package origins must be unique.",
  );
  for (const source of doc.packageSources) {
    for (const [field, max] of [
      ["componentMap", MAX_COMPONENTS],
      ["tokenMap", MAX_TOKENS],
      ["themeMap", MAX_TOKEN_THEMES],
      ["assetMap", MAX_ASSETS],
      ["fontMap", MAX_DOCUMENT_FONTS],
    ] as const)
      requireThat(
        Object.keys(source[field]).length <= max,
        "PACKAGE_SOURCE",
        "A package resource map exceeds the native resource limit.",
      );
    requireThat(
      Object.keys(source.baselines).length <=
        MAX_COMPONENTS + MAX_TOKENS + MAX_TOKEN_THEMES,
      "PACKAGE_SOURCE",
      "Too many package baselines.",
    );
  }
}
function mapped(map: Record<string, string> | undefined, id: string) {
  return map && Object.hasOwn(map, id) ? map[id] : undefined;
}
function uniqueName(
  name: string,
  names: Set<string>,
  max: number,
  css = false,
) {
  let result = name;
  for (let n = 2; names.has(result.toLowerCase()); n++) {
    const suffix = css ? `-${n}` : ` (${n})`;
    result = name.slice(0, max - suffix.length) + suffix;
  }
  names.add(result.toLowerCase());
  return result;
}
export function importLibrary(doc: DesignDocument, input: Import) {
  const payload = structuredClone(input.payload);
  validateLibrary(payload);
  requireThat(
    libraryDigest(payload) === input.digest,
    "PACKAGE_DIGEST",
    "The library content digest does not match.",
  );
  requireThat(
    doc.pages.some((page) => page.id === input.pageId),
    "MISSING_PAGE",
    "Choose an existing destination page.",
  );
  const old =
    input.mode === "copy"
      ? undefined
      : doc.packageSources.find((source) => source.originId === input.originId);
  requireThat(
    input.mode !== "sync" || old,
    "PACKAGE_SOURCE",
    "Import this package before selecting an update.",
  );
  requireThat(
    input.mode !== "import" || !old,
    "PACKAGE_EXISTS",
    "This origin is already imported. Select an explicit sync update.",
  );
  requireThat(
    !old || input.version > old.version,
    "PACKAGE_VERSION",
    "Select a newer package version for an explicit update.",
  );
  const conflicts: string[] = [];
  if (old) {
    for (const id of payload.components.flatMap((item) =>
      mapped(old.componentMap, item.id)
        ? [mapped(old.componentMap, item.id)!]
        : [],
    )) {
      const item = doc.components.find((item) => item.id === id);
      if (item && old.baselines[id] !== definitionDigest(item))
        conflicts.push(id);
    }
    for (const [map, catalog, incoming] of [
      [old.tokenMap, doc.tokens, payload.tokens],
      [old.themeMap, doc.tokenThemes, payload.tokenThemes],
    ] as const)
      for (const id of incoming.flatMap((item) =>
        mapped(map, item.id) ? [mapped(map, item.id)!] : [],
      )) {
        const item = catalog.find((item) => item.id === id);
        if (item && old.baselines[id] !== contentDigest(item))
          conflicts.push(id);
      }
  }
  requireThat(
    input.replaceLocalEdits || !conflicts.length,
    "PACKAGE_LOCAL_EDITS",
    `Package definitions/resources have local edits (${conflicts.slice(0, 20).join(", ")}). Review them before explicitly replacing local edits.`,
  );
  const source: Source = {
    originId: input.originId,
    version: input.version,
    digest: input.digest,
    componentMap: Object.create(null),
    tokenMap: Object.create(null),
    themeMap: Object.create(null),
    assetMap: Object.create(null),
    fontMap: Object.create(null),
    baselines: Object.create(null),
  };
  const allocate = (kind: string, id: string) =>
    resourceImportId(doc.id, input.namespace, kind, id);
  const componentNames = new Set(
    doc.components
      .filter(
        (item) =>
          !payload.components.some(
            (incoming) => mapped(old?.componentMap, incoming.id) === item.id,
          ) && !item.deleted,
      )
      .map((item) => item.name.toLowerCase()),
  );
  const tokenNames = new Set(
    doc.tokens
      .filter(
        (item) =>
          !payload.tokens.some(
            (incoming) => mapped(old?.tokenMap, incoming.id) === item.id,
          ),
      )
      .map((item) => item.name.toLowerCase()),
  );
  const themeNames = new Set(
    doc.tokenThemes
      .filter(
        (item) =>
          !payload.tokenThemes.some(
            (incoming) => mapped(old?.themeMap, incoming.id) === item.id,
          ),
      )
      .map((item) => item.name.toLowerCase()),
  );
  for (const item of payload.components) {
    const matching =
      input.mode === "copy"
        ? doc.components.find(
            (current) =>
              current.id === item.id &&
              definitionDigest(current) === definitionDigest(item),
          )
        : undefined;
    source.componentMap[item.id] =
      mapped(old?.componentMap, item.id) ??
      matching?.id ??
      allocate("component", item.id);
  }
  for (const item of payload.tokenThemes) {
    const matching =
      input.mode === "copy"
        ? doc.tokenThemes.find(
            (current) => contentDigest(current) === contentDigest(item),
          )
        : undefined;
    source.themeMap[item.id] =
      mapped(old?.themeMap, item.id) ??
      matching?.id ??
      allocate("theme", item.id);
  }
  for (const item of payload.tokens) {
    const matching =
      input.mode === "copy"
        ? doc.tokens.find(
            (current) => contentDigest(current) === contentDigest(item),
          )
        : undefined;
    source.tokenMap[item.id] =
      mapped(old?.tokenMap, item.id) ??
      matching?.id ??
      allocate("token", item.id);
  }
  const fingerprint = (item: unknown) =>
    contentDigest({ ...(item as object), id: "_" });
  const assetsByDigest = new Map(
    doc.assets.map((item) => [fingerprint(item), item]),
  );
  for (const item of payload.assets) {
    const digest = fingerprint(item),
      matching = assetsByDigest.get(digest);
    source.assetMap[item.id] = matching?.id ?? allocate("asset", item.id);
    if (!matching) {
      const copy = { ...item, id: source.assetMap[item.id] };
      doc.assets.push(copy);
      assetsByDigest.set(digest, copy);
    }
  }
  const fontsByDigest = new Map(
    doc.fonts.map((item) => [fingerprint(item), item]),
  );
  for (const item of payload.fonts) {
    const digest = fingerprint(item),
      matching = fontsByDigest.get(digest);
    source.fontMap[item.id] =
      matching?.id ??
      (item.source === "bundled" &&
      !doc.fonts.some((current) => current.id === item.id)
        ? item.id
        : allocate("font", item.id));
    if (!matching) {
      const copy = {
        ...item,
        id: source.fontMap[item.id],
        source:
          source.fontMap[item.id] === item.id
            ? item.source
            : ("local" as const),
      };
      doc.fonts.push(copy);
      fontsByDigest.set(digest, copy);
    }
  }
  const mapId = (map: Record<string, string>, id: string | null) =>
    id ? (mapped(map, id) ?? id) : null;
  const rewritePatch = (patch: Record<string, unknown>) => {
    for (const [field, map] of [
      ["assetId", source.assetMap],
      ["fontId", source.fontMap],
      ["tokenTheme", source.themeMap],
    ] as const)
      if (typeof patch[field] === "string")
        patch[field] = mapId(map, patch[field] as string);
  };
  const rewriteBindings = (bindings: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(bindings))
      if (typeof value === "string")
        bindings[key] = mapped(source.tokenMap, value) ?? value;
  };
  const rewriteNode = (node: DesignNode) => {
    node.assetId = mapId(source.assetMap, node.assetId);
    node.fontId = mapId(source.fontMap, node.fontId);
    node.tokenTheme = mapId(source.themeMap, node.tokenTheme);
    rewriteBindings(node.bindings);
    node.componentSource = null;
    if (node.component) {
      node.component.componentId =
        mapped(source.componentMap, node.component.componentId) ??
        node.component.componentId;
      for (const row of node.component.overrides) {
        rewritePatch(row.patch);
        rewriteBindings(row.bindings);
      }
    }
  };
  for (const theme of payload.tokenThemes) {
    const id = source.themeMap[theme.id],
      index = doc.tokenThemes.findIndex((item) => item.id === id);
    if (index >= 0 && input.mode === "copy") continue;
    const copy = { ...theme, id, name: uniqueName(theme.name, themeNames, 80) };
    if (index < 0) doc.tokenThemes.push(copy);
    else doc.tokenThemes[index] = copy;
    source.baselines[id] = contentDigest(copy);
  }
  for (const token of payload.tokens) {
    const id = source.tokenMap[token.id],
      index = doc.tokens.findIndex((item) => item.id === id);
    if (index >= 0 && input.mode === "copy") continue;
    const mapValue = (value: typeof token.value) =>
      typeof value === "object"
        ? { tokenId: mapped(source.tokenMap, value.tokenId) ?? value.tokenId }
        : value;
    const copy = {
      ...token,
      id,
      name: uniqueName(token.name, tokenNames, 80, true),
      value: mapValue(token.value),
      themes: Object.fromEntries(
        Object.entries(token.themes).map(([id, value]) => [
          mapped(source.themeMap, id) ?? id,
          mapValue(value),
        ]),
      ),
    };
    if (index < 0) doc.tokens.push(copy);
    else doc.tokens[index] = copy;
    source.baselines[id] = contentDigest(copy);
  }
  const changes: LibraryDefinitionChange[] = [];
  const added: string[] = [],
    updated: string[] = [];
  for (const definition of payload.components) {
    const originalId = definition.id,
      id = source.componentMap[originalId],
      index = doc.components.findIndex((item) => item.id === id);
    if (index >= 0 && input.mode === "copy") continue;
    definition.id = id;
    definition.revision =
      index < 0 ? definition.revision : doc.components[index].revision + 1;
    definition.name = uniqueName(definition.name, componentNames, 200);
    for (const node of definition.nodes) rewriteNode(node);
    for (const variant of definition.variants)
      for (const row of variant.overrides) {
        rewritePatch(row.patch);
        rewriteBindings(row.bindings);
      }
    changes.push(
      definitionChange(
        index < 0 ? undefined : doc.components[index],
        definition,
      ),
    );
    if (index < 0) {
      doc.components.push(definition);
      added.push(id);
    } else {
      doc.components[index] = definition;
      updated.push(id);
    }
    source.baselines[id] = definitionDigest(definition);
  }
  const nodeMap = new Map(
    payload.nodes
      .filter((node) => !node.componentPart)
      .map((node) => [node.id, allocate("node", node.id)]),
  );
  for (const node of payload.nodes)
    if (node.componentPart) {
      const owner = nodeMap.get(node.componentPart.instanceId);
      requireThat(
        owner,
        "PACKAGE_NODE",
        "Copy a complete instance, or detach its selected part first.",
      );
      nodeMap.set(node.id, componentNodeId(owner, node.componentPart.path));
    }
  const roots: string[] = [];
  let baseThemeId: string | null = null;
  if (
    payload.nodes.length &&
    payload.activeTokenTheme === null &&
    doc.activeTokenTheme !== null
  ) {
    baseThemeId = allocate("baseTheme", "base");
    doc.tokenThemes.push({
      id: baseThemeId,
      name: uniqueName("Imported base", themeNames, 80),
    });
    for (const original of payload.tokens) {
      const token = doc.tokens.find(
        (item) => item.id === source.tokenMap[original.id],
      )!;
      token.themes[baseThemeId] =
        typeof original.value === "object"
          ? { tokenId: source.tokenMap[original.value.tokenId] }
          : original.value;
    }
  }
  for (const node of payload.nodes) {
    const originalId = node.id,
      parent = node.parentId;
    rewriteNode(node);
    node.id = nodeMap.get(originalId)!;
    node.pageId = input.pageId;
    node.parentId = parent ? (nodeMap.get(parent) ?? null) : null;
    if (node.componentPart)
      node.componentPart.instanceId = nodeMap.get(
        node.componentPart.instanceId,
      )!;
    if (!node.parentId) {
      node.x += input.dx;
      node.y += input.dy;
      roots.push(node.id);
      if (!node.tokenTheme)
        node.tokenTheme = payload.activeTokenTheme
          ? source.themeMap[payload.activeTokenTheme]
          : baseThemeId;
      if (node.component && node.tokenTheme)
        recordComponentPatch(
          doc,
          node,
          { tokenTheme: node.tokenTheme },
          new Map(),
        );
    }
    if (node.component?.frozen)
      node.component.resolvedRevision = Math.min(
        node.component.resolvedRevision,
        doc.components.find((item) => item.id === node.component!.componentId)!
          .revision,
      );
    doc.nodes.push(node);
  }
  if (input.mode !== "copy") {
    const index = doc.packageSources.findIndex(
      (item) => item.originId === source.originId,
    );
    if (index < 0) doc.packageSources.push(source);
    else doc.packageSources[index] = source;
  }
  return { source, added, updated, roots, localConflicts: conflicts, changes };
}
export type LibraryDefinitionChange = {
  id: string;
  name: string;
  addedParts: number;
  removedParts: number;
  changedParts: number;
  parts: { id: string; name: string; fields: string[] }[];
  propertiesChanged: boolean;
  variantsChanged: boolean;
};
function definitionChange(
  before: DesignDocument["components"][number] | undefined,
  after: DesignDocument["components"][number],
): LibraryDefinitionChange {
  const old = new Map(before?.nodes.map((node) => [node.id, node]) ?? []),
    ids = new Set(after.nodes.map((node) => node.id));
  const parts: LibraryDefinitionChange["parts"] = [];
  let changedParts = 0,
    addedParts = 0;
  for (const node of after.nodes) {
    const previous = old.get(node.id);
    if (!previous) {
      addedParts++;
      if (parts.length < 50)
        parts.push({ id: node.id, name: node.name, fields: ["added"] });
      continue;
    }
    const fields = Object.keys(node).filter(
      (key) =>
        JSON.stringify(node[key as keyof DesignNode]) !==
        JSON.stringify(previous[key as keyof DesignNode]),
    );
    if (fields.length) {
      changedParts++;
      if (parts.length < 50)
        parts.push({ id: node.id, name: node.name, fields });
    }
  }
  return {
    id: after.id,
    name: after.name,
    addedParts,
    removedParts: [...old.keys()].filter((id) => !ids.has(id)).length,
    changedParts,
    parts,
    propertiesChanged:
      contentDigest(before?.properties ?? []) !==
      contentDigest(after.properties),
    variantsChanged:
      contentDigest(before?.variants ?? []) !== contentDigest(after.variants),
  };
}
export function refreshPackageBaselines(doc: DesignDocument, originId: string) {
  const source = doc.packageSources.find((item) => item.originId === originId);
  if (!source) return;
  for (const id of Object.values(source.componentMap)) {
    const item = doc.components.find((item) => item.id === id);
    if (item) source.baselines[id] = definitionDigest(item);
  }
  for (const [map, catalog] of [
    [source.tokenMap, doc.tokens],
    [source.themeMap, doc.tokenThemes],
  ] as const)
    for (const id of Object.values(map)) {
      const item = catalog.find((item) => item.id === id);
      if (item) source.baselines[id] = contentDigest(item);
    }
}
