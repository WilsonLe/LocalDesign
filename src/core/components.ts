import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  NodeSchema,
  Paint,
  requireThat,
  DesignError,
  type DesignDocument,
  type DesignNode,
  type ComponentDefinition,
  type ComponentInstance,
  type ComponentValue,
  type TokenPropertyName,
} from "./model";
import { MAX_NODES, MAX_COMPONENT_OVERRIDES } from "./limits";
import { validateTokenBinding } from "./tokens";

type NativePatch = Record<string, unknown>;
type Override = ComponentInstance["overrides"][number];
type Property = ComponentDefinition["properties"][number];
const immutable = new Set([
  "id",
  "type",
  "pageId",
  "parentId",
  "bindings",
  "attribution",
  "component",
  "componentPart",
  "componentSource",
]);
const placement = new Set([
  "x",
  "y",
  "rotation",
  "name",
  "hidden",
  "locked",
  "pageId",
  "parentId",
]);
const pathKey = (path: string[]) => path.join("/");
export function componentNodeId(
  instanceId: string,
  path: string[],
  source = false,
) {
  return `component-${bytesToHex(sha256(new TextEncoder().encode(JSON.stringify([instanceId, source, path])))).slice(0, 40)}`;
}
export function componentPatch(node: DesignNode, patch: NativePatch) {
  for (const field of Object.keys(patch)) {
    requireThat(
      ![
        "text",
        "fontFamily",
        "fontWeight",
        "fontStyle",
        "fontSize",
        "fontId",
        "lineHeight",
        "letterSpacing",
        "textAlign",
      ].includes(field) || node.type === "text",
      "COMPONENT_FIELD",
      "Typography overrides require a text part.",
    );
    requireThat(
      field !== "path" || node.type === "path",
      "COMPONENT_FIELD",
      "Path geometry requires a path part.",
    );
    requireThat(
      !["layout", "clip"].includes(field) || node.type === "frame",
      "COMPONENT_FIELD",
      "Layout and clipping require a frame part.",
    );
  }
  for (const key of Object.keys(patch))
    requireThat(
      Object.hasOwn(NodeSchema.shape, key) && !immutable.has(key),
      "COMPONENT_FIELD",
      `A component cannot override ${key}.`,
    );
  const bindings = { ...node.bindings };
  for (const key of Object.keys(bindings))
    if (
      Object.hasOwn(patch, key) ||
      (key.startsWith("layout.") && Object.hasOwn(patch, "layout"))
    )
      delete bindings[key as TokenPropertyName];
  const value = { ...node, ...patch, bindings };
  if (
    !Object.hasOwn(patch, "fontId") &&
    ["fontFamily", "fontWeight", "fontStyle"].some((key) =>
      Object.hasOwn(patch, key),
    )
  )
    value.fontId = null;
  Object.assign(node, NodeSchema.parse(value));
}
function propertyPatch(node: DesignNode, field: string, value: ComponentValue) {
  if (field === "layout.gap" || field === "layout.padding") {
    requireThat(
      node.type === "frame",
      "COMPONENT_FIELD",
      "Layout properties require a frame.",
    );
    const bindings = { ...node.bindings };
    delete bindings[field];
    Object.assign(
      node,
      NodeSchema.parse({
        ...node,
        bindings,
        layout: { ...node.layout, [field.slice(7)]: value },
      }),
    );
  } else componentPatch(node, { [field]: value });
}
function applyBindings(node: DesignNode, bindings: Override["bindings"]) {
  node.bindings = { ...node.bindings };
  for (const [field, id] of Object.entries(bindings)) {
    if (id === null) delete node.bindings[field as TokenPropertyName];
    else if (typeof id === "object") propertyPatch(node, field, id.value);
    else node.bindings[field as TokenPropertyName] = id!;
  }
}
function validProperty(property: Property, value: ComponentValue) {
  return property.type === "text"
    ? typeof value === "string"
    : property.type === "number"
      ? typeof value === "number" && Number.isFinite(value)
      : property.type === "boolean"
        ? typeof value === "boolean"
        : property.type === "color"
          ? typeof value === "string" && Paint.safeParse(value).success
          : typeof value === "string" && property.options.includes(value);
}
type DefinitionIndex = {
  definition: ComponentDefinition;
  parts: Map<string, DesignNode>;
  children: Map<string | null, DesignNode[]>;
};
type Catalog = Map<string, DefinitionIndex>;
function lookupPart(
  catalog: Catalog,
  index: DefinitionIndex,
  path: string[],
): DesignNode | undefined {
  const part = index.parts.get(path[0]);
  if (!part) return;
  if (path.length === 1) return part.component ? undefined : part;
  if (!part.component) return;
  const nested = catalog.get(part.component.componentId);
  return nested && lookupPart(catalog, nested, path.slice(1));
}
function assertRootFields(
  index: DefinitionIndex,
  partId: string,
  patch: NativePatch,
) {
  requireThat(
    partId !== index.definition.rootId ||
      !Object.keys(patch).some((key) => placement.has(key)),
    "COMPONENT_PLACEMENT",
    "Bind placement fields on a child; the component root's position, name, visibility and lock belong to its instance.",
  );
}
function checkReferences(
  doc: DesignDocument,
  node: DesignNode,
  assets: Set<string>,
  themes: Set<string>,
) {
  requireThat(
    node.type !== "image" || (node.assetId && assets.has(node.assetId)),
    "MISSING_ASSET",
    `Missing component image for ${node.name}.`,
  );
  requireThat(
    node.tokenTheme === null || themes.has(node.tokenTheme),
    "MISSING_THEME",
    "A component part names an unknown theme.",
  );
  // Font requests may intentionally be missing; the shared resolver retains explicit fallback warnings.
  requireThat(doc.pages.length, "MISSING_PAGE", "A document needs a page.");
}

