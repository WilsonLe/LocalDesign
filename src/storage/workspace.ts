import { openDB } from "idb";
import {
  assertNotAborted,
  blankDocument,
  DesignError,
  uid,
  requireThat,
  validateDocument,
  type DesignDocument,
} from "../core/model";
import { DesignEngine } from "../core/engine";
import { fontsReady } from "../render/fonts";
const db = () =>
  openDB("localdesign-v1", 1, {
    upgrade(db) {
      db.createObjectStore("documents", { keyPath: "id" });
      db.createObjectStore("settings");
    },
  });
export class Workspace {
  engine: DesignEngine;
  initialized = false;
  status: "loading" | "saving" | "saved" | "error" = "loading";
  error = "";
  private saveChain = Promise.resolve();
  private pendingSaves = 0;
  private savedVersion = -1;
  private docId = "";
  private savedBases = new Map<string, string>();
  private listeners = new Set<() => void>();
  constructor(engine = new DesignEngine()) {
    this.engine = engine;
    engine.subscribe(() => {
      const d = engine.document;
      if (d.revision !== this.savedVersion || d.id !== this.docId) {
        this.savedVersion = d.revision;
        this.docId = d.id;
        this.queueSave(structuredClone(d));
      }
    });
  }
  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private emit() {
    for (const fn of this.listeners) fn();
  }
  async init() {
    try {
      const store = await db(),
        active = await store.get("settings", "active"),
        saved = active ? await store.get("documents", active) : null;
      if (saved) {
        const next = validateDocument(saved);
        await fontsReady(next);
        this.savedBases.set(saved.id, JSON.stringify(saved));
        this.engine.replace(next);
      } else await this.persist(this.engine.document);
      this.status = "saved";
    } catch (e) {
      this.fail(e);
    } finally {
      this.initialized = true;
      this.savedVersion = this.engine.document.revision;
      this.docId = this.engine.document.id;
      this.emit();
    }
  }
  private fail(e: unknown) {
    this.status = "error";
    this.error = e instanceof Error ? e.message : String(e);
    this.emit();
  }
  private async persist(d: DesignDocument) {
    const store = await db();
    const tx = store.transaction(["documents", "settings"], "readwrite");
    try {
      const existing = await tx.objectStore("documents").get(d.id);
      const serialized = JSON.stringify(d);
      if (
        existing &&
        JSON.stringify(existing) !== this.savedBases.get(d.id) &&
        JSON.stringify(existing) !== serialized
      ) {
        throw new DesignError(
          "STORAGE_CONFLICT",
          "Another tab changed this design. Export a backup or save a separate copy; the other tab’s saved work was preserved.",
        );
      }
      // A document deleted in another tab must not be silently resurrected.
      if (!existing && this.savedBases.has(d.id))
        throw new DesignError(
          "STORAGE_CONFLICT",
          "This saved design was removed in another tab. Export a backup or save a separate copy.",
        );
      await tx.objectStore("documents").put(d);
      await tx.objectStore("settings").put(d.id, "active");
      await tx.done;
      this.savedBases.set(d.id, serialized);
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* A finished transaction may no longer be aborted. */
      }
      await tx.done.catch(() => {});
      throw error;
    }
  }
  private queueSave(d: DesignDocument) {
    this.pendingSaves++;
    this.status = "saving";
    this.emit();
    this.saveChain = this.saveChain.then(async () => {
      try {
        await this.persist(d);
        this.pendingSaves--;
        this.status = this.pendingSaves ? "saving" : "saved";
        this.error = "";
        this.emit();
      } catch (e) {
        this.pendingSaves--;
        this.fail(e);
      }
    });
  }
  async flush() {
    let current;
    do {
      current = this.saveChain;
      await current;
    } while (current !== this.saveChain);
    requireThat(
      this.status !== "error",
      "STORAGE_FAILED",
      "Local save failed. Export a .localdesign backup before switching documents.",
    );
  }
  async saveCopy(signal?: AbortSignal) {
    assertNotAborted(signal);
    const copy = structuredClone(this.engine.document);
    copy.id = uid();
    copy.revision = 0;
    copy.name = (copy.name + " copy").slice(0, 200);
    this.engine.replace(copy);
    await this.flush();
    return this.engine.document;
  }
  async retry() {
    this.queueSave(structuredClone(this.engine.document));
    await this.flush();
  }
  async list() {
    const store = await db();
    return (await store.getAll("documents")).map((d: DesignDocument) => ({
      id: d.id,
      name: d.name,
      revision: d.revision,
      pages: d.pages.length,
      nodes: d.nodes.length,
    }));
  }
  async create(name?: string, signal?: AbortSignal) {
    const expected = this.engine.document;
    await this.flush();
    requireThat(
      this.engine.document === expected,
      "STALE_REVISION",
      "Document changed while saving. Retry the workspace action.",
    );
    assertNotAborted(signal);
    this.engine.replace(blankDocument(name));
    await this.flush();
    return this.engine.document;
  }
  async open(id: string, signal?: AbortSignal) {
    const expected = this.engine.document;
    await this.flush();
    const store = await db(),
      d = await store.get("documents", id);
    requireThat(d, "MISSING_DOCUMENT", "Unknown document.");
    const next = validateDocument(d);
    await fontsReady(next);
    requireThat(
      this.engine.document === expected,
      "STALE_REVISION",
      "Document changed while opening. Retry the workspace action.",
    );
    requireThat(d, "MISSING_DOCUMENT", "Unknown document.");
    assertNotAborted(signal);
    this.savedBases.set(d.id, JSON.stringify(d));
    this.engine.replace(next);
    await this.flush();
    return this.engine.document;
  }
  async import(d: DesignDocument, signal?: AbortSignal) {
    const next = validateDocument(d),
      expected = this.engine.document;
    await this.flush();
    await fontsReady(next);
    requireThat(
      this.engine.document === expected,
      "STALE_REVISION",
      "Document changed while importing. Retry the import.",
    );
    assertNotAborted(signal);
    this.engine.replace(next);
    await this.flush();
    return next;
  }
  async remove(id: string, signal?: AbortSignal) {
    const expected = this.engine.document;
    requireThat(
      id !== this.engine.document.id,
      "ACTIVE_DOCUMENT",
      "Open another document before deleting this one.",
    );
    await this.flush();
    const store = await db();
    assertNotAborted(signal);
    requireThat(
      this.engine.document === expected,
      "STALE_REVISION",
      "Document changed while deleting. Retry the workspace action.",
    );
    requireThat(
      id !== this.engine.document.id,
      "ACTIVE_DOCUMENT",
      "Open another document before deleting this one.",
    );
    await store.delete("documents", id);
  }
}
