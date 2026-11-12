import { useEffect, useRef, useState } from "react";
import { FolderOpen, LoaderCircle, Trash2 } from "lucide-react";
import { Button } from "../components/ui/button";
import type { Workspace } from "../storage/workspace";
import { workspacePath } from "./workspaceRoute";

export function WorkspaceList({
  workspace,
  loading,
  error,
  onOpen,
  onRetry,
  onList,
}: {
  workspace: Workspace;
  loading: boolean;
  error: string;
  onOpen: (id: string) => void;
  onRetry: () => void;
  onList: () => void;
}) {
  const [documents, setDocuments] = useState<Awaited<
      ReturnType<Workspace["list"]>
    > | null>(null),
    [listError, setListError] = useState(""),
    [deleting, setDeleting] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const refresh = async () => {
    setListError("");
    try {
      setDocuments(await workspace.list());
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    if (loading) return;
    let disposed = false;
    workspace
      .list()
      .then((docs) => {
        if (!disposed) {
          setDocuments(docs);
          setListError("");
        }
      })
      .catch((e: unknown) => {
        if (!disposed) setListError(e instanceof Error ? e.message : String(e));
      });
    heading.current?.focus();
    const changed = () => {
      void refresh();
    };
    window.addEventListener("focus", changed);
    return () => {
      disposed = true;
      window.removeEventListener("focus", changed);
    };
  }, [workspace, loading]);
  const remove = async (id: string, name: string) => {
    if (
      !confirm(
        `Delete “${name}” from this browser? Exported files are unaffected.`,
      )
    )
      return;
    setDeleting(true);
    try {
      await workspace.remove(id);
      await refresh();
      heading.current?.focus();
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };
  return (
    <main className="workspace-page" aria-busy={loading || deleting}>
      <div className="workspace-content">
        <h1 ref={heading} tabIndex={-1}>
          Workspaces
        </h1>
        {error && (
          <div className="workspace-error" role="alert">
            <span>{error}</span>
            <Button onClick={onRetry}>Retry opening</Button>
            <Button onClick={onList}>Back to workspaces</Button>
          </div>
        )}
        {listError && (
          <div className="workspace-error" role="alert">
            <span>Could not load workspaces. {listError}</span>
            <Button onClick={() => void workspace.init().then(refresh)}>
              Retry
            </Button>
          </div>
        )}
        {loading || (!documents && !listError) ? (
          <div className="workspace-empty" role="status">
            <LoaderCircle size={24} />
            Loading workspaces…
          </div>
        ) : documents?.length ? (
          <ul className="workspace-list" aria-label="Saved workspaces">
            {documents.map((d) => (
              <li className="workspace-item" key={d.id}>
                <a
                  href={workspacePath(d.id)}
                  onClick={(e) => {
                    if (
                      e.button ||
                      e.metaKey ||
                      e.ctrlKey ||
                      e.shiftKey ||
                      e.altKey
                    )
                      return;
                    e.preventDefault();
                    onOpen(d.id);
                  }}
                >
                  <FolderOpen size={20} />
                  <strong title={d.name}>{d.name}</strong>
                </a>
                <Button
                  aria-label={`Delete ${d.name}`}
                  title="Delete workspace"
                  disabled={deleting || loading}
                  onClick={() => void remove(d.id, d.name)}
                >
                  <Trash2 size={16} />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          !listError && (
            <div className="workspace-empty">
              <FolderOpen size={32} />
              <h2>No workspaces yet</h2>
            </div>
          )
        )}
      </div>
    </main>
  );
}
