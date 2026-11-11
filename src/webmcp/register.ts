import type { Workspace } from "../storage/workspace";
import { Artifacts } from "../files/artifacts";
import { createTools, type SiteTool } from "./tools";
export type ModelContext = {
  registerTool: (
    tool: SiteTool,
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
export function connectWebMCP(
  workspace: Workspace,
  onPicker: () => void,
  onStatus: (state: "connected" | "unavailable" | "error") => void,
) {
  const context = (document as Document & { modelContext?: ModelContext })
    .modelContext;
  const artifacts = new Artifacts();
  if (!context?.registerTool) {
    onStatus("unavailable");
    return () => artifacts.clear();
  }
  let registration: AbortController | undefined;
  let activeId = "";
  let sequence = Promise.resolve();
  let closed = false;
  let suspended = false;
  const refresh = () => {
    if (suspended) return;
    const id = workspace.engine.document.id;
    if (id === activeId) return;
    activeId = id;
    registration?.abort();
    artifacts.clear();
    const controller = new AbortController();
    registration = controller;
    sequence = sequence.then(async () => {
      if (closed || controller.signal.aborted) return;
      try {
        for (const tool of createTools(
          workspace,
          artifacts,
          controller.signal,
          onPicker,
        )) {
          if (controller.signal.aborted) return;
          await context.registerTool(tool, { signal: controller.signal });
        }
        onStatus("connected");
      } catch {
        controller.abort();
        if (!closed) onStatus("error");
      }
    });
  };
  refresh();
  const unsubscribe = workspace.engine.subscribe(refresh);
  const hide = () => {
    suspended = true;
    registration?.abort();
    artifacts.clear();
  };
  const show = () => {
    suspended = false;
    activeId = "";
    refresh();
  };
  window.addEventListener("pagehide", hide);
  window.addEventListener("pageshow", show);
  return () => {
    closed = true;
    unsubscribe();
    hide();
    window.removeEventListener("pagehide", hide);
    window.removeEventListener("pageshow", show);
  };
}
