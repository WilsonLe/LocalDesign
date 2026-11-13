import { useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { NativeSelect } from "../components/ui/native-select";
import { Textarea } from "../components/ui/textarea";
import type { DesignEngine } from "../core/engine";
import type { Command } from "../core/commands";
import { roots, uid, type DesignDocument } from "../core/model";
import { bounds } from "../core/geometry";
import { pngExport } from "../files/export";
import { validateRasterAssets } from "../files/raster";
import { base64 } from "../render/fonts";
import { TokenResources } from "./TokenResources";
import { IconResources } from "./IconResources";
import { ComponentResources } from "./ComponentResources";
import { HistoryResources } from "./HistoryResources";
import { ReviewResources } from "./ReviewResources";
const resourceTabs = [
  "context",
  "pages",
  "tokens",
  "icons",
  "components",
  "history",
  "review",
] as const;

export function DesignResources({
  engine,
  document: doc,
  onError,
  onClose,
}: {
  engine: DesignEngine;
  document: DesignDocument;
  onError: (message: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<(typeof resourceTabs)[number]>("context");
  const [guideId, setGuideId] = useState("");
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [decision, setDecision] = useState("");
  const [rationale, setRationale] = useState("");
  const [author, setAuthor] = useState("You");
  const [referenceTitle, setReferenceTitle] = useState("");
  const [provenance, setProvenance] = useState("");
  const [destination, setDestination] = useState(engine.pageId);
  const [busy, setBusy] = useState(false);
  const run = (commands: Command[]) => {
    try {
      engine.dispatch(commands);
      return true;
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      return false;
    }
  };
  const pin = async () => {
    setBusy(true);
    const guard = engine.guard(),
      current = engine.document,
      selected = [...engine.selection],
      page = engine.pageId;
    try {
      if (!selected.length) throw new Error("Select a frame or layers to pin.");
      const blob = await pngExport(current, page, selected);
      const geometry = bounds(current, roots(current, selected));
      const asset = {
        id: uid(),
        name: referenceTitle.trim() || "Reference",
        mime: "image/png" as const,
        data: `data:image/png;base64,${base64(new Uint8Array(await blob.arrayBuffer()))}`,
        width: Math.ceil(geometry.width),
        height: Math.ceil(geometry.height),
      };
      await validateRasterAssets([asset]);
      engine.edit({
        ...guard,
        commands: [
          { op: "asset_add", asset },
          {
            op: "reference_set",
            reference: {
              id: uid(),
              title: asset.name,
              assetId: asset.id,
              provenance: provenance.trim() || `Captured from ${current.name}`,
              sourceDocumentId: current.id,
              sourceRevision: current.revision,
            },
          },
        ],
      });
      setReferenceTitle("");
      setProvenance("");
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const reorder = (id: string, delta: number) => {
    const ids = doc.pages.map((p) => p.id),
      index = ids.indexOf(id),
      target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run([{ op: "pages_reorder", pageIds: ids }]);
  };
  return (
    <div className="design-resources">
      <div
        className="resource-tabs"
        role="tablist"
        aria-label="Design resources"
      >
        {resourceTabs.map((value) => (
          <Button
            key={value}
            role="tab"
            id={`resource-tab-${value}`}
            aria-controls={`resource-panel-${value}`}
            tabIndex={tab === value ? 0 : -1}
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            onKeyDown={(event) => {
              const index = resourceTabs.indexOf(value);
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? resourceTabs.length - 1
                    : event.key === "ArrowRight"
                      ? (index + 1) % resourceTabs.length
                      : event.key === "ArrowLeft"
                        ? (index + resourceTabs.length - 1) %
                          resourceTabs.length
                        : -1;
              if (next < 0) return;
              event.preventDefault();
              setTab(resourceTabs[next]);
              document
                .getElementById(`resource-tab-${resourceTabs[next]}`)
                ?.focus();
            }}
          >
            {value === "context"
              ? "Context"
              : value === "tokens"
                ? "Tokens"
                : value === "icons"
                  ? "Icons"
                  : value === "components"
                    ? "Components"
                    : value === "history"
                      ? "History"
                      : value === "review"
                        ? "Review"
                        : "Pages"}
          </Button>
        ))}
      </div>
      {tab === "review" ? (
        <div
          role="tabpanel"
          id="resource-panel-review"
          aria-labelledby="resource-tab-review"
        >
          <ReviewResources
            engine={engine}
            document={doc}
            onError={onError}
            onNavigate={onClose}
          />
        </div>
      ) : tab === "history" ? (
        <div
          role="tabpanel"
          id="resource-panel-history"
          aria-labelledby="resource-tab-history"
        >
          <HistoryResources engine={engine} document={doc} onError={onError} />
        </div>
      ) : tab === "components" ? (
        <div
          role="tabpanel"
          id="resource-panel-components"
          aria-labelledby="resource-tab-components"
        >
          <ComponentResources
            engine={engine}
            document={doc}
            onError={onError}
            onInserted={onClose}
          />
        </div>
      ) : tab === "icons" ? (
        <div
          role="tabpanel"
          id="resource-panel-icons"
          aria-labelledby="resource-tab-icons"
        >
          <IconResources
            engine={engine}
            onError={onError}
            onInserted={onClose}
          />
        </div>
      ) : tab === "tokens" ? (
        <div
          role="tabpanel"
          id="resource-panel-tokens"
          aria-labelledby="resource-tab-tokens"
        >
          <TokenResources engine={engine} document={doc} onError={onError} />
        </div>
      ) : tab === "context" ? (
        <div
          role="tabpanel"
          id="resource-panel-context"
          aria-labelledby="resource-tab-context"
          className="resource-sections"
        >
          <section>
            <h3>Guidelines</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  run([
                    {
                      op: "guideline_set",
                      guideline: {
                        id: guideId || uid(),
                        name: name.trim(),
                        content,
                      },
                    },
                  ])
                ) {
                  setGuideId("");
                  setName("");
                  setContent("");
                }
              }}
            >
              <label>
                Guide
                <NativeSelect
                  aria-label="Choose guideline"
                  value={guideId}
                  onChange={(e) => {
                    const guide = doc.guidelines.find(
                      (g) => g.id === e.target.value,
                    );
                    setGuideId(guide?.id ?? "");
                    setName(guide?.name ?? "");
                    setContent(guide?.content ?? "");
                  }}
                >
                  <option value="">New guideline</option>
                  {doc.guidelines.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label>
                Name
                <Input
                  aria-label="Guideline name"
                  required
                  maxLength={200}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Rules
                <Textarea
                  aria-label="Guideline rules"
                  required
                  maxLength={24000}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </label>
              <div className="button-row">
                <Button type="submit">Save guideline</Button>
                {guideId && (
                  <Button
                    type="button"
                    onClick={() => {
                      if (run([{ op: "guideline_delete", id: guideId }])) {
                        setGuideId("");
                        setName("");
                        setContent("");
                      }
                    }}
                  >
                    Delete guideline
                  </Button>
                )}
              </div>
            </form>
          </section>
          <section>
            <h3>Decisions</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  run([
                    {
                      op: "decision_add",
                      decision: {
                        id: uid(),
                        decision,
                        rationale,
                        author: author.trim(),
                        createdAt: new Date().toISOString(),
                      },
                    },
                  ])
                ) {
                  setDecision("");
                  setRationale("");
                }
              }}
            >
              <label>
                Decision
                <Textarea
                  aria-label="Decision"
                  required
                  maxLength={500}
                  value={decision}
                  onChange={(e) => setDecision(e.target.value)}
                />
              </label>
              <label>
                Reason
                <Textarea
                  aria-label="Decision reason"
                  required
                  maxLength={1000}
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                />
              </label>
              <label>
                By
                <Input
                  aria-label="Decision author"
                  required
                  maxLength={80}
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                />
              </label>
              <Button type="submit">Record decision</Button>
            </form>
            <ol className="resource-records">
              {doc.decisions.map((record) => (
                <li key={record.id}>
                  <strong>{record.decision}</strong>
                  <p>{record.rationale}</p>
                  <span>{record.author}</span>
                  <Button
                    aria-label={`Delete decision ${record.decision}`}
                    onClick={() =>
                      run([{ op: "decision_delete", id: record.id }])
                    }
                  >
                    Delete
                  </Button>
                </li>
              ))}
            </ol>
          </section>
          <section>
            <h3>References</h3>
            <label>
              Title
              <Input
                aria-label="Reference title"
                maxLength={200}
                value={referenceTitle}
                onChange={(e) => setReferenceTitle(e.target.value)}
              />
            </label>
            <label>
              Source
              <Input
                aria-label="Reference source"
                maxLength={1000}
                value={provenance}
                onChange={(e) => setProvenance(e.target.value)}
              />
            </label>
            <Button
              disabled={busy || !engine.selection.length}
              onClick={() => void pin()}
            >
              Pin selection
            </Button>
            <div className="reference-grid">
              {doc.references.map((reference) => (
                <figure key={reference.id}>
                  <img
                    src={
                      doc.assets.find((a) => a.id === reference.assetId)?.data
                    }
                    alt={reference.title}
                  />
                  <figcaption>
                    <strong>{reference.title}</strong>
                    <p>{reference.provenance}</p>
                  </figcaption>
                  <Button
                    aria-label={`Delete reference ${reference.title}`}
                    onClick={() =>
                      run([{ op: "reference_delete", id: reference.id }])
                    }
                  >
                    Delete
                  </Button>
                </figure>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <div
          role="tabpanel"
          id="resource-panel-pages"
          aria-labelledby="resource-tab-pages"
          className="resource-sections"
        >
          <section>
            <h3>Page order</h3>
            <ol className="resource-records">
              {doc.pages.map((page, index) => (
                <li key={page.id}>
                  <strong>{page.name}</strong>
                  <div className="button-row">
                    <Button
                      disabled={!index}
                      aria-label={`Move ${page.name} earlier`}
                      onClick={() => reorder(page.id, -1)}
                    >
                      Earlier
                    </Button>
                    <Button
                      disabled={index === doc.pages.length - 1}
                      aria-label={`Move ${page.name} later`}
                      onClick={() => reorder(page.id, 1)}
                    >
                      Later
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <section>
            <h3>Move selection</h3>
            <label>
              Destination page
              <NativeSelect
                aria-label="Destination page"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              >
                {doc.pages.map((page) => (
                  <option key={page.id} value={page.id}>
                    {page.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <Button
              disabled={
                !engine.selection.length ||
                !doc.pages.some((p) => p.id === destination)
              }
              onClick={() => {
                const ids = [...engine.selection];
                if (run([{ op: "move_to_page", ids, pageId: destination }]))
                  engine.select(ids, destination);
              }}
            >
              Move to page
            </Button>
          </section>
        </div>
      )}
    </div>
  );
}
