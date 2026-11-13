import { z } from "zod";
import { Id, requireThat, assertNotAborted } from "../core/model";
import { GuardSchema } from "../core/commands";
import { MAX_PACKAGE_BYTES } from "../core/limits";
import { fontsReady } from "../render/fonts";
import {
  exportComponentPackage,
  importComponentPackage,
  packageSummary,
  type PreparedComponentPackage,
} from "../files/component-package";
import type { Workspace } from "../storage/workspace";
import type { Artifacts } from "../files/artifacts";
export const PackageOperationsSchema = z
  .object({
    action: z
      .enum(["sources", "export", "prepare", "diff", "commit"])
      .default("sources"),
    rootIds: z.array(Id).min(1).max(500).optional(),
    originId: Id.optional(),
    version: z.number().int().min(1).optional(),
    base64: z
      .string()
      .max(Math.ceil(MAX_PACKAGE_BYTES / 3) * 4)
      .regex(/^[A-Za-z0-9+/]*={0,2}$/)
      .optional(),
    importId: Id.optional(),
    mode: z.enum(["import", "sync"]).default("import"),
    replaceLocalEdits: z.boolean().default(false),
    conflictPolicy: z.enum(["reject", "drop"]).default("reject"),
    pageId: Id.optional(),
    guard: GuardSchema.optional(),
    offset: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict();
const receipts = new WeakMap<
  Workspace,
  Map<string, { payload: string; result: unknown }>
>();
export function createPackageOperations(
  workspace: Workspace,
  artifacts: Artifacts,
  lifetime: AbortSignal,
  isBusy: () => boolean,
) {
  const engine = workspace.engine,
    pending = new Map<
      string,
      { prepared: PreparedComponentPackage; created: number }
    >();
  let saved = receipts.get(workspace);
  if (!saved) {
    saved = new Map();
    receipts.set(workspace, saved);
  }
  const cache = saved;
  lifetime.addEventListener("abort", () => pending.clear(), { once: true });
  return async (
    input: z.output<typeof PackageOperationsSchema>,
    signal: AbortSignal,
  ) => {
    const doc = engine.document;
    if (input.action === "sources")
      return {
        documentId: doc.id,
        revision: doc.revision,
        sources: doc.packageSources
          .slice(input.offset, input.offset + input.limit)
          .map((source) => ({
            originId: source.originId,
            version: source.version,
            digest: source.digest,
            componentMap: source.componentMap,
            tokenCount: Object.keys(source.tokenMap).length,
            assetCount: Object.keys(source.assetMap).length,
            fontCount: Object.keys(source.fontMap).length,
          })),
        total: doc.packageSources.length,
      };
    if (input.action === "export") {
      const blob = await exportComponentPackage(
        doc,
        input.rootIds ??
          doc.components.filter((item) => !item.deleted).map((item) => item.id),
        input.version ?? doc.revision + 1,
        input.originId ?? doc.id,
      );
      assertNotAborted(signal);
      requireThat(
        doc === engine.document,
        "STALE_REVISION",
        "The document changed during package export. Read it again.",
      );
      return artifacts.add(blob, `${doc.name}.localcomponents`, doc.revision);
    }
    if (input.action === "prepare") {
      requireThat(
        input.base64,
        "FILE_REQUIRED",
        "Supply component package bytes.",
      );
      const prepared = await importComponentPackage(
        Uint8Array.from(atob(input.base64), (c) => c.charCodeAt(0)),
      );
      assertNotAborted(signal);
      for (const [id, item] of pending)
        if (Date.now() - item.created > 15 * 60 * 1000) pending.delete(id);
      requireThat(
        pending.size < 4,
        "PACKAGE_LIMIT",
        "Finish earlier prepared packages or rediscover page tools.",
      );
      const id = crypto.randomUUID();
      pending.set(id, { prepared, created: Date.now() });
      return { importId: id, ...packageSummary(prepared) };
    }
    requireThat(
      input.guard && input.importId && input.pageId,
      "GUARD_REQUIRED",
      "Supply guard, importId and explicit destination pageId.",
    );
    const payload = JSON.stringify({ ...input, action: "commit" }),
      old = cache.get(input.guard.requestId);
    if (old) {
      requireThat(
        old.payload === payload,
        "REQUEST_ID_REUSED",
        "Package request ID was reused with changed input.",
      );
      requireThat(
        input.guard.expectedDocumentId === engine.document.id,
        "DOCUMENT_MISMATCH",
        "The active document changed.",
      );
      return old.result;
    }
    const item = pending.get(input.importId);
    requireThat(
      item && Date.now() - item.created <= 15 * 60 * 1000,
      "MISSING_PACKAGE",
      "Prepared package expired or belongs to an earlier page lifetime. Prepare it again.",
    );
    requireThat(
      !isBusy(),
      "WORKSPACE_BUSY",
      "Wait for the workspace operation.",
    );
    await fontsReady(engine.document);
    assertNotAborted(signal);
    requireThat(
      !isBusy(),
      "WORKSPACE_BUSY",
      "Wait for the workspace operation.",
    );
    const receipt = engine.edit(
      {
        ...input.guard,
        commands: [
          {
            op: "library_import",
            namespace: input.guard.requestId,
            payload: item.prepared.payload,
            originId: item.prepared.manifest.originId,
            version: item.prepared.manifest.version,
            digest: item.prepared.manifest.digest,
            mode: input.mode,
            replaceLocalEdits: input.replaceLocalEdits,
            conflictPolicy: input.conflictPolicy,
            pageId: input.pageId,
            dx: 0,
            dy: 0,
          },
        ],
      },
      input.action === "diff",
    );
    if (input.action === "commit") {
      cache.set(input.guard.requestId, { payload, result: receipt });
      if (cache.size > 256) cache.delete(cache.keys().next().value!);
      pending.delete(input.importId);
    }
    return receipt;
  };
}
