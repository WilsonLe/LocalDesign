import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  Circle,
  FilePlus2,
  FolderOpen,
  Frame,
  Hand,
  HelpCircle,
  ImagePlus,
  Layers as LayersIcon,
  LoaderCircle,
  Maximize,
  Minus,
  MousePointer2,
  PenLine,
  Plus,
  Redo2,
  Settings2,
  Square,
  Type,
  Undo2,
  X,
  Plug,
  ShieldCheck,
  Copy,
  Scissors,
  ClipboardPaste,
} from "lucide-react";
import { DesignEngine } from "../core/engine";
import { makeNode, roots, uid } from "../core/model";
import type { Command } from "../core/commands";
import { bounds } from "../core/geometry";
import { Workspace } from "../storage/workspace";
import { importFile } from "../files/import";
import { nativeExport } from "../files/native";
import { pngExport, svgExport } from "../files/export";
import { Artifacts } from "../files/artifacts";
import { fontsReady } from "../render/fonts";
import { connectWebMCP } from "../webmcp/register";
import { listSkills, getSkill } from "../skills/catalog";
import { Canvas, type Tool } from "./Canvas";
import { Inspector } from "./Inspector";
import { Layers } from "./Layers";
import { copySelection, pasteSelection } from "./clipboard";
const engine = new DesignEngine(),
  workspace = new Workspace(engine),
  artifacts = new Artifacts();
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => {
      active?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="dialog-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id="dialog-title">{title}</h2>
        <button aria-label="Close dialog" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
const tools = [
  ["select", "Select", "V", MousePointer2],
  ["hand", "Hand", "H", Hand],
  ["frame", "Frame", "F", Frame],
  ["rectangle", "Rectangle", "R", Square],
  ["ellipse", "Ellipse", "O", Circle],
  ["line", "Line", "L", Minus],
  ["path", "Path", "P", PenLine],
  ["text", "Text", "T", Type],
  ["image", "Image", "I", ImagePlus],
] as const;
export function App() {
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot),
    { document: doc, selection, viewport } = snapshot;
  const [tool, setTool] = useState<Tool>("select"),
    [notice, setNotice] = useState(""),
    [storage, setStorage] = useState(workspace.status),
    [ready, setReady] = useState(false),
    [connection, setConnection] = useState<
      "connected" | "unavailable" | "error"
    >("unavailable"),
    [modal, setModal] = useState<
      "workspace" | "export" | "help" | "agent" | null
    >(null),
    [drawer, setDrawer] = useState<"layers" | "inspector" | null>(null),
    [savedDocs, setSavedDocs] = useState<
      Awaited<ReturnType<Workspace["list"]>>
    >([]),
    [busy, setBusy] = useState(false),
    [skill, setSkill] = useState("getting-started");
  const fileInput = useRef<HTMLInputElement>(null),
    imageInput = useRef<HTMLInputElement>(null),
    nameRef = useRef<HTMLInputElement>(null),
    canvasWrap = useRef<HTMLDivElement>(null);
  const report = (e: unknown) =>
    setNotice(e instanceof Error ? e.message : String(e));
  const perform = async (fn: () => unknown | Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      report(e);
    }
  };
  const run = (commands: Command[]) => perform(() => engine.dispatch(commands));
  const fit = (selected = false) => {
    const d = engine.document,
      b = bounds(
        d,
        selected
          ? roots(d, engine.selection)
          : d.nodes.filter(
              (n) => n.pageId === engine.pageId && !n.parentId && !n.hidden,
            ),
      ),
      box = canvasWrap.current!.getBoundingClientRect(),
      zoom = Math.max(
        0.05,
        Math.min(2, (box.width - 120) / b.width, (box.height - 160) / b.height),
      );
    engine.setViewport({
      zoom,
      x: (box.width - b.width * zoom) / 2 - b.x * zoom,
      y: (box.height - b.height * zoom) / 2 - b.y * zoom,
    });
  };
  useEffect(() => {
    let cancelled = false;
    const unsub = workspace.subscribe(() => setStorage(workspace.status));
    Promise.all([workspace.init(), fontsReady()])
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(report);
    const dispose = connectWebMCP(
      workspace,
      () =>
        setNotice(
          "Use Import to choose a file. Your browser may require a click before opening its file picker.",
        ),
      setConnection,
    );
    const before = (e: BeforeUnloadEvent) => {
      if (workspace.status === "error" || workspace.status === "saving") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => {
      cancelled = true;
      unsub();
      dispose();
      window.removeEventListener("beforeunload", before);
    };
  }, []);
  useEffect(() => {
    if (modal === "workspace")
      perform(async () => setSavedDocs(await workspace.list()));
  }, [modal]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 7000);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    const id = doc.id;
    return () => {
      void id;
      artifacts.clear();
    };
  }, [doc.id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        modal ||
        /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName) ||
        (e.target as HTMLElement).isContentEditable
      )
        return;
      const mod = e.metaKey || e.ctrlKey,
        lower = e.key.toLowerCase();
      const action = (fn: () => unknown | Promise<unknown>) => {
        e.preventDefault();
        void perform(fn);
      };
      if (mod && lower === "z")
        action(() =>
          engine.history(e.shiftKey ? "redo" : "undo", engine.guard()),
        );
      else if (mod && lower === "y")
        action(() => engine.history("redo", engine.guard()));
      else if (mod && lower === "a")
        action(() =>
          engine.select(
            doc.nodes
              .filter(
                (n) => n.pageId === engine.pageId && !n.parentId && !n.hidden,
              )
              .map((n) => n.id),
          ),
        );
      else if (mod && lower === "d" && selection.length)
        action(() => {
          const r = engine.dispatch([
            { op: "duplicate", ids: selection, dx: 24, dy: 24 },
          ]);
          engine.select(
            r.createdIds.filter((id) =>
              engine.document.nodes.some(
                (n) => n.id === id && !r.createdIds.includes(n.parentId ?? ""),
              ),
            ),
          );
        });
      else if (mod && lower === "g" && selection.length)
        action(() =>
          engine.dispatch([
            e.shiftKey
              ? { op: "ungroup", ids: selection }
              : { op: "group", ids: selection, id: uid() },
          ]),
        );
      else if (mod && lower === "c" && selection.length)
        action(() => copySelection(engine));
      else if (mod && lower === "x" && selection.length)
        action(async () => {
          const guard = engine.guard(),
            ids = [...engine.selection];
          await copySelection(engine);
          engine.edit({ ...guard, commands: [{ op: "delete", ids }] });
        });
      else if (mod && lower === "v") action(() => pasteSelection(engine));
      else if (mod && lower === "s")
        action(() => {
          setModal("export");
        });
      else if (mod && lower === "o") action(() => fileInput.current?.click());
      else if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selection.length
      )
        action(() => engine.dispatch([{ op: "delete", ids: selection }]));
      else if (e.key === "Escape")
        action(() => {
          engine.select([]);
          setTool("select");
          setDrawer(null);
        });
      else if (e.key.startsWith("Arrow") && selection.length)
        action(() => {
          const amount = e.shiftKey ? 10 : 1;
          return engine.dispatch(
            roots(doc, selection).map((n) => ({
              op: "update",
              ids: [n.id],
              patch: {
                x:
                  n.x +
                  (e.key === "ArrowRight"
                    ? amount
                    : e.key === "ArrowLeft"
                      ? -amount
                      : 0),
                y:
                  n.y +
                  (e.key === "ArrowDown"
                    ? amount
                    : e.key === "ArrowUp"
                      ? -amount
                      : 0),
              },
            })),
          );
        });
      else if (!mod && lower === "1") action(() => fit());
      else if (!mod && lower === "2") action(() => fit(true));
      else if (!mod && lower === "0")
        action(() => engine.setViewport({ zoom: 1 }));
      else if (!mod) {
        const match = tools.find((t) => t[2].toLowerCase() === lower);
        if (match)
          action(() => {
            if (match[0] === "image") imageInput.current?.click();
            else setTool(match[0]);
          });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [doc, selection, modal]);
  const importSelected = async (file: File, asImage = false) => {
    setBusy(true);
    const guard = engine.guard(),
      pageId = engine.pageId;
    try {
      const result = await importFile(file);
      if (asImage) {
        if (result.document.assets.length !== 1)
          throw new Error("Choose a PNG, JPEG or WebP image.");
        const asset = result.document.assets[0],
          node = makeNode("image", pageId, {
            assetId: asset.id,
            name: asset.name,
            width: Math.min(asset.width, 600),
            height: asset.height * Math.min(1, 600 / asset.width),
            x: (150 - engine.viewport.x) / engine.viewport.zoom,
            y: (150 - engine.viewport.y) / engine.viewport.zoom,
          });
        engine.edit({
          ...guard,
          commands: [
            { op: "asset_add", asset },
            { op: "create", node },
          ],
        });
        engine.select([node.id]);
        setTool("select");
      } else {
        if (
          engine.document.id !== guard.expectedDocumentId ||
          engine.document.revision !== guard.expectedRevision
        )
          throw new Error(
            "Your design changed while importing. Import again to open this file.",
          );
        await workspace.import(result.document);
        setTimeout(() => fit(), 0);
      }
      setNotice(
        result.warnings.length
          ? result.warnings.join(" ")
          : asImage
            ? "Image added to the canvas."
            : "Imported as a separate local document. Your previous design remains in the workspace.",
      );
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  };
  const exportFile = async (
    format: "native" | "svg" | "png",
    selected = false,
  ) => {
    setBusy(true);
    try {
      const d = engine.document,
        id = d.id,
        blob =
          format === "native"
            ? await nativeExport(d)
            : format === "svg"
              ? await svgExport(
                  d,
                  engine.pageId,
                  selected ? engine.selection : undefined,
                )
              : await pngExport(
                  d,
                  engine.pageId,
                  selected ? engine.selection : undefined,
                );
      if (id !== engine.document.id)
        throw new Error("Document changed during export. Export again.");
      const a = artifacts.add(
        blob,
        `${d.name.replace(/[^\w -]/g, "_")}.${format === "native" ? "localdesign" : format}`,
        d.revision,
      );
      artifacts.download(a.id);
      setNotice(`Exported ${a.name}.`);
      setModal(null);
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  };
  const zoom = (factor: number) => {
    const v = engine.viewport,
      box = canvasWrap.current!.getBoundingClientRect(),
      next = Math.max(0.05, Math.min(8, v.zoom * factor));
    engine.setViewport({
      zoom: next,
      x: box.width / 2 - ((box.width / 2 - v.x) * next) / v.zoom,
      y: box.height / 2 - ((box.height / 2 - v.y) * next) / v.zoom,
    });
  };
  return (
    <div className="app">
      <header className="topbar">
        <button
          className="brand"
          title="Local workspace"
          onClick={() => setModal("workspace")}
        >
          <span className="brand-mark">
            <i />
            <i />
            <i />
          </span>
          <span>LocalDesign</span>
        </button>
        <span className="top-divider" />
        <div className="document-title">
          <input
            ref={nameRef}
            aria-label="Design name"
            disabled={!ready}
            key={`${doc.id}-${doc.name}`}
            defaultValue={doc.name}
            maxLength={200}
            onBlur={(e) => {
              if (e.target.value !== doc.name)
                void run([
                  {
                    op: "rename",
                    name: e.target.value.trim() || "Untitled design",
                  },
                ]);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
          <button
            aria-label="Open workspace"
            onClick={() => setModal("workspace")}
          >
            <ChevronDown size={13} />
          </button>
        </div>
        <span
          className={`save-state ${storage === "error" ? "failed" : ""}`}
          aria-live="polite"
        >
          {storage === "saved" ? (
            <Check size={12} />
          ) : storage === "saving" || storage === "loading" ? (
            <LoaderCircle size={12} />
          ) : (
            <span>!</span>
          )}
          <span>
            {storage === "saved"
              ? "Saved locally"
              : storage === "saving"
                ? "Saving…"
                : storage === "error"
                  ? "Save failed"
                  : "Opening…"}
          </span>
        </span>
        <div className="top-spacer" />
        <div className="history-actions">
          <button
            aria-label="Undo"
            title="Undo (⌘/Ctrl Z)"
            disabled={!snapshot.canUndo}
            onClick={() =>
              perform(() => engine.history("undo", engine.guard()))
            }
          >
            <Undo2 size={16} />
          </button>
          <button
            aria-label="Redo"
            title="Redo (⌘/Ctrl Shift Z)"
            disabled={!snapshot.canRedo}
            onClick={() =>
              perform(() => engine.history("redo", engine.guard()))
            }
          >
            <Redo2 size={16} />
          </button>
        </div>
        <span className="top-divider" />
        <button
          className={`agent-button ${connection === "connected" ? "connected" : ""}`}
          title="Connect an agent"
          aria-label="Connect an agent"
          onClick={() => setModal("agent")}
        >
          <Plug size={14} />
          <span>
            {connection === "connected" ? "Agent ready" : "Connect agent"}
          </span>
        </button>
        <button
          className="import-button"
          onClick={() => fileInput.current?.click()}
          disabled={busy || !ready}
        >
          <ArrowUpFromLine size={14} />
          <span>Import</span>
        </button>
        <button
          className="primary export-button"
          onClick={() => setModal("export")}
          disabled={busy || !ready}
        >
          <ArrowDownToLine size={14} />
          <span>Export</span>
        </button>
      </header>
      {storage === "error" && (
        <div className="storage-error" role="alert">
          <strong>Local save failed.</strong> {workspace.error} Export a
          .localdesign backup before leaving this page.{" "}
          <button onClick={() => perform(() => workspace.retry())}>
            Retry save
          </button>
          <button onClick={() => setModal("export")}>Export backup</button>
          <button onClick={() => perform(() => workspace.saveCopy())}>
            Save a copy
          </button>
        </div>
      )}
      <div className="mobile-controls">
        <button
          aria-expanded={drawer === "layers"}
          onClick={() => setDrawer(drawer === "layers" ? null : "layers")}
        >
          <LayersIcon size={15} />
          Pages & layers
        </button>
        <button
          aria-expanded={drawer === "inspector"}
          onClick={() => setDrawer(drawer === "inspector" ? null : "inspector")}
        >
          <Settings2 size={15} />
          Properties
        </button>
      </div>
      <main className="editor-body">
        <aside
          className={`left-panel ${drawer === "layers" ? "drawer-open" : ""}`}
          aria-label="Pages and layers"
        >
          <button
            className="drawer-close"
            aria-label="Close layers"
            onClick={() => setDrawer(null)}
          >
            <X size={18} />
          </button>
          <Layers engine={engine} snapshot={snapshot} onError={setNotice} />
        </aside>
        <div ref={canvasWrap} className="canvas-area">
          {ready ? (
            <Canvas
              engine={engine}
              snapshot={snapshot}
              tool={tool}
              setTool={setTool}
              onError={setNotice}
              onImage={() => imageInput.current?.click()}
            />
          ) : (
            <div className="opening">Opening your local workspace…</div>
          )}
          <div className="canvas-top-label">
            <span>{doc.pages.find((p) => p.id === engine.pageId)?.name}</span>
            <span className="canvas-mode">Design canvas</span>
          </div>
          <div
            className="floating-tools"
            role="toolbar"
            aria-label="Drawing tools"
          >
            {tools.map(([id, title, key, Icon], i) => (
              <button
                key={id}
                className={`${tool === id ? "active" : ""} ${i === 2 || i === 7 ? "tool-separated" : ""}`}
                aria-label={title}
                aria-pressed={tool === id}
                title={`${title} (${key})`}
                onClick={() =>
                  id === "image" ? imageInput.current?.click() : setTool(id)
                }
                disabled={!ready}
              >
                <Icon size={18} />
                {tool === id && <span className="tool-key">{key}</span>}
              </button>
            ))}
          </div>
          <div className="zoom-controls">
            <button aria-label="Zoom out" onClick={() => zoom(0.8)}>
              <Minus size={14} />
            </button>
            <button
              aria-label="Reset zoom"
              onClick={() => engine.setViewport({ zoom: 1 })}
            >
              {Math.round(viewport.zoom * 100)}%
            </button>
            <button aria-label="Zoom in" onClick={() => zoom(1.25)}>
              <Plus size={14} />
            </button>
            <span />
            <button
              aria-label="Fit canvas"
              title="Fit canvas (1)"
              onClick={() => fit()}
            >
              <Maximize size={14} />
            </button>
          </div>
          <button
            className="help-button"
            aria-label="Help and shortcuts"
            onClick={() => setModal("help")}
          >
            <HelpCircle size={17} />
          </button>
        </div>
        <aside
          className={`right-panel ${drawer === "inspector" ? "drawer-open" : ""}`}
          aria-label="Properties"
        >
          <button
            className="drawer-close"
            aria-label="Close properties"
            onClick={() => setDrawer(null)}
          >
            <X size={18} />
          </button>
          <Inspector engine={engine} snapshot={snapshot} onError={setNotice} />
        </aside>
      </main>
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button aria-label="Dismiss message" onClick={() => setNotice("")}>
            <X size={15} />
          </button>
        </div>
      )}
      <input
        type="file"
        ref={fileInput}
        className="file-input"
        aria-label="Import design file"
        accept=".localdesign,.svg,.png,.jpg,.jpeg,.webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importSelected(f);
          e.target.value = "";
        }}
      />
      <input
        type="file"
        ref={imageInput}
        className="file-input"
        aria-label="Add image file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importSelected(f, true);
          e.target.value = "";
        }}
      />
      {modal === "workspace" && (
        <Modal title="Your local workspace" onClose={() => setModal(null)}>
          <p className="modal-intro">
            Stored in this browser. Export a portable file to keep a backup or
            move between devices.
          </p>
          <button
            className="primary wide"
            disabled={!ready}
            onClick={() =>
              perform(async () => {
                await workspace.create();
                setModal(null);
              })
            }
          >
            <FilePlus2 size={16} />
            New blank design
          </button>
          <div className="workspace-list">
            {savedDocs.map((d) => (
              <div className="workspace-item" key={d.id}>
                <button
                  onClick={() =>
                    perform(async () => {
                      await workspace.open(d.id);
                      setModal(null);
                    })
                  }
                >
                  <FolderOpen size={18} />
                  <div>
                    <strong>{d.name}</strong>
                    <span>
                      {d.pages} {d.pages === 1 ? "page" : "pages"} · {d.nodes}{" "}
                      layers
                    </span>
                  </div>
                  {d.id === doc.id && (
                    <span className="current-label">Current</span>
                  )}
                </button>
                {d.id !== doc.id && (
                  <button
                    aria-label={`Delete ${d.name}`}
                    title="Permanently delete saved copy"
                    onClick={() =>
                      perform(async () => {
                        if (
                          confirm(
                            `Delete “${d.name}” from this browser? Exported files are unaffected.`,
                          )
                        ) {
                          await workspace.remove(d.id);
                          setSavedDocs(await workspace.list());
                        }
                      })
                    }
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </Modal>
      )}
      {modal === "export" && (
        <Modal title="Take your design with you" onClose={() => setModal(null)}>
          <p className="modal-intro">
            Native files keep your pages, editable layers, embedded images and
            bundled fonts together.
          </p>
          <button
            className="export-option"
            disabled={busy}
            onClick={() => exportFile("native")}
          >
            <div className="file-type">LD</div>
            <div>
              <strong>LocalDesign file</strong>
              <span>All pages · editable · .localdesign</span>
            </div>
            <ArrowDownToLine size={16} />
          </button>
          <div className="export-scope">
            <span>
              {selection.length
                ? `${selection.length} layers selected`
                : "Current page"}
            </span>
            <span>Image exports</span>
          </div>
          <div className="button-row">
            <button
              className="export-format"
              disabled={busy}
              onClick={() => exportFile("svg", selection.length > 0)}
            >
              <strong>SVG</strong>
              <span>Scalable vector</span>
            </button>
            <button
              className="export-format"
              disabled={busy}
              onClick={() => exportFile("png", selection.length > 0)}
            >
              <strong>PNG</strong>
              <span>Ready to share</span>
            </button>
          </div>
          <p className="muted">
            Image exports use the selected layers, or the whole current page
            when nothing is selected. Designs are never uploaded by LocalDesign.
          </p>
        </Modal>
      )}
      {modal === "agent" && (
        <Modal
          title="A canvas your agent can use"
          onClose={() => setModal(null)}
        >
          <div
            className={`connection-state ${connection === "connected" ? "ready" : ""}`}
          >
            <Plug size={20} />
            <div>
              <strong>
                {connection === "connected"
                  ? "WebMCP tools are registered"
                  : connection === "error"
                    ? "Tool registration failed"
                    : "WebMCP is unavailable in this browser"}
              </strong>
              <span>
                {connection === "connected"
                  ? "Your agent can discover tools on this page."
                  : "Open this app in a browser host that exposes document.modelContext.registerTool."}
              </span>
            </div>
          </div>
          <ol className="agent-steps">
            <li>Open this page in your agent’s WebMCP-capable browser.</li>
            <li>
              Ask it to discover this page’s tools and call{" "}
              <code>localdesign_list_skills</code>.
            </li>
            <li>
              Read <code>getting-started</code> with{" "}
              <code>localdesign_get_skill</code>, then describe your design.
            </li>
          </ol>
          <p className="modal-intro">
            The agent uses the same document and undo history as you. No server,
            account, API key or built-in chat is needed.
          </p>
          <p className="muted">
            LocalDesign does not upload designs. Content deliberately read by an
            external agent is handled by that agent/provider. Registering tools
            alone does not prove a particular host can discover them.
          </p>
          <a
            href={`${import.meta.env.BASE_URL}skills/getting-started.md`}
            target="_blank"
            rel="noreferrer"
          >
            Read the complete connection and editing guide ↗
          </a>
        </Modal>
      )}
      {modal === "help" && (
        <Modal
          title="A small guide to your canvas"
          onClose={() => setModal(null)}
        >
          <div className="shortcut-grid">
            {[
              ["Select / hand", "V / H"],
              ["Frame / rectangle / ellipse", "F / R / O"],
              ["Line / path / text", "L / P / T"],
              ["Move selection", "Arrow keys"],
              ["Move 10 pixels", "Shift + arrows"],
              ["Undo / redo", "⌘/Ctrl Z / Shift Z"],
              ["Duplicate / group", "⌘/Ctrl D / G"],
              ["Fit page / selection", "1 / 2"],
              ["Pan / zoom", "Space + drag / ⌘ scroll"],
            ].map(([label, key]) => (
              <div key={label}>
                <span>{label}</span>
                <kbd>{key}</kbd>
              </div>
            ))}
          </div>
          <div className="button-row">
            <button onClick={() => perform(() => copySelection(engine))}>
              <Copy size={14} />
              Copy
            </button>
            <button
              onClick={() =>
                perform(async () => {
                  const guard = engine.guard(),
                    ids = [...engine.selection];
                  await copySelection(engine);
                  engine.edit({ ...guard, commands: [{ op: "delete", ids }] });
                })
              }
            >
              <Scissors size={14} />
              Cut
            </button>
            <button onClick={() => perform(() => pasteSelection(engine))}>
              <ClipboardPaste size={14} />
              Paste
            </button>
          </div>
          <p className="muted">
            Shapes snap to a 4 px grid while dragging. Hold Alt for free
            movement. Rotate with the round handle; hold Shift for 15° steps.
            Use the inspector for precise keyboard editing. Native file export
            is your portable backup.
          </p>
          <div className="skill-browser">
            <label>
              Bundled design guides
              <select value={skill} onChange={(e) => setSkill(e.target.value)}>
                {listSkills().map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <pre>{getSkill(skill).instructions}</pre>
          </div>
          <p className="privacy">
            <ShieldCheck size={14} />
            No design uploads. No account. MIT licensed.
          </p>
        </Modal>
      )}
    </div>
  );
}
