import type { Workspace } from "../storage/workspace";
import { Artifacts } from "../files/artifacts";
import { createTools, type SiteTool } from "./tools";
/** One active page session owns artifacts, WebMCP tools and their retirement. */
export class PageToolRuntime {
  private readonly artifacts = new Artifacts();
  tools: SiteTool[] = [];
  controller = new AbortController();
  private activeId: string | undefined;
  private closed = false;
  private suspended = false;
  private listeners = new Set<() => void>();
  private unsubscribe: () => void;
  constructor(
    private readonly workspace: Workspace,
    private onPicker: () => void,
  ) {
    this.unsubscribe = workspace.subscribe(this.refresh);
    window.addEventListener("pagehide", this.hide);
    window.addEventListener("pageshow", this.show);
    this.refresh();
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private notify() {
    for (const fn of this.listeners) fn();
  }
  private refresh = () => {
    if (this.closed || this.suspended) return;
    const id = `${this.workspace.active ? this.workspace.engine.document.id : ""}:${this.workspace.engine.activationGeneration}`;
    if (id === this.activeId) return;
    this.activeId = id;
    this.controller.abort();
    this.artifacts.clear();
    this.controller = new AbortController();
    this.tools = createTools(
      this.workspace,
      this.artifacts,
      this.controller.signal,
      this.onPicker,
    );
    this.notify();
  };
  private hide = () => {
    this.suspended = true;
    this.controller.abort();
    this.artifacts.clear();
    this.tools = [];
    this.notify();
  };
  private show = () => {
    this.suspended = false;
    this.activeId = undefined;
    this.refresh();
  };
  dispose() {
    this.closed = true;
    this.unsubscribe();
    this.hide();
    this.listeners.clear();
    window.removeEventListener("pagehide", this.hide);
    window.removeEventListener("pageshow", this.show);
  }
}
