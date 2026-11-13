import { useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { NativeSelect } from "../components/ui/native-select";
import type { DesignEngine, Receipt } from "../core/engine";
import type { EditRequest } from "../core/commands";
import { type DesignDocument, uid } from "../core/model";
import { MAX_PACKAGE_BYTES } from "../core/limits";
import {
  exportComponentPackage,
  importComponentPackage,
  packageSummary,
  type PreparedComponentPackage,
} from "../files/component-package";
export function PackageResources({
  engine,
  document: doc,
  onError,
}: {
  engine: DesignEngine;
  document: DesignDocument;
  onError: (s: string) => void;
}) {
  const [rootId, setRootId] = useState(""),
    [version, setVersion] = useState(doc.revision + 1),
    [prepared, setPrepared] = useState<PreparedComponentPackage | null>(null),
    [mode, setMode] = useState<"import" | "sync">("import"),
    [replace, setReplace] = useState(false),
    [drop, setDrop] = useState(false),
    [pending, setPending] = useState<{
      request: EditRequest;
      receipt: Receipt;
    } | null>(null),
    [busy, setBusy] = useState(false);
  const attempt = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="resource-sections">
      <section>
        <h3>Export component package</h3>
        <label>
          Root component
          <NativeSelect
            aria-label="Package root component"
            value={rootId}
            onChange={(e) => setRootId(e.target.value)}
          >
            <option value="">All active components</option>
            {doc.components
              .filter((item) => !item.deleted)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </NativeSelect>
        </label>
        <label>
          Package version
          <Input
            type="number"
            min={1}
            step={1}
            value={version}
            onChange={(e) => setVersion(Number(e.target.value))}
          />
        </label>
        <Button
          disabled={busy || !doc.components.some((item) => !item.deleted)}
          onClick={() =>
            void attempt(async () => {
              const blob = await exportComponentPackage(
                doc,
                rootId
                  ? [rootId]
                  : doc.components
                      .filter((item) => !item.deleted)
                      .map((item) => item.id),
                version,
              );
              const url = URL.createObjectURL(blob),
                a = document.createElement("a");
              a.href = url;
              a.download = `${doc.name.replace(/[^\w -]/g, "_")}.localcomponents`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            })
          }
        >
          Download component package
        </Button>
      </section>
      <section>
        <h3>Import or update</h3>
        <label>
          Component package file
          <Input
            aria-label="Component package file"
            type="file"
            accept=".localcomponents"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                void attempt(async () => {
                  if (file.size > MAX_PACKAGE_BYTES)
                    throw new Error("The component package exceeds 128 MB.");
                  const result = await importComponentPackage(
                    new Uint8Array(await file.arrayBuffer()),
                  );
                  setPrepared(result);
                  setMode(
                    engine.document.packageSources.some(
                      (source) => source.originId === result.manifest.originId,
                    )
                      ? "sync"
                      : "import",
                  );
                  setPending(null);
                });
              e.target.value = "";
            }}
          />
        </label>
        {prepared && (
          <>
            <dl>
              <dt>Origin</dt>
              <dd className="resource-id">{prepared.manifest.originId}</dd>
              <dt>Version</dt>
              <dd>{prepared.manifest.version}</dd>
              <dt>Contents</dt>
              <dd>
                {prepared.payload.components.length} components ·{" "}
                {prepared.payload.assets.length} images ·{" "}
                {prepared.payload.fonts.length} licensed font faces
              </dd>
            </dl>
            <label>
              Operation
              <NativeSelect
                aria-label="Package operation"
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value as typeof mode);
                  setPending(null);
                }}
              >
                <option value="import">Import new origin</option>
                <option value="sync">Update installed origin</option>
              </NativeSelect>
            </label>
            <label className="checks">
              <Input
                type="checkbox"
                checked={replace}
                onChange={(e) => {
                  setReplace(e.target.checked);
                  setPending(null);
                }}
              />
              Replace locally edited definitions and resources
            </label>
            <label className="checks">
              <Input
                type="checkbox"
                checked={drop}
                onChange={(e) => {
                  setDrop(e.target.checked);
                  setPending(null);
                }}
              />
              Drop incompatible instance overrides
            </label>
            <Button
              disabled={busy}
              onClick={() => {
                try {
                  const request: EditRequest = {
                    ...engine.guard(),
                    commands: [
                      {
                        op: "library_import",
                        namespace: uid(),
                        payload: prepared.payload,
                        originId: prepared.manifest.originId,
                        version: prepared.manifest.version,
                        digest: prepared.manifest.digest,
                        mode,
                        replaceLocalEdits: replace,
                        conflictPolicy: drop ? "drop" : "reject",
                        pageId: engine.pageId,
                        dx: 0,
                        dy: 0,
                      },
                    ],
                  };
                  setPending({ request, receipt: engine.edit(request, true) });
                } catch (e) {
                  onError(e instanceof Error ? e.message : String(e));
                }
              }}
            >
              Review package changes
            </Button>
            {pending && (
              <div className="resource-confirm" role="status">
                <strong>
                  {pending.receipt.libraryImpact?.added.length ?? 0} definitions
                  added · {pending.receipt.libraryImpact?.updated.length ?? 0}{" "}
                  updated ·{" "}
                  {pending.receipt.componentImpact?.instanceCount ?? 0}{" "}
                  instances affected
                </strong>
                {pending.receipt.warnings.map((warning, index) => (
                  <p key={index}>{warning}</p>
                ))}
                <details>
                  <summary>Definition changes</summary>
                  {pending.receipt.libraryImpact?.changes.map((change) => (
                    <div key={change.id}>
                      <strong>{change.name}</strong>
                      <p>
                        {change.addedParts} parts added · {change.changedParts}{" "}
                        changed · {change.removedParts} removed
                        {change.propertiesChanged
                          ? " · Properties changed"
                          : ""}
                        {change.variantsChanged ? " · Variants changed" : ""}
                      </p>
                      <ul>
                        {change.parts.map((part) => (
                          <li key={part.id}>
                            {part.name}: {part.fields.join(", ")}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </details>
                <Button
                  onClick={() => {
                    try {
                      engine.edit(pending.request);
                      setPending(null);
                      setPrepared(null);
                    } catch (e) {
                      onError(e instanceof Error ? e.message : String(e));
                    }
                  }}
                >
                  Apply package changes
                </Button>
                <Button onClick={() => setPending(null)}>
                  Cancel package changes
                </Button>
              </div>
            )}
            <details>
              <summary>Source definitions</summary>
              <ul>
                {packageSummary(prepared).components.map((item) => (
                  <li key={item.id}>
                    {item.name} · r{item.revision} · {item.parts} parts
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </section>
      <section>
        <h3>Installed origins</h3>
        <ul className="resource-records">
          {doc.packageSources.map((source) => (
            <li key={source.originId}>
              <span className="resource-id">
                {source.originId} · v{source.version} ·{" "}
                {Object.keys(source.componentMap).length} components
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
