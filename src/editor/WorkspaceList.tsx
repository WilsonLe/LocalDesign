import { useEffect, useRef, useState } from "react";
import { FolderOpen, LoaderCircle, Trash2 } from "lucide-react";
import { Button } from "../components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "../components/ui/alert-dialog";
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
    [deleting, setDeleting] = useState(false),
    [pendingDelete, setPendingDelete] = useState<{
      id: string;
      name: string;
    } | null>(null),
    [deleteError, setDeleteError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const cancelDelete = useRef<HTMLButtonElement>(null);
  const deleteTrigger = useRef<HTMLButtonElement>(null);
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
  const remove = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await workspace.remove(pendingDelete.id);
      await refresh();
      setPendingDelete(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
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
                  size="icon-lg"
                  aria-label={`Delete ${d.name}`}
                  title="Delete workspace"
                  disabled={deleting || loading}
                  onClick={(e) => {
                    deleteTrigger.current = e.currentTarget;
                    setDeleteError("");
                    setPendingDelete({ id: d.id, name: d.name });
                  }}
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
      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <AlertDialogContent
          initialFocus={cancelDelete}
          finalFocus={() =>
            deleteTrigger.current?.isConnected
              ? deleteTrigger.current
              : heading.current
          }
          aria-busy={deleting}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete workspace?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            Delete “{pendingDelete?.name}” from this browser? This cannot be
            undone. Exported files are unaffected.
          </AlertDialogDescription>
          {deleteError && (
            <p role="alert" className="text-sm text-destructive break-words">
              Could not delete this workspace. {deleteError} Try again.
            </p>
          )}
          <AlertDialogFooter>
            <Button
              ref={cancelDelete}
              variant="outline"
              size="default"
              disabled={deleting}
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="default"
              disabled={deleting}
              onClick={() => void remove()}
            >
              {deleting ? "Deleting…" : "Delete workspace"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