/** Validate stored templates independently of whether a visible instance currently uses them. */
export function validateComponents(
  doc: DesignDocument,
  options: ComponentResolutionOptions = {},
  result?: ComponentResolution,
): Catalog {
  const catalog: Catalog = new Map();
  const names = new Set<string>(),
    assets = new Set(doc.assets.map((asset) => asset.id)),
    themes = new Set(doc.tokenThemes.map((theme) => theme.id));
  let storedParts = 0;
  for (const definition of doc.components) {
    requireThat(
      !catalog.has(definition.id),
      "DUPLICATE_ID",
      "Duplicate component ID.",
    );
    const name = definition.name.toLocaleLowerCase();
    requireThat(
      definition.deleted || !names.has(name),
      "COMPONENT_NAME",
      "An active component already uses this name.",
    );
    if (!definition.deleted) names.add(name);
    const parts = new Map<string, DesignNode>(),
      children = new Map<string | null, DesignNode[]>();
    for (const part of definition.nodes) {
      requireThat(
        !parts.has(part.id),
        "COMPONENT_PART",
        "Component part IDs must be unique within the definition.",
      );
      requireThat(
        !part.componentPart && !part.componentSource,
        "COMPONENT_PART",
        "Store source parts, not generated instance or authoring metadata, in a definition.",
      );
      parts.set(part.id, part);
      const siblings = children.get(part.parentId) ?? [];
      siblings.push(part);
      children.set(part.parentId, siblings);
    }
    storedParts += definition.nodes.length;
    requireThat(
      storedParts <= MAX_NODES,
      "COMPONENT_LIMIT",
      "Stored component parts exceed the native node limit.",
    );
    const root = parts.get(definition.rootId);
    requireThat(
      root &&
        ["frame", "group"].includes(root.type) &&
        !root.component &&
        root.parentId === null &&
        children.get(null)?.length === 1,
      "COMPONENT_ROOT",
      "A definition needs one ordinary frame/group root.",
    );
    requireThat(
      root.x === 0 && root.y === 0 && root.rotation === 0,
      "COMPONENT_ROOT",
      "A component definition's root uses a zero origin and rotation; place and rotate its instances separately.",
    );
    catalog.set(definition.id, { definition, parts, children });
  }
  const heights = new Map<string, number>(),
    visiting = new Set<string>();
  const height = (id: string): number => {
    requireThat(
      !visiting.has(id),
      "COMPONENT_CYCLE",
      "Component references contain a cycle.",
    );
    const prior = heights.get(id);
    if (prior !== undefined) return prior;
    const index = catalog.get(id);
    requireThat(
      index,
      "MISSING_COMPONENT",
      "A nested component definition is missing.",
    );
    visiting.add(id);
    let result = 1;
    for (const part of index.definition.nodes)
      if (part.component)
        result = Math.max(result, 1 + height(part.component.componentId));
    requireThat(
      result <= 40,
      "COMPONENT_CYCLE",
      "Component references exceed the native nesting depth.",
    );
    visiting.delete(id);
    heights.set(id, result);
    return result;
  };
  for (const id of catalog.keys()) height(id);
  const checkedBindings = new Set<string>();
  const validateBound = (node: DesignNode) => {
    for (const [field, id] of Object.entries(node.bindings))
      validateTokenBinding(
        doc,
        node,
        field as TokenPropertyName,
        id!,
        checkedBindings,
      );
  };
  const checkRow = (index: DefinitionIndex, row: Override) => {
    const base = lookupPart(catalog, index, row.path);
    requireThat(
      base,
      "COMPONENT_OVERRIDE",
      "A stored nested reference overrides a missing part.",
    );
    if (row.path.length === 1) assertRootFields(index, row.path[0], row.patch);
    const node = structuredClone(base);
    componentPatch(node, row.patch);
    applyBindings(node, row.bindings);
    checkReferences(doc, node, assets, themes);
    validateBound(node);
  };
  for (const index of catalog.values()) {
    const { definition, parts, children } = index;
    for (const part of definition.nodes) {
      checkReferences(doc, part, assets, themes);
      validateBound(part);
      let current = part,
        depth = 0;
      const seen = new Set<string>();
      while (current.parentId) {
        requireThat(
          !seen.has(current.id) && ++depth <= 40,
          "INVALID_HIERARCHY",
          "Invalid component part hierarchy.",
        );
        seen.add(current.id);
        const parent = parts.get(current.parentId);
        requireThat(
          parent && ["frame", "group"].includes(parent.type),
          "INVALID_PARENT",
          "Component parts need a frame/group parent from their own definition.",
        );
        current = parent;
      }
      if (part.component) {
        requireThat(
          !children.get(part.id)?.length,
          "COMPONENT_PART",
          "Nested references store their link, not generated descendants.",
        );
        const nested = catalog.get(part.component.componentId)!;
        requireThat(
          part.type === nested.parts.get(nested.definition.rootId)!.type,
          "COMPONENT_PART",
          "A nested reference must use its definition's root kind.",
        );
        const properties = new Map(
          nested.definition.properties.map((property) => [
            property.name,
            property,
          ]),
        );
        let changed = false;
        const allowDrop = [
          ...referenceClosure(catalog, nested.definition.id),
        ].some((id) => options.dropFor?.has(id));
        const dropConflict = (field: string, reason: string) => {
          const conflict = {
            instanceId: definition.id,
            path: [part.id],
            field,
            reason,
          };
          if (!allowDrop)
            throw new DesignError(
              "COMPONENT_CONFLICT",
              "A nested reference conflicts with its updated definition.",
              { conflictCount: 1, conflicts: [conflict] },
            );
          changed = true;
          if (result) {
            result.conflictCount++;
            if (result.conflicts.length < 100) result.conflicts.push(conflict);
          }
        };
        for (const [name, value] of Object.entries(part.component.properties)) {
          const property = properties.get(name);
          if (!property || !validProperty(property, value)) {
            dropConflict(
              name,
              "Nested property was removed or no longer accepts this value.",
            );
            delete part.component.properties[name];
          }
        }
        const paths = new Set<string>();
        for (const row of part.component.overrides) {
          requireThat(
            !paths.has(pathKey(row.path)),
            "COMPONENT_OVERRIDE",
            "Nested override paths must be unique.",
          );
          paths.add(pathKey(row.path));
          try {
            checkRow(nested, row);
          } catch (error) {
            dropConflict(
              "override",
              error instanceof Error ? error.message : String(error),
            );
            part.component.overrides = part.component.overrides.filter(
              (item) => item !== row,
            );
          }
        }
        if (changed) {
          definition.revision++;
          result?.warnings.push(
            `Dropped incompatible nested values in ${definition.name}.`,
          );
        }
      }
    }
    const properties = new Map<string, Property>(),
      bindingTargets = new Set<string>();
    for (const property of definition.properties) {
      requireThat(
        !properties.has(property.name),
        "COMPONENT_PROPERTY",
        "Property names must be unique.",
      );
      requireThat(
        validProperty(property, property.defaultValue),
        "COMPONENT_PROPERTY",
        `Invalid default for ${property.name}.`,
      );
      requireThat(
        property.type === "enum"
          ? property.options.length > 0 &&
              new Set(property.options).size === property.options.length
          : property.options.length === 0,
        "COMPONENT_PROPERTY",
        "Only enum properties declare a nonempty unique options list.",
      );
      properties.set(property.name, property);
      for (const binding of property.bindings) {
        const base = parts.get(binding.partId),
          key = `${binding.partId}:${binding.field}`;
        requireThat(
          base && !bindingTargets.has(key),
          "COMPONENT_PROPERTY",
          "Bind each existing part field to one property.",
        );
        bindingTargets.add(key);
        assertRootFields(index, binding.partId, {
          [binding.field]: property.defaultValue,
        });
        for (const value of property.type === "enum"
          ? property.options
          : [property.defaultValue]) {
          const node = structuredClone(base);
          propertyPatch(node, binding.field, value);
          checkReferences(doc, node, assets, themes);
          validateBound(node);
        }
      }
    }
    const variantIds = new Set<string>();
    for (const variant of definition.variants) {
      requireThat(
        !variantIds.has(variant.id),
        "COMPONENT_VARIANT",
        "Variant IDs must be unique.",
      );
      variantIds.add(variant.id);
      for (const [name, value] of Object.entries(variant.when)) {
        const property = properties.get(name);
        requireThat(
          property && validProperty(property, value),
          "COMPONENT_VARIANT",
          "A variant condition names an invalid property or value.",
        );
      }
      for (const row of variant.overrides) {
        const base = parts.get(row.partId);
        requireThat(
          base,
          "COMPONENT_VARIANT",
          "A variant names an unknown part.",
        );
        assertRootFields(index, row.partId, row.patch);
        const node = structuredClone(base);
        componentPatch(node, row.patch);
        applyBindings(node, row.bindings);
        checkReferences(doc, node, assets, themes);
        validateBound(node);
      }
    }
  }
  return catalog;
}

