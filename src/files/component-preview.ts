import { DesignEngine } from "../core/engine";
import {
  uid,
  requireThat,
  type ComponentValue,
  type DesignDocument,
} from "../core/model";
import { MAX_COMPONENT_PREVIEW_STATES } from "../core/limits";
import { pngExport, exportBounds } from "./export";
export async function componentVariantPreview(
  doc: DesignDocument,
  componentId: string,
  scale = 1,
) {
  const definition = doc.components.find(
    (item) => item.id === componentId && !item.deleted,
  );
  requireThat(definition, "MISSING_COMPONENT", "Choose an active component.");
  const states: { name: string; properties: Record<string, ComponentValue> }[] =
    [
      { name: "Default", properties: {} },
      ...definition.variants
        .slice(0, MAX_COMPONENT_PREVIEW_STATES - 1)
        .map((variant) => ({ name: variant.name, properties: variant.when })),
    ];
  const temp = new DesignEngine({ ...structuredClone(doc), nodes: [] });
  const pageId = temp.pageId;
  const ids = states.map(() => uid()),
    labels = states.map(() => uid());
  temp.dispatch(
    states.map((state, index) => ({
      op: "component_instance" as const,
      id: ids[index],
      componentId,
      pageId,
      parentId: null,
      x: 0,
      y: 0,
      rotation: 0,
      properties: state.properties,
      overrides: [],
    })),
  );
  const nodes = ids.map((id) =>
    temp.document.nodes.find((node) => node.id === id)!,
  );
  const columns = Math.ceil(Math.sqrt(states.length));
  const cellWidth = Math.max(160, ...nodes.map((node) => node.width)) + 32,
    cellHeight = Math.max(...nodes.map((node) => node.height)) + 64;
  temp.dispatch(
    states.flatMap((state, index) => [
      {
        op: "update" as const,
        ids: [ids[index]],
        patch: {
          x: (index % columns) * cellWidth,
          y: Math.floor(index / columns) * cellHeight + 28,
        },
      },
      {
        op: "create" as const,
        node: {
          ...nodes[index],
          id: labels[index],
          type: "text" as const,
          name: state.name,
          text: state.name,
          width: cellWidth - 24,
          height: 24,
          x: (index % columns) * cellWidth,
          y: Math.floor(index / columns) * cellHeight,
          parentId: null,
          fontSize: 14,
          fill: "#171717",
          stroke: "none",
          bindings: {},
          component: null,
          componentPart: null,
          componentSource: null,
        },
      },
    ]),
  );
  const selected = [...ids, ...labels];
  const box = exportBounds(temp.document, pageId, selected);
  const actualScale = Math.min(scale, 2048 / Math.max(box.width, box.height));
  return {
    blob: await pngExport(temp.document, pageId, selected, {
      scale: actualScale,
      background: "#ffffff",
    }),
    states,
    scale: actualScale,
  };
}
