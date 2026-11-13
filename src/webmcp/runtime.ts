import type { Workspace } from "../storage/workspace";
import { Artifacts } from "../files/artifacts";
import { createTools, type SiteTool } from "./tools";
import { requireThat } from "../core/model";
/** One active page session owns artifacts, tool implementations and retirement for both transports. */
export class PageToolRuntime {
  readonly artifacts = new Artifacts();
  tools: SiteTool[] = [];
  epoch = crypto.randomUUID();
  controller = new AbortController();
  private activeId: string | undefined;
  private closed = false;
  private suspended = false;
  private listeners = new Set<() => void>();
  private unsubscribe: () => void;
  constructor(
    readonly workspace: Workspace,
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
    this.epoch = crypto.randomUUID();
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
    this.epoch = crypto.randomUUID();
    this.notify();
  };
  private show = () => {
    this.suspended = false;
    this.activeId = undefined;
    this.refresh();
  };
  catalog() {
    return {
      epoch: this.epoch,
      documentId: this.workspace.engine.document.id,
      documentOpen: this.workspace.active,
      tools: this.tools.map(({ execute: _, ...tool }) => {
        void _;
        return tool;
      }),
    };
  }
  async invoke(
    name: string,
    input: unknown,
    epoch: string,
    signal: AbortSignal,
  ) {
    requireThat(
      !this.closed &&
        !this.suspended &&
        !this.controller.signal.aborted &&
        epoch === this.epoch,
      "DISPOSED",
      "The page tool session changed; discover its current catalog.",
    );
    const tool = this.tools.find((tool) => tool.name === name);
    requireThat(tool, "MISSING_TOOL", "Discover the active page tools again.");
    return tool.execute(input, { signal });
  }
  dispose() {
    this.closed = true;
    this.unsubscribe();
    this.hide();
    this.listeners.clear();
    window.removeEventListener("pagehide", this.hide);
    window.removeEventListener("pageshow", this.show);
  }
}