export type ComponentConflict = {
  instanceId: string;
  path: string[];
  field: string;
  reason: string;
};
export type ComponentResolution = {
  warnings: string[];
  conflicts: ComponentConflict[];
  conflictCount: number;
  createdIds: string[];
};
export type ComponentResolutionOptions = { dropFor?: Set<string> };

function referenceClosure(
  catalog: Catalog,
  id: string,
  seen = new Set<string>(),
) {
  if (seen.has(id)) return seen;
  seen.add(id);
  for (const part of catalog.get(id)!.definition.nodes)
    if (part.component)
      referenceClosure(catalog, part.component.componentId, seen);
  return seen;
}

/** Shared native materialization follows below; the renderer consumes only the resulting scene. */
export function resolveComponents(
  doc: DesignDocument,
  options: ComponentResolutionOptions = {},
): ComponentResolution {
  const result: ComponentResolution = {
    warnings: [],
    conflicts: [],
    conflictCount: 0,
    createdIds: [],
  };
  if (!doc.components.length) {
    requireThat(
      !doc.nodes.some(
        (node) => node.component || node.componentPart || node.componentSource,
      ),
      "MISSING_COMPONENT",
      "A layer refers to a missing component catalog.",
    );
    return result;
  }
  const catalog = validateComponents(doc, options, result),
    original = new Map(doc.nodes.map((node) => [node.id, node])),
    roots = new Map(
      doc.nodes.filter((node) => node.component).map((node) => [node.id, node]),
    );
  const frozenParts = new Map<string, DesignNode[]>();
  const privateCount = doc.components.reduce(
    (sum, definition) => sum + definition.nodes.length,
    0,
  );
  const baseIds = new Set(
    doc.nodes.filter((node) => !node.componentPart).map((node) => node.id),
  );
  const seen = new Set<string>(),
    nodes: DesignNode[] = [],
    checkedBindings = new Set<string>();
  const emit = (node: DesignNode, topRootId?: string) => {
    requireThat(
      !seen.has(node.id) &&
        (!topRootId || node.id === topRootId || !baseIds.has(node.id)),
      "DUPLICATE_ID",
      "A generated component part collides with an existing node ID.",
    );
    requireThat(
      nodes.length + privateCount < MAX_NODES,
      "COMPONENT_LIMIT",
      "Scene nodes and stored component parts exceed the native node limit.",
    );
    seen.add(node.id);
    nodes.push(node);
    if (!original.has(node.id)) result.createdIds.push(node.id);
  };
  for (const node of doc.nodes) {
    if (node.componentSource)
      requireThat(
        catalog.has(node.componentSource.componentId),
        "MISSING_COMPONENT",
        "An editable source copy refers to a missing retained definition.",
      );
    if (!node.componentPart) {
      if (node.parentId) {
        const parent = original.get(node.parentId);
        requireThat(
          !parent?.component && !parent?.componentPart,
          "COMPONENT_STRUCTURE",
          "Detach the instance before adding or moving ordinary children into it.",
        );
      }
      continue;
    }
    requireThat(
      !node.component,
      "COMPONENT_PART",
      "Generated parts cannot own an independent instance link.",
    );
    const root = roots.get(node.componentPart.instanceId);
    requireThat(
      root && componentNodeId(root.id, node.componentPart.path) === node.id,
      "COMPONENT_PART",
      "A generated part has an invalid owner or deterministic ID.",
    );
    let parent = node.parentId ? original.get(node.parentId) : undefined,
      depth = 0;
    while (parent && parent !== root && ++depth <= 40)
      parent = parent.parentId ? original.get(parent.parentId) : undefined;
    requireThat(
      parent === root && depth <= 40,
      "COMPONENT_PART",
      "Generated parts must remain inside their owning instance.",
    );
    if (root.component!.frozen) {
      const list = frozenParts.get(root.id) ?? [];
      list.push(node);
      frozenParts.set(root.id, list);
    }
  }
  type ScopedRow = {
    row: Override;
    path: string[];
    used: boolean;
    allowDrop: boolean;
    owner: ComponentInstance;
  };
  const rejected: ComponentConflict[] = [];
  let rejectedCount = 0,
    droppedCount = 0;
  const conflict = (
    instanceId: string,
    path: string[],
    field: string,
    reason: string,
    allowDrop: boolean,
  ) => {
    const value = { instanceId, path: [...path], field, reason };
    result.conflictCount++;
    if (result.conflicts.length < 100) result.conflicts.push(value);
    if (allowDrop) droppedCount++;
    else {
      rejectedCount++;
      if (rejected.length < 100) rejected.push(value);
    }
  };
  const assets = new Set(doc.assets.map((asset) => asset.id)),
    themes = new Set(doc.tokenThemes.map((theme) => theme.id));
  for (const source of doc.nodes) {
    if (source.componentPart) continue;
    if (!source.component) {
      emit(source);
      continue;
    }
    const index = catalog.get(source.component.componentId);
    requireThat(
      index,
      "MISSING_COMPONENT",
      "An instance refers to a missing definition.",
    );
    if (source.component.frozen) {
      requireThat(
        source.component.resolvedRevision > 0 &&
          source.component.resolvedRevision <= index.definition.revision,
        "COMPONENT_PART",
        "A frozen instance needs a retained source revision.",
      );
      emit(source);
      for (const part of frozenParts.get(source.id) ?? [])
        emit(part, source.id);
      continue;
    }
    const allowDrop = [...referenceClosure(catalog, index.definition.id)].some(
      (id) => options.dropFor?.has(id),
    );
    const scopedRows: ScopedRow[] = [];
    const expand = (
      current: DefinitionIndex,
      spec: ComponentInstance,
      prefix: string[],
      parentId: string | null,
      located: DesignNode,
      inherited: ScopedRow[][],
      rootPatch?: NativePatch,
      rootBindings?: Override["bindings"],
    ): string => {
      const properties = new Map(
        current.definition.properties.map((property) => [
          property.name,
          property,
        ]),
      );
      const values = new Map(
        current.definition.properties.map((property) => [
          property.name,
          property.defaultValue,
        ]),
      );
      for (const [name, value] of Object.entries(spec.properties)) {
        const property = properties.get(name);
        if (property && validProperty(property, value)) values.set(name, value);
        else {
          conflict(
            source.id,
            prefix,
            name,
            "property was removed or no longer accepts this value",
            allowDrop,
          );
          if (allowDrop) delete spec.properties[name];
        }
      }
      const local: ScopedRow[] = [],
        paths = new Set<string>();
      for (const row of spec.overrides) {
        if (!prefix.length && row.path.length === 1)
          assertRootFields(current, row.path[0], row.patch);
        const key = pathKey(row.path);
        requireThat(
          !paths.has(key),
          "COMPONENT_OVERRIDE",
          "Instance override paths must be unique.",
        );
        paths.add(key);
        const entry = {
          row,
          path: [...prefix, ...row.path],
          used: false,
          allowDrop,
          owner: spec,
        };
        local.push(entry);
        scopedRows.push(entry);
      }
      const layers = [local, ...inherited];
      const variants = current.definition.variants.filter((variant) =>
        Object.entries(variant.when).every(
          ([name, value]) => values.get(name) === value,
        ),
      );
      const visit = (
        part: DesignNode,
        nativeParentId: string | null,
      ): string => {
        const path = [...prefix, part.id];
        const node = structuredClone(part);
        for (const property of current.definition.properties)
          for (const binding of property.bindings)
            if (binding.partId === part.id)
              propertyPatch(node, binding.field, values.get(property.name)!);
        for (const variant of variants)
          for (const row of variant.overrides)
            if (row.partId === part.id) {
              componentPatch(node, row.patch);
              applyBindings(node, row.bindings);
            }
        if (part.component) {
          const nested = catalog.get(part.component.componentId)!;
          const patch: NativePatch = {};
          const bindings: Override["bindings"] = {};
          for (const property of current.definition.properties)
            for (const binding of property.bindings)
              if (binding.partId === part.id) {
                if (binding.field.startsWith("layout."))
                  patch.layout = node.layout;
                else
                  patch[binding.field] =
                    node[binding.field as keyof DesignNode];
              }
          for (const variant of variants)
            for (const row of variant.overrides)
              if (row.partId === part.id) {
                Object.assign(patch, row.patch);
                Object.assign(bindings, row.bindings);
              }
          return expand(
            nested,
            part.component,
            path,
            nativeParentId,
            node,
            layers,
            patch,
            bindings,
          );
        }
        const isTop = !prefix.length && part.id === index.definition.rootId;
        node.id = isTop ? source.id : componentNodeId(source.id, path);
        node.pageId = source.pageId;
        node.parentId = nativeParentId;
        node.component = null;
        node.componentSource = null;
        node.componentPart = isTop ? null : { instanceId: source.id, path };
        if (part.id === current.definition.rootId) {
          for (const key of placement)
            Object.assign(node, { [key]: located[key as keyof DesignNode] });
          node.parentId = nativeParentId;
          node.pageId = source.pageId;
        }
        for (const [layerIndex, layer] of layers.entries()) {
          for (const entry of layer) {
            if (pathKey(entry.path) !== pathKey(path)) continue;
            entry.used = true;
            for (const [field, value] of Object.entries(entry.row.patch)) {
              try {
                const candidate = structuredClone(node);
                componentPatch(candidate, { [field]: value });
                checkReferences(doc, candidate, assets, themes);
                Object.assign(node, candidate);
              } catch (error) {
                conflict(
                  source.id,
                  path,
                  field,
                  error instanceof Error ? error.message : String(error),
                  entry.allowDrop,
                );
                if (entry.allowDrop) delete entry.row.patch[field];
              }
            }
            for (const [field, id] of Object.entries(entry.row.bindings)) {
              try {
                if (typeof id === "string")
                  validateTokenBinding(
                    doc,
                    node,
                    field as TokenPropertyName,
                    id!,
                    checkedBindings,
                  );
                applyBindings(node, { [field]: id });
              } catch (error) {
                conflict(
                  source.id,
                  path,
                  field,
                  error instanceof Error ? error.message : String(error),
                  entry.allowDrop,
                );
                if (entry.allowDrop)
                  delete entry.row.bindings[field as TokenPropertyName];
              }
            }
          }
          if (layerIndex === 0 && part.id === current.definition.rootId) {
            if (rootPatch) componentPatch(node, rootPatch);
            if (rootBindings) applyBindings(node, rootBindings);
          }
        }
        if (isTop) {
          node.component = source.component!;
          node.component.resolvedRevision = index.definition.revision;
          node.componentSource = source.componentSource;
        }
        emit(node, source.id);
        for (const child of current.children.get(part.id) ?? [])
          visit(child, node.id);
        return node.id;
      };
      return visit(current.parts.get(current.definition.rootId)!, parentId);
    };
    expand(index, source.component, [], source.parentId, source, []);
    for (const entry of scopedRows)
      if (!entry.used) {
        conflict(
          source.id,
          entry.path,
          "part",
          "part no longer exists",
          entry.allowDrop,
        );
        if (entry.allowDrop)
          entry.owner.overrides = entry.owner.overrides.filter(
            (row) => row !== entry.row,
          );
      }
    for (const entry of scopedRows)
      if (
        entry.allowDrop &&
        !Object.keys(entry.row.patch).length &&
        !Object.keys(entry.row.bindings).length
      )
        entry.owner.overrides = entry.owner.overrides.filter(
          (row) => row !== entry.row,
        );
  }
  if (rejectedCount)
    throw new DesignError(
      "COMPONENT_CONFLICT",
      "Definition changes conflict with existing instance properties or overrides. Review the bounded conflict list before explicitly dropping them.",
      { conflictCount: rejectedCount, conflicts: rejected },
    );
  if (droppedCount)
    result.warnings.push(
      `Explicitly dropped ${droppedCount} incompatible component properties or overrides.`,
    );
  doc.nodes = nodes;
  return result;
}

