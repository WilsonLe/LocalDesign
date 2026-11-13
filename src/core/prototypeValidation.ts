import { type DesignDocument, requireThat } from "./model";
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
