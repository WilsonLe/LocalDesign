import { BrandMark } from "../components/BrandMark";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { ThemeToggle, applyTheme, readTheme } from "./ThemeToggle";
import { surfaceTextFill } from "./surface";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { NativeSelect } from "../components/ui/native-select";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type CSSProperties,
} from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  Circle,
  FilePlus2,
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
  Copy,
  Scissors,
  ClipboardPaste,
  Play,
} from "lucide-react";
import { DesignEngine } from "../core/engine";
import { makeNode, roots, uid, type DesignNode } from "../core/model";
import type { Command } from "../core/commands";
import { bounds } from "../core/geometry";
import { Workspace } from "../storage/workspace";
import { importFile } from "../files/import";
import { nativeExport } from "../files/native";
import { rasterExport, svgExport } from "../files/export";
import { Artifacts } from "../files/artifacts";
import { fontsReady } from "../render/fonts";
import { connectWebMCP } from "../webmcp/register";
import { PageToolRuntime } from "../webmcp/runtime";
import { LoopbackConnection } from "../webmcp/loopback";
import { LocalMCPConnection } from "./LocalMCPConnection";
import { listSkills, getSkill } from "../skills/catalog";
import { Canvas, type Tool } from "./Canvas";
import { Inspector } from "./Inspector";
import { Layers } from "./Layers";
import { copySelection, pasteSelection } from "./clipboard";
import { blocksCanvasShortcuts } from "./shortcuts";
import { WorkspaceList } from "./WorkspaceList";
import { DesignResources } from "./DesignResources";
import { ExportPanel, type ExportRequest } from "./ExportPanel";
import { PrototypePlayer } from "./Prototype";
import {
  WorkspaceNavigation,
  readWorkspaceRoute,
  type NavigationState,
} from "./workspaceRoute";
const engine = new DesignEngine(),
  workspace = new Workspace(engine, () => {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement) focused.blur();
  }),
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
  const [returnFocus] = useState(
    () => document.activeElement as HTMLElement | null,
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        finalFocus={() => returnFocus}
      >
        <DialogHeader>
          <DialogTitle id="dialog-title">{title}</DialogTitle>
          <Button size="icon-sm" aria-label="Close dialog" onClick={onClose}>
            <X size={18} />
          </Button>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
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
function HistoryActions({
  canUndo,
  canRedo,
  onAction,
  compact = false,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onAction: (action: "undo" | "redo") => void;
  compact?: boolean;
}) {
  return (
    <div className="history-actions">
      <Button
        size={compact ? "icon-xs" : "icon-sm"}
        aria-label="Undo"
        title="Undo (⌘/Ctrl Z)"
        disabled={!canUndo}
        onClick={() => onAction("undo")}
      >
        <Undo2 />
      </Button>
      <Button
        size={compact ? "icon-xs" : "icon-sm"}
        aria-label="Redo"
        title="Redo (⌘/Ctrl Shift Z)"
        disabled={!canRedo}
        onClick={() => onAction("redo")}
      >
        <Redo2 />
      </Button>
    </div>
  );
}
export function App() {
  const [theme, setTheme] = useState(readTheme);
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot),
    { document: doc, selection, viewport } = snapshot;
  const [loopback, setLoopback] = useState<LoopbackConnection | null>(null);
  const [localConnected, setLocalConnected] = useState(false);
  const [tool, setTool] = useState<Tool>("select"),
    [notice, setNotice] = useState(""),
    [storage, setStorage] = useState(workspace.status),
    [ready, setReady] = useState(false),
    [connection, setConnection] = useState<
      "connected" | "unavailable" | "error"
    >("unavailable"),
    [modal, setModal] = useState<
      "export" | "help" | "agent" | "resources" | null
    >(null),
    [drawer, setDrawer] = useState<"layers" | "inspector" | null>(null),
    [navigation, setNavigation] = useState<NavigationState>({
      route: readWorkspaceRoute(location.pathname),
      loading: true,
      error: "",
    }),
    [busy, setBusy] = useState(false),
    [skill, setSkill] = useState("getting-started");
  const fileInput = useRef<HTMLInputElement>(null),
    imageInput = useRef<HTMLInputElement>(null),
    nameRef = useRef<HTMLInputElement>(null),
    canvasWrap = useRef<HTMLDivElement>(null),
    [navigator] = useState(
      () => new WorkspaceNavigation(workspace, setNavigation),
    );
  const editing = workspace.active && navigation.route.kind === "workspace";
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
  const frameNodes = useCallback((nodes: DesignNode[], maxZoom: number) => {
    const area = canvasWrap.current;
    if (!area) return;
    const box = area.getBoundingClientRect();
    // Reserve the actual floating controls' bands, including responsive offsets.
    let top = 24,
      bottom = box.height - 24;
    for (const overlay of area.querySelectorAll<HTMLElement>(
      ".canvas-top-label, .floating-tools, .zoom-controls, .help-button",
    )) {
      const r = overlay.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (overlay.classList.contains("canvas-top-label"))
        top = Math.max(top, r.bottom - box.top + 16);
      else bottom = Math.min(bottom, r.top - box.top - 16);
    }
    const b = bounds(engine.document, nodes),
      width = Math.max(1, box.width - 48),
      height = Math.max(1, bottom - top),
      zoom = Math.max(
        0.05,
        Math.min(maxZoom, width / b.width, height / b.height),
      );
    engine.setViewport({
      zoom,
      x: box.width / 2 - (b.x + b.width / 2) * zoom,
      y: top + height / 2 - (b.y + b.height / 2) * zoom,
    });
  }, []);
  const fit = (selected = false) => {
    const d = engine.document;
    frameNodes(
      selected
        ? roots(d, engine.selection)
        : d.nodes.filter(
            (n) => n.pageId === engine.pageId && !n.parentId && !n.hidden,
          ),
      2,
    );
  };
  const focusLayer = useCallback(
    (id: string) => {
      const node = engine.document.nodes.find((n) => n.id === id);
      if (!node) return;
      // Hidden layers remain hidden, but their geometry can still be located.
      frameNodes([{ ...node, hidden: false }], engine.viewport.zoom);
      if (drawer === "layers") {
        setDrawer(null);
        canvasWrap.current?.querySelector<SVGSVGElement>(".canvas")?.focus();
      }
    },
    [drawer, frameNodes],
  );
  useEffect(() => {
    let cancelled = false;
    const unsub = workspace.subscribe(() => setStorage(workspace.status));
    let stopNavigation: (() => void) | undefined;
    void navigator.start().then((stop) => {
      if (cancelled) stop();
      else stopNavigation = stop;
    });
    fontsReady()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(report);
    const runtime = new PageToolRuntime(workspace, () =>
      setNotice(
        "Use Import to choose a file. Your browser may require a click before opening its file picker.",
      ),
    );
    const localConnection = new LoopbackConnection(runtime);
    setLoopback(localConnection);
    const stopLocalStatus = localConnection.subscribe(() =>
      setLocalConnected(localConnection.getSnapshot().status === "connected"),
    );
    const dispose = connectWebMCP(runtime, setConnection);
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
      stopNavigation?.();
      dispose();
      stopLocalStatus();
      localConnection.dispose();
      runtime.dispose();
      window.removeEventListener("beforeunload", before);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 7000);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    const id = doc.id;
    setModal((current) =>
      current === "export" || current === "resources" ? null : current,
    );
    setDrawer(null);
    return () => {
      void id;
      artifacts.clear();
    };
  }, [doc.id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        !editing ||
        navigation.loading ||
        modal ||
        snapshot.player.open ||
        blocksCanvasShortcuts(e.target)
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
  }, [
    doc,
    selection,
    modal,
    editing,
    navigation.loading,
    snapshot.player.open,
  ]);
  const importSelected = async (file: File, asImage = false) => {
    setBusy(true);
    workspace.commitPendingEdits();
    const guard = engine.guard(),
      pageId = engine.pageId;
    try {
      const result = await importFile(file);
      workspace.commitPendingEdits();
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
  const exportFile = async ({
    format,
    ids,
    options,
    frameIds,
  }: ExportRequest) => {
    setBusy(true);
    try {
      if (!workspace.active)
        throw new Error("Open a workspace before exporting.");
      const d = engine.document,
        id = d.id;
      const pdf =
        format === "pdf"
          ? await (
              await import("../files/pdf")
            ).pdfExport(d, engine.pageId, ids, options, frameIds)
          : null;
      const blob =
        format === "native"
          ? await nativeExport(d)
          : format === "svg"
            ? await svgExport(d, engine.pageId, ids, options)
            : format === "pdf"
              ? pdf!.blob
              : await rasterExport(
                  d,
                  engine.pageId,
                  format === "jpeg" ? "jpeg" : "png",
                  ids,
                  options,
                );
      if (id !== engine.document.id)
        throw new Error("Document changed during export. Export again.");
      const a = artifacts.add(
        blob,
        `${d.name.replace(/[^\w -]/g, "_")}.${format === "native" ? "localdesign" : format === "jpeg" ? "jpg" : format}`,
        d.revision,
      );
      artifacts.download(a.id);
      setNotice(
        `Exported ${a.name}.${pdf?.warnings.length ? ` ${pdf.warnings.join(" ")}` : ""}`,
      );
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
      <header className={`topbar ${editing ? "" : "workspace-topbar"}`}>
        <Button
          className="brand max-[850px]:px-0"
          title="Workspaces"
          aria-label="Workspaces"
          onClick={() => void navigator.navigate({ kind: "list" })}
        >
          <BrandMark />
          <span>LocalDesign</span>
        </Button>
        {editing && (
          <>
            <span className="top-divider" />
            <div className="document-title">
              <Input
                className="w-40 max-[1150px]:w-36 max-[850px]:w-full"
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
              <Button
                className="max-[850px]:hidden"
                size="icon-sm"
                aria-label="Open workspace"
                onClick={() => void navigator.navigate({ kind: "list" })}
              >
                <ChevronDown size={13} />
              </Button>
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
            <HistoryActions
              canUndo={snapshot.canUndo}
              canRedo={snapshot.canRedo}
              onAction={(action) =>
                perform(() => engine.history(action, engine.guard()))
              }
            />
            <span className="top-divider" />
          </>
        )}
        {!editing && <div className="top-spacer" />}
        {editing && (
          <>
            <Button
              size="icon-sm"
              aria-label="Design resources"
              title="Design resources"
              onClick={() => setModal("resources")}
            >
              <LayersIcon size={16} />
            </Button>
            <Button
              size="icon-sm"
              className="max-[851px]:hidden"
              aria-label="Play prototype"
              title="Play prototype"
              disabled={!doc.prototype.entryFrameId}
              onClick={() =>
                void perform(() =>
                  engine.playPrototype(doc.id, { action: "start" }),
                )
              }
            >
              <Play size={15} />
            </Button>
          </>
        )}
        <ThemeToggle
          theme={theme}
          onChange={(next) => {
            applyTheme(next);
            setTheme(next);
          }}
        />
        <Button
          size="icon-sm"
          className={`agent-button ${connection === "connected" || localConnected ? "connected" : ""}`}
          title={
            connection === "connected" || localConnected
              ? "Agent ready"
              : "Connect an agent"
          }
          aria-label="Connect an agent"
          onClick={() => setModal("agent")}
        >
          <Plug size={14} />
        </Button>
        <Button
          className="import-button max-[850px]:size-8 max-[850px]:p-0"
          aria-label="Import"
          onClick={() => fileInput.current?.click()}
          disabled={busy || navigation.loading || !workspace.initialized}
        >
          <ArrowUpFromLine size={14} />
          <span className="max-[850px]:hidden">Import</span>
        </Button>
        {editing ? (
          <Button
            variant="default"
            size="default"
            className="export-button max-[850px]:size-8 max-[850px]:p-0"
            aria-label="Export"
            onClick={() => setModal("export")}
            disabled={busy || !ready}
          >
            <ArrowDownToLine size={14} />
            <span className="max-[850px]:hidden">Export</span>
          </Button>
        ) : (
          <Button
            variant="default"
            size="default"
            className="new-workspace-button"
            disabled={busy || navigation.loading || !workspace.initialized}
            onClick={() => perform(() => workspace.create())}
          >
            <FilePlus2 size={16} />
            New blank design
          </Button>
        )}
      </header>
      {storage === "error" && editing && (
        <div className="storage-error" role="alert">
          <strong>Local save failed.</strong> {workspace.error} Export a
          .localdesign backup before leaving this page.{" "}
          <Button onClick={() => perform(() => workspace.retry())}>
            Retry save
          </Button>
          <Button onClick={() => setModal("export")}>Export backup</Button>
          <Button onClick={() => perform(() => workspace.saveCopy())}>
            Save a copy
          </Button>
        </div>
      )}
      {navigation.error && editing && (
        <div className="storage-error" role="alert">
          {navigation.error}
        </div>
      )}
      {editing ? (
        <>
          <div className="mobile-controls">
            <Button
              size="xs"
              aria-expanded={drawer === "layers"}
              onClick={() => setDrawer(drawer === "layers" ? null : "layers")}
            >
              <LayersIcon size={15} />
              Pages & layers
            </Button>
            <HistoryActions
              compact
              canUndo={snapshot.canUndo}
              canRedo={snapshot.canRedo}
              onAction={(action) =>
                perform(() => engine.history(action, engine.guard()))
              }
            />
            <Button
              size="xs"
              aria-expanded={drawer === "inspector"}
              onClick={() =>
                setDrawer(drawer === "inspector" ? null : "inspector")
              }
            >
              <Settings2 size={15} />
              Properties
            </Button>
          </div>
          <main className="editor-body">
            <aside
              className={`left-panel ${drawer === "layers" ? "drawer-open" : ""}`}
              aria-label="Pages and layers"
            >
              <Button
                className="drawer-close min-[851px]:hidden"
                aria-label="Close layers"
                onClick={() => setDrawer(null)}
              >
                <X size={18} />
              </Button>
              <Layers
                engine={engine}
                document={doc}
                pageId={snapshot.pageId}
                selection={selection}
                onError={setNotice}
                onFocusLayer={focusLayer}
              />
            </aside>
            <div
              ref={canvasWrap}
              className="canvas-area"
              style={
                {
                  "--canvas-foreground": surfaceTextFill(
                    [
                      doc.pages.find((p) => p.id === snapshot.pageId)!
                        .background,
                    ],
                    theme === "dark",
                  ),
                } as CSSProperties
              }
            >
              {ready && !navigation.loading ? (
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
                <span>
                  {doc.pages.find((p) => p.id === engine.pageId)?.name}
                </span>
              </div>
              <div
                className="floating-tools"
                role="toolbar"
                aria-label="Drawing tools"
              >
                {tools.map(([id, title, key, Icon], i) => (
                  <Button
                    key={id}
                    size="icon-sm"
                    variant={tool === id ? "default" : "ghost"}
                    className={`max-[570px]:size-7 ${tool === id ? "active" : ""} ${i === 2 || i === 7 ? "tool-separated" : ""}`}
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
                  </Button>
                ))}
              </div>
              <div className="zoom-controls">
                <Button
                  size="icon-xs"
                  aria-label="Zoom out"
                  onClick={() => zoom(0.8)}
                >
                  <Minus size={14} />
                </Button>
                <Button
                  size="xs"
                  aria-label="Reset zoom"
                  onClick={() => engine.setViewport({ zoom: 1 })}
                >
                  {Math.round(viewport.zoom * 100)}%
                </Button>
                <Button
                  size="icon-xs"
                  aria-label="Zoom in"
                  onClick={() => zoom(1.25)}
                >
                  <Plus size={14} />
                </Button>
                <span />
                <Button
                  size="icon-xs"
                  aria-label="Fit canvas"
                  title="Fit canvas (1)"
                  onClick={() => fit()}
                >
                  <Maximize size={14} />
                </Button>
              </div>
              <Button
                size="icon-sm"
                variant="outline"
                className="help-button"
                aria-label="Help and shortcuts"
                onClick={() => setModal("help")}
              >
                <HelpCircle size={17} />
              </Button>
            </div>
            <aside
              className={`right-panel ${drawer === "inspector" ? "drawer-open" : ""}`}
              aria-label="Properties"
            >
              <Button
                className="drawer-close min-[851px]:hidden"
                aria-label="Close properties"
                onClick={() => setDrawer(null)}
              >
                <X size={18} />
              </Button>
              <Inspector
                theme={theme}
                ready={ready}
                engine={engine}
                document={doc}
                pageId={snapshot.pageId}
                selection={selection}
                onError={setNotice}
              />
            </aside>
          </main>
        </>
      ) : (
        <WorkspaceList
          workspace={workspace}
          loading={navigation.loading}
          error={navigation.error}
          onOpen={(id) => void navigator.navigate({ kind: "workspace", id })}
          onRetry={() =>
            void navigator.navigate(
              readWorkspaceRoute(location.pathname),
              false,
            )
          }
          onList={() => void navigator.navigate({ kind: "list" })}
        />
      )}
      {editing && snapshot.activity && (
        <div className="agent-activity" role="status">
          <span>
            {snapshot.activity.actor}: {snapshot.activity.message}
          </span>
          <Button
            aria-label="Clear agent status"
            onClick={() => engine.setActivity(doc.id, "You", "", 1000)}
          >
            <X size={14} />
          </Button>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <Button aria-label="Dismiss message" onClick={() => setNotice("")}>
            <X size={15} />
          </Button>
        </div>
      )}
      <Input
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
      <Input
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
      {editing && modal === "export" && (
        <Modal title="Take your design with you" onClose={() => setModal(null)}>
          <ExportPanel
            document={doc}
            pageId={snapshot.pageId}
            selection={selection}
            busy={busy}
            onExport={(request) => void exportFile(request)}
          />
        </Modal>
      )}
      {editing && modal === "resources" && (
        <Modal title="Design resources" onClose={() => setModal(null)}>
          <DesignResources
            engine={engine}
            document={doc}
            onError={setNotice}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}
      {editing && snapshot.player.open && (
        <Modal
          title="Prototype player"
          onClose={() => engine.playPrototype(doc.id, { action: "stop" })}
        >
          <PrototypePlayer
            engine={engine}
            snapshot={snapshot}
            onError={setNotice}
          />
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
            </div>
          </div>
          {loopback && <LocalMCPConnection connection={loopback} />}
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
            <Button onClick={() => perform(() => copySelection(engine))}>
              <Copy size={14} />
              Copy
            </Button>
            <Button
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
            </Button>
            <Button onClick={() => perform(() => pasteSelection(engine))}>
              <ClipboardPaste size={14} />
              Paste
            </Button>
          </div>
          <div className="skill-browser">
            <label>
              Bundled design guides
              <NativeSelect
                value={skill}
                onChange={(e) => setSkill(e.target.value)}
              >
                {listSkills().map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <pre>{getSkill(skill).instructions}</pre>
          </div>
        </Modal>
      )}
    </div>
  );
}