export function instanceOwner(
  doc: DesignDocument,
  node: DesignNode,
  byId = new Map(doc.nodes.map((item) => [item.id, item])),
) {
  if (node.component) {
    const definition = doc.components.find(
      (item) => item.id === node.component!.componentId,
    );
    requireThat(
      definition,
      "MISSING_COMPONENT",
      "The instance definition is missing.",
    );
    return { root: node, path: [definition.rootId] };
  }
  if (!node.componentPart) return null;
  const root = byId.get(node.componentPart.instanceId);
  requireThat(
    root?.component,
    "MISSING_COMPONENT",
    "The owning instance is missing.",
  );
  return { root, path: node.componentPart.path };
}
function overrideRow(root: DesignNode, path: string[]) {
  const rows = root.component!.overrides;
  let row = rows.find((row) => pathKey(row.path) === pathKey(path));
  if (!row) {
    requireThat(
      rows.length < MAX_COMPONENT_OVERRIDES,
      "COMPONENT_LIMIT",
      "Too many sparse overrides on this instance.",
    );
    row = { path: [...path], patch: {}, bindings: {} };
    rows.push(row);
  }
  return row;
}
/** Ordinary style/text edits and token binding actions record sparse intent before regeneration. */
export function recordComponentPatch(
  doc: DesignDocument,
  node: DesignNode,
  patch: NativePatch,
  byId?: Map<string, DesignNode>,
) {
  const owner = instanceOwner(doc, node, byId);
  if (!owner) return;
  const fields = Object.entries(patch).filter(
    ([field]) => node !== owner.root || !placement.has(field),
  );
  if (!fields.length) return;
  const row = overrideRow(owner.root, owner.path);
  for (const [field, value] of fields) {
    row.patch[field] = structuredClone(value);
    for (const binding of Object.keys(row.bindings))
      if (
        field === binding ||
        (field === "layout" && binding.startsWith("layout."))
      )
        delete row.bindings[binding as TokenPropertyName];
  }
}
export function recordComponentBinding(
  doc: DesignDocument,
  node: DesignNode,
  field: TokenPropertyName,
  tokenId: string | null,
  byId?: Map<string, DesignNode>,
) {
  const owner = instanceOwner(doc, node, byId);
  if (!owner) return;
  const row = overrideRow(owner.root, owner.path);
  const value =
    field === "layout.gap"
      ? node.layout.gap
      : field === "layout.padding"
        ? node.layout.padding
        : node[field as Exclude<TokenPropertyName, `layout.${string}`>];
  row.bindings[field] = tokenId ?? { value };
  if (!field.startsWith("layout.")) delete row.patch[field];
}

