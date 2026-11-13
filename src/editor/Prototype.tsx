import { useMemo, useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { NativeSelect } from "../components/ui/native-select";
import type { DesignEngine, Snapshot } from "../core/engine";
import { ancestors, uid, type DesignDocument } from "../core/model";
import {
  isolatePrototypeFrame,
  prototypeActions,
  prototypeProblems,
  type PrototypeAction,
} from "../core/prototype";
import { Scene } from "../render/Scene";
export function PrototypeResources({
  engine,
  document: doc,
  onError,
  onPlay,
}: {
  engine: DesignEngine;
  document: DesignDocument;
  onError: (s: string) => void;
  onPlay: () => void;
}) {
  const [sourceId, setSourceId] = useState(engine.selection[0] ?? ""),
    [targetId, setTargetId] = useState(""),
    [action, setAction] =
      useState<DesignDocument["prototype"]["interactions"][number]["action"]>(
        "navigate",
      ),
    [position, setPosition] =
      useState<DesignDocument["prototype"]["interactions"][number]["position"]>(
        "center",
      ),
    [query, setQuery] = useState("");
  const frames = doc.nodes.filter((node) => node.type === "frame"),
    sources = doc.nodes
      .filter((node) => node.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 200),
    problems = prototypeProblems(doc),
    broken = new Set(problems.map((problem) => problem.id));
  const run = (prototype: DesignDocument["prototype"]) => {
    try {
      engine.dispatch([{ op: "prototype_set", prototype }]);
      return true;
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      return false;
    }
  };
  return (
    <div className="resource-sections">
      <section>
        <h3>Prototype</h3>
        <label>
          Entry frame
          <NativeSelect
            aria-label="Prototype entry frame"
            value={doc.prototype.entryFrameId ?? ""}
            onChange={(e) =>
              run({ ...doc.prototype, entryFrameId: e.target.value || null })
            }
          >
            <option value="">No entry frame</option>
            {frames.map((frame) => (
              <option key={frame.id} value={frame.id}>
                {frame.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <Button
          disabled={!doc.prototype.entryFrameId || broken.has("entry")}
          onClick={() => {
            try {
              engine.playPrototype(doc.id, { action: "start" });
              onPlay();
            } catch (e) {
              onError(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          Play prototype
        </Button>
        {!!problems.length && (
          <div role="alert">
            <ul>
              {problems.map((problem, index) => (
                <li key={index}>{problem.reason}</li>
              ))}
            </ul>
            <Button
              onClick={() =>
                run({
                  entryFrameId: broken.has("entry")
                    ? null
                    : doc.prototype.entryFrameId,
                  interactions: doc.prototype.interactions.filter(
                    (item) => !broken.has(item.id),
                  ),
                })
              }
            >
              Remove broken links
            </Button>
          </div>
        )}
      </section>
      <section>
        <h3>Click interaction</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const id = uid();
            run({
              ...doc.prototype,
              interactions: [
                ...doc.prototype.interactions.filter(
                  (item) => item.sourceId !== sourceId,
                ),
                {
                  id,
                  sourceId,
                  sourceName: "",
                  action,
                  targetFrameId: ["navigate", "overlay"].includes(action)
                    ? targetId
                    : null,
                  targetName: "",
                  position,
                },
              ],
            });
          }}
        >
          <label>
            Find source layer
            <Input value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <label>
            Source layer
            <NativeSelect
              aria-label="Prototype source layer"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
            >
              <option value="">Choose layer</option>
              {sources.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.name}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label>
            Action
            <NativeSelect
              aria-label="Prototype action"
              value={action}
              onChange={(e) => setAction(e.target.value as typeof action)}
            >
              <option value="navigate">Navigate</option>
              <option value="back">Back</option>
              <option value="overlay">Open overlay</option>
              <option value="close_overlay">Close overlay</option>
            </NativeSelect>
          </label>
          {["navigate", "overlay"].includes(action) && (
            <label>
              Target frame
              <NativeSelect
                aria-label="Prototype target frame"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              >
                <option value="">Choose frame</option>
                {frames.map((frame) => (
                  <option key={frame.id} value={frame.id}>
                    {frame.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
          )}
          {action === "overlay" && (
            <label>
              Overlay position
              <NativeSelect
                aria-label="Overlay position"
                value={position}
                onChange={(e) => setPosition(e.target.value as typeof position)}
              >
                {[
                  "center",
                  "top-left",
                  "top-right",
                  "bottom-left",
                  "bottom-right",
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </NativeSelect>
            </label>
          )}
          <Button
            type="submit"
            disabled={
              !sourceId ||
              (["navigate", "overlay"].includes(action) && !targetId)
            }
          >
            Save interaction
          </Button>
        </form>
      </section>
      <section>
        <h3>Interactions</h3>
        <ul className="resource-records">
          {doc.prototype.interactions.map((item) => (
            <li key={item.id}>
              <span>
                {doc.nodes.find((node) => node.id === item.sourceId)?.name ??
                  item.sourceName}{" "}
                →{" "}
                {item.targetFrameId
                  ? (frames.find((frame) => frame.id === item.targetFrameId)
                      ?.name ?? item.targetName)
                  : item.action}
                {broken.has(item.id) ? " · Broken" : ""}
              </span>
              <Button
                onClick={() =>
                  run({
                    ...doc.prototype,
                    interactions: doc.prototype.interactions.filter(
                      (edge) => edge.id !== item.id,
                    ),
                  })
                }
              >
                Remove interaction
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
function FrameView({
  document: doc,
  id,
  level,
  onActivate,
}: {
  document: DesignDocument;
  id: string;
  level: number;
  onActivate: (interactionId: string) => void;
}) {
  const isolated = useMemo(() => isolatePrototypeFrame(doc, id), [doc, id]);
  const click = (sourceId: string) => {
    const source = doc.nodes.find((node) => node.id === sourceId);
    if (!source) return;
    for (const node of [source, ...ancestors(doc, source)]) {
      const interaction = doc.prototype.interactions.find(
        (item) => item.sourceId === node.id,
      );
      if (interaction) {
        onActivate(interaction.id);
        return;
      }
      if (node.id === id) break;
    }
  };
  return (
    <svg
      viewBox={`0 0 ${isolated.root.width} ${isolated.root.height}`}
      role="img"
      aria-label={isolated.root.name}
      className="prototype-artboard"
    >
      <Scene
        doc={isolated.document}
        pageId={isolated.root.pageId}
        rootIds={[id]}
        interactive
        glyphPrefix={`prototype-${level}-`}
        onPointerDown={(event) => {
          event.stopPropagation();
          const sourceId = event.currentTarget.dataset.nodeId;
          if (sourceId) click(sourceId);
        }}
      />
    </svg>
  );
}
export function PrototypePlayer({
  engine,
  snapshot,
  onError,
}: {
  engine: DesignEngine;
  snapshot: Snapshot;
  onError: (s: string) => void;
}) {
  const doc = snapshot.document,
    state = snapshot.player,
    frame = doc.nodes.find((node) => node.id === state.frameId);
  if (!frame) return null;
  const play = (input: PrototypeAction) => {
    try {
      engine.playPrototype(doc.id, input);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  const actions = prototypeActions(doc, state);
  return (
    <div className="prototype-player">
      <div className="button-row">
        <Button
          disabled={!state.history.length}
          onClick={() => play({ action: "back" })}
        >
          Back
        </Button>
        <Button
          disabled={!state.overlays.length}
          onClick={() => play({ action: "close_overlay" })}
        >
          Close overlay
        </Button>
        <Button onClick={() => play({ action: "start" })}>Restart</Button>
        <strong>{frame.name}</strong>
      </div>
      <div className="prototype-stage">
        <FrameView
          document={doc}
          id={frame.id}
          level={0}
          onActivate={(interactionId) =>
            play({ action: "event", interactionId })
          }
        />
        {state.overlays.map(({ frameId: id, position }, index) => {
          const overlay = doc.nodes.find((node) => node.id === id)!;
          return (
            <div
              key={`${id}-${index}`}
              className={`prototype-overlay position-${position}`}
              style={{
                width: `${(overlay.width / frame.width) * 100}%`,
                zIndex: index + 1,
                pointerEvents:
                  index === state.overlays.length - 1 ? "auto" : "none",
              }}
            >
              <FrameView
                document={doc}
                id={id}
                level={index + 1}
                onActivate={(interactionId) =>
                  play({ action: "event", interactionId })
                }
              />
            </div>
          );
        })}
      </div>
      <div className="prototype-actions" aria-label="Prototype actions">
        {actions.map((item) => (
          <Button
            key={item.id}
            onClick={() => play({ action: "event", interactionId: item.id })}
          >
            {doc.nodes.find((node) => node.id === item.sourceId)?.name} →{" "}
            {item.targetFrameId
              ? (doc.nodes.find((node) => node.id === item.targetFrameId)
                  ?.name ?? "Missing frame")
              : item.action.replaceAll("_", " ")}
          </Button>
        ))}
      </div>
    </div>
  );
}
