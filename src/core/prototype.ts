import {
  type DesignDocument,
  type DesignNode,
  ancestors,
  descendants,
  requireThat,
} from "./model";
import { MAX_PROTOTYPE_HISTORY, MAX_PROTOTYPE_OVERLAYS } from "./limits";
import { indexNodes } from "./tree";
import { visibleNodes } from "../render/visibility";
export type PrototypePlayerState = {
  open: boolean;
  frameId: string | null;
  history: string[];
  overlays: {
    frameId: string;
    position: DesignDocument["prototype"]["interactions"][number]["position"];
  }[];
  error: string | null;
};
export const emptyPlayer = (): PrototypePlayerState => ({
  open: false,
  frameId: null,
  history: [],
  overlays: [],
  error: null,
});
export type PrototypeAction = {
  action: "start" | "event" | "back" | "close_overlay" | "stop";
  frameId?: string;
  interactionId?: string;
};
export function validatePrototype(doc: DesignDocument) {
  const sources = new Set<string>();
  for (const interaction of doc.prototype.interactions) {
    requireThat(
      !sources.has(interaction.sourceId),
      "PROTOTYPE_DUPLICATE",
      "A layer can have one click interaction.",
    );
    sources.add(interaction.sourceId);
    requireThat(
      ["navigate", "overlay"].includes(interaction.action)
        ? Boolean(interaction.targetFrameId)
        : interaction.targetFrameId === null,
      "PROTOTYPE_TARGET",
      "Navigation/overlay actions require a frame target; back/close actions do not have a target.",
    );
  }
}
export function prototypeProblems(doc: DesignDocument) {
  const byId = new Map(doc.nodes.map((node) => [node.id, node]));
  const problems: { id: string; reason: string }[] = [];
  if (
    doc.prototype.entryFrameId &&
    byId.get(doc.prototype.entryFrameId)?.type !== "frame"
  )
    problems.push({ id: "entry", reason: "Entry frame is missing." });
  for (const interaction of doc.prototype.interactions) {
    if (!byId.has(interaction.sourceId))
      problems.push({ id: interaction.id, reason: "Source layer is missing." });
    if (
      interaction.targetFrameId &&
      byId.get(interaction.targetFrameId)?.type !== "frame"
    )
      problems.push({ id: interaction.id, reason: "Target frame is missing." });
  }
  return problems;
}
export function prototypeActions(
  doc: DesignDocument,
  state: PrototypePlayerState,
) {
  const frameId = state.overlays.at(-1)?.frameId ?? state.frameId;
  if (!frameId) return [];
  const index = indexNodes(doc),
    allowed = new Set([
      frameId,
      ...descendants(doc, frameId).map((node) => node.id),
    ]);
  const isolated = isolatePrototypeFrame(doc, frameId),
    isolatedIndex = indexNodes(isolated.document);
  const painted = visibleNodes(
    isolated.document,
    [isolated.root],
    isolatedIndex,
    { x: 0, y: 0, width: isolated.root.width, height: isolated.root.height },
  );
  const broken = new Set(prototypeProblems(doc).map((problem) => problem.id));
  return doc.prototype.interactions.filter((interaction) => {
    const node = index.byId.get(interaction.sourceId);
    return (
      allowed.has(interaction.sourceId) &&
      painted.has(interaction.sourceId) &&
      !broken.has(interaction.id) &&
      node &&
      !node.hidden &&
      !ancestors(doc, node, index.byId).some((parent) => parent.hidden)
    );
  });
}
export function advancePrototype(
  doc: DesignDocument,
  previous: PrototypePlayerState,
  input: PrototypeAction,
): PrototypePlayerState {
  const state = structuredClone(previous);
  const frame = (id: string | undefined | null) => {
    const node = doc.nodes.find((node) => node.id === id);
    requireThat(
      node?.type === "frame" &&
        !node.hidden &&
        !ancestors(doc, node).some((parent) => parent.hidden),
      "PROTOTYPE_FRAME",
      "Choose a visible native frame.",
    );
    return node;
  };
  if (input.action === "stop") return emptyPlayer();
  if (input.action === "start") {
    const node = frame(input.frameId ?? doc.prototype.entryFrameId);
    return { ...emptyPlayer(), open: true, frameId: node.id };
  }
  requireThat(
    state.open && state.frameId,
    "PROTOTYPE_CLOSED",
    "Open the local prototype player first.",
  );
  const back = () => {
    requireThat(
      state.history.length,
      "PROTOTYPE_HISTORY",
      "No previous frame.",
    );
    state.frameId = frame(state.history.pop()).id;
    state.overlays = [];
  };
  const close = () => {
    requireThat(state.overlays.length, "PROTOTYPE_OVERLAY", "No open overlay.");
    state.overlays.pop();
  };
  if (input.action === "back") back();
  else if (input.action === "close_overlay") close();
  else {
    const interaction = prototypeActions(doc, state).find(
      (item) => item.id === input.interactionId,
    );
    requireThat(
      interaction,
      "PROTOTYPE_SOURCE",
      "Choose an available interaction on the current frame/overlay.",
    );
    if (interaction.action === "back") back();
    else if (interaction.action === "close_overlay") close();
    else if (interaction.action === "overlay") {
      requireThat(
        state.overlays.length < MAX_PROTOTYPE_OVERLAYS,
        "PROTOTYPE_LIMIT",
        "At most 10 overlays can be open.",
      );
      state.overlays.push({
        frameId: frame(interaction.targetFrameId).id,
        position: interaction.position,
      });
    } else {
      state.history.push(state.frameId);
      if (state.history.length > MAX_PROTOTYPE_HISTORY) state.history.shift();
      state.frameId = frame(interaction.targetFrameId).id;
      state.overlays = [];
    }
  }
  state.error = null;
  return state;
}
export function isolatePrototypeFrame(
  doc: DesignDocument,
  id: string,
): { document: DesignDocument; root: DesignNode } {
  const root = doc.nodes.find((node) => node.id === id);
  requireThat(
    root?.type === "frame",
    "PROTOTYPE_FRAME",
    "The frame is missing.",
  );
  const nodes = [
    { ...root, x: 0, y: 0, rotation: 0, parentId: null },
    ...descendants(doc, id),
  ];
  return { document: { ...doc, nodes }, root: nodes[0] };
}