/** Capture an ordinary editable subtree; linked descendants remain explicit nested references. */
export function captureComponent(
  doc: DesignDocument,
  rootId: string,
  componentId: string,
) {
  const source = doc.nodes.find((node) => node.id === rootId);
  requireThat(
    source &&
      ["frame", "group"].includes(source.type) &&
      !source.component &&
      !source.componentPart,
    "COMPONENT_ROOT",
    "Select an ordinary frame/group, or insert an editable component source first.",
  );
  const children = new Map<string, DesignNode[]>();
  for (const node of doc.nodes)
    if (node.parentId) {
      const siblings = children.get(node.parentId) ?? [];
      siblings.push(node);
      children.set(node.parentId, siblings);
    }
  const wanted = new Set<string>();
  const visit = (node: DesignNode) => {
    requireThat(
      !wanted.has(node.id),
      "INVALID_HIERARCHY",
      "Invalid source hierarchy.",
    );
    wanted.add(node.id);
    if (!node.component)
      for (const child of children.get(node.id) ?? []) visit(child);
  };
  visit(source);
  const selected = doc.nodes.filter((node) => wanted.has(node.id));
  const ids = new Map(
    selected.map((node) => [
      node.id,
      node.componentSource?.componentId === componentId
        ? node.componentSource.partId
        : node.id,
    ]),
  );
  requireThat(
    new Set(ids.values()).size === ids.size,
    "COMPONENT_PART",
    "The source contains repeated part provenance. Duplicate ordinary artwork or detach that part before publishing.",
  );
  const nodes = selected.map((original) => {
    const node = structuredClone(original);
    node.id = ids.get(original.id)!;
    node.pageId = "component";
    node.parentId = original === source ? null : ids.get(original.parentId!)!;
    node.componentPart = null;
    node.componentSource = null;
    if (node.component) {
      node.component.resolvedRevision = 0;
      node.component.frozen = false;
    }
    if (original === source) {
      node.x = 0;
      node.y = 0;
      node.rotation = 0;
      node.hidden = false;
      node.locked = false;
    }
    return node;
  });
  return {
    rootId: ids.get(source.id)!,
    nodes,
    sourceRevision:
      source.componentSource?.componentId === componentId
        ? source.componentSource.revision
        : null,
  };
}

