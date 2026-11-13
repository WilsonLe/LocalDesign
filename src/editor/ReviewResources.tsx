import { useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { NativeSelect } from "../components/ui/native-select";
import type { DesignEngine } from "../core/engine";
import { uid, type DesignDocument } from "../core/model";
import type { Command } from "../core/commands";
import { worldPoint } from "../core/geometry";
export function ReviewResources({
  engine,
  document: doc,
  onError,
  onNavigate,
}: {
  engine: DesignEngine;
  document: DesignDocument;
  onError: (s: string) => void;
  onNavigate: () => void;
}) {
  const [author, setAuthor] = useState("You"),
    [body, setBody] = useState(""),
    [nodeId, setNodeId] = useState(engine.selection[0] ?? ""),
    [x, setX] = useState(0),
    [y, setY] = useState(0),
    [showResolved, setShowResolved] = useState(false),
    [reply, setReply] = useState<Record<string, string>>({});
  const run = (commands: Command[]) => {
    try {
      engine.dispatch(commands);
      return true;
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      return false;
    }
  };
  return (
    <div className="resource-sections">
      <section>
        <h3>New thread</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (
              run([
                {
                  op: "review_add",
                  id: uid(),
                  anchor: {
                    pageId: engine.pageId,
                    nodeId: nodeId || null,
                    x,
                    y,
                    pageName: "",
                    nodeName: "",
                  },
                  message: { id: uid(), author, body },
                },
              ])
            )
              setBody("");
          }}
        >
          <label>
            Author
            <Input
              required
              value={author}
              maxLength={100}
              onChange={(e) => setAuthor(e.target.value)}
            />
          </label>
          <label>
            Anchor
            <NativeSelect
              aria-label="Review anchor"
              value={nodeId}
              onChange={(e) => setNodeId(e.target.value)}
            >
              <option value="">Canvas position</option>
              {doc.nodes
                .filter((node) => node.pageId === engine.pageId)
                .map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name}
                  </option>
                ))}
            </NativeSelect>
          </label>
          <div className="field-grid">
            <label>
              X
              <Input
                type="number"
                value={x}
                onChange={(e) => setX(Number(e.target.value))}
              />
            </label>
            <label>
              Y
              <Input
                type="number"
                value={y}
                onChange={(e) => setY(Number(e.target.value))}
              />
            </label>
          </div>
          <label>
            Comment
            <Textarea
              required
              value={body}
              maxLength={4000}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <Button type="submit">Add thread</Button>
        </form>
      </section>
      <section>
        <h3>Threads</h3>
        <label className="checks">
          <Input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
          />
          Show resolved
        </label>
        {!doc.reviewThreads.length && <p>No review threads.</p>}
        <ul className="review-threads">
          {doc.reviewThreads
            .filter((thread) => showResolved || !thread.resolved)
            .map((thread) => {
              const anchor = doc.nodes.find(
                  (node) => node.id === thread.anchor.nodeId,
                ),
                page = doc.pages.find(
                  (page) => page.id === thread.anchor.pageId,
                );
              return (
                <li key={thread.id}>
                  <strong>{thread.message.author}</strong>
                  <p className="review-body">{thread.message.body}</p>
                  <span>
                    {thread.resolved ? "Resolved · " : ""}
                    {anchor?.name ??
                      (thread.anchor.nodeId
                        ? `${thread.anchor.nodeName || "Layer"} (missing)`
                        : `Position ${thread.anchor.x}, ${thread.anchor.y}`)}{" "}
                    · {page?.name ?? `${thread.anchor.pageName} (missing page)`}
                  </span>
                  <div className="button-row">
                    <Button
                      disabled={!page}
                      onClick={() => {
                        if (!page) return;
                        engine.select(anchor ? [anchor.id] : [], page.id);
                        const box = anchor
                          ? worldPoint(doc, anchor, {
                              x: thread.anchor.x,
                              y: thread.anchor.y,
                            })
                          : {
                              x: thread.anchor.lastX,
                              y: thread.anchor.lastY,
                              width: 0,
                              height: 0,
                            };
                        engine.setViewport({
                          x: 120 - box.x * engine.viewport.zoom,
                          y: 120 - box.y * engine.viewport.zoom,
                        });
                        onNavigate();
                      }}
                    >
                      Go to anchor
                    </Button>
                    <Button
                      onClick={() =>
                        run([
                          {
                            op: "review_resolve",
                            id: thread.id,
                            resolved: !thread.resolved,
                          },
                        ])
                      }
                    >
                      {thread.resolved ? "Reopen" : "Resolve"}
                    </Button>
                    <Button
                      onClick={() =>
                        run([{ op: "review_delete", id: thread.id }])
                      }
                    >
                      Remove thread
                    </Button>
                  </div>
                  <ol>
                    {thread.replies.map((message) => (
                      <li key={message.id}>
                        <strong>{message.author}</strong>
                        <p className="review-body">{message.body}</p>
                      </li>
                    ))}
                  </ol>
                  {!thread.resolved && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (
                          run([
                            {
                              op: "review_reply",
                              id: thread.id,
                              message: {
                                id: uid(),
                                author,
                                body: reply[thread.id] ?? "",
                              },
                            },
                          ])
                        )
                          setReply({ ...reply, [thread.id]: "" });
                      }}
                    >
                      <label>
                        Reply
                        <Textarea
                          required
                          maxLength={4000}
                          value={reply[thread.id] ?? ""}
                          onChange={(e) =>
                            setReply({ ...reply, [thread.id]: e.target.value })
                          }
                        />
                      </label>
                      <Button type="submit">Reply to thread</Button>
                    </form>
                  )}
                </li>
              );
            })}
        </ul>
      </section>
    </div>
  );
}
