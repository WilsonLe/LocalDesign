import { Id } from "../core/model";
import type { Workspace } from "../storage/workspace";

export type WorkspaceRoute =
  { kind: "list" } | { kind: "workspace"; id: string } | { kind: "missing" };

export function readWorkspaceRoute(
  pathname: string,
  base = import.meta.env.BASE_URL,
): WorkspaceRoute {
  if (pathname === base || pathname === base.slice(0, -1))
    return { kind: "list" };
  const match = pathname.startsWith(base)
    ? /^workspace\/([^/]+)\/?$/.exec(pathname.slice(base.length))
    : null;
  try {
    const id = match && decodeURIComponent(match[1]);
    if (Id.safeParse(id).success) return { kind: "workspace", id: id! };
  } catch {
    // Malformed percent escapes are an unknown route, never another document.
  }
  return { kind: "missing" };
}
export const workspacePath = (id?: string, base = import.meta.env.BASE_URL) =>
  id ? `${base}workspace/${encodeURIComponent(id)}` : base;

export type NavigationState = {
  route: WorkspaceRoute;
  loading: boolean;
  error: string;
};

/** URL changes and document switches share the workspace's save/abort boundary. */
export class WorkspaceNavigation {
  private pending?: AbortController;
  private activeId: string | undefined;
  private state: NavigationState = {
    route: readWorkspaceRoute(location.pathname),
    loading: true,
    error: "",
  };
  constructor(
    private workspace: Workspace,
    private onChange: (state: NavigationState) => void,
  ) {}
  private update(state: NavigationState) {
    this.state = state;
    this.onChange(state);
  }
  private sync = () => {
    const id = this.workspace.active
      ? this.workspace.engine.document.id
      : undefined;
    if (id === this.activeId) return;
    this.activeId = id;
    if (this.pending || this.state.loading) return;
    history.pushState(null, "", workspacePath(id));
    this.update({
      route: id ? { kind: "workspace", id } : { kind: "list" },
      loading: false,
      error: "",
    });
  };
  private pop = () => {
    void this.navigate(readWorkspaceRoute(location.pathname), false);
  };
  async start() {
    const unsubscribe = this.workspace.subscribe(this.sync);
    window.addEventListener("popstate", this.pop);
    await this.workspace.init();
    await this.navigate(readWorkspaceRoute(location.pathname), false);
    return () => {
      this.pending?.abort();
      unsubscribe();
      window.removeEventListener("popstate", this.pop);
    };
  }
  async navigate(route: WorkspaceRoute, push = true) {
    this.pending?.abort();
    const controller = new AbortController();
    this.pending = controller;
    this.update({ ...this.state, loading: true, error: "" });
    try {
      if (route.kind === "missing") throw new Error("Workspace not found.");
      if (route.kind === "list") {
        if (this.workspace.active)
          await this.workspace.close(controller.signal);
      } else if (
        !this.workspace.active ||
        this.workspace.engine.document.id !== route.id
      )
        await this.workspace.open(route.id, controller.signal);
      if (controller.signal.aborted) return;
      const path = workspacePath(
        route.kind === "workspace" ? route.id : undefined,
      );
      if (push && location.pathname !== path) history.pushState(null, "", path);
      else if (location.pathname !== path) history.replaceState(null, "", path);
      this.update({ route, loading: false, error: "" });
    } catch (e) {
      if (controller.signal.aborted) return;
      const id = this.workspace.active
        ? this.workspace.engine.document.id
        : undefined;
      // A failed save/open keeps both the working copy and its matching URL.
      if (id) history.replaceState(null, "", workspacePath(id));
      this.update({
        route: id ? { kind: "workspace", id } : route,
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      if (this.pending === controller) this.pending = undefined;
    }
  }
}