export function componentSourceNodes(
  doc: DesignDocument,
  componentId: string,
  rootId: string,
  pageId: string,
  parentId: string | null,
  x: number,
  y: number,
) {
  const definition = doc.components.find(
    (item) => item.id === componentId && !item.deleted,
  );
  requireThat(
    definition,
    "MISSING_COMPONENT",
    "Choose an active component definition.",
  );
  const ids = new Map(
    definition.nodes.map((node) => [
      node.id,
      node.id === definition.rootId
        ? rootId
        : componentNodeId(rootId, [node.id], true),
    ]),
  );
  const ordered: DesignNode[] = [];
  const children = new Map<string | null, DesignNode[]>();
  for (const part of definition.nodes) {
    const list = children.get(part.parentId) ?? [];
    list.push(part);
    children.set(part.parentId, list);
  }
  const visit = (part: DesignNode) => {
    ordered.push(part);
    for (const child of children.get(part.id) ?? []) visit(child);
  };
  visit(definition.nodes.find((part) => part.id === definition.rootId)!);
  return ordered.map((part) => {
    const node = structuredClone(part);
    node.id = ids.get(part.id)!;
    node.pageId = pageId;
    node.parentId = part.parentId ? ids.get(part.parentId)! : parentId;
    node.componentPart = null;
    node.componentSource = {
      componentId,
      partId: part.id,
      revision: definition.revision,
    };
    if (node.component) {
      node.component.resolvedRevision = 0;
      node.component.frozen = false;
    }
    if (part.id === definition.rootId) {
      node.x = x;
      node.y = y;
      node.hidden = false;
      node.locked = false;
    }
    return node;
  });
}
